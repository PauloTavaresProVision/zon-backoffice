// Tarefas automáticas: ciclo de cobrança (IXC, AppyPay, SMS), faturas no OfficeGest e expiração de referências.
import { desc, eq } from "drizzle-orm";
import { appypay } from "@/lib/appypay";
import { db, pool, schema } from "@/lib/db";
import { cycleMode } from "@/lib/env";
import { ixc } from "@/lib/ixc";
import { JOBS, pruneJobRuns, runJob } from "@/lib/jobs";
import { officegest } from "@/lib/officegest";
import { syncAllInvoices } from "@/lib/officegest/sync";
import { TASKS, issueInvoiceBacklog } from "@/lib/tasks";

const TICK_MS = 60_000;
const EVERY_MIN = { cycle: 15, confirm: 10, expire: 10 } as const;

let stopping = false;
let wake: (() => void) | null = null;

const log = (msg: string) => console.log(`${new Date().toISOString()} [worker] ${msg}`);

async function minutesSinceLastRun(job: string): Promise<number> {
  const [last] = await db().select({ at: schema.jobRuns.startedAt }).from(schema.jobRuns)
    .where(eq(schema.jobRuns.job, job)).orderBy(desc(schema.jobRuns.startedAt)).limit(1);
  return last ? (Date.now() - last.at.getTime()) / 60_000 : Infinity;
}

async function hasBacklog(query: string, params: unknown[] = []): Promise<boolean> {
  const { rows } = await pool().query(`${query} limit 1`, params);
  return rows.length > 0;
}

/** Corre uma tarefa e escreve no registo; `quiet` só regista falhas. */
async function run(key: keyof typeof JOBS, fn: () => Promise<string>, quiet = false): Promise<void> {
  const r = await runJob(JOBS[key].name, fn);
  if (r.ran && (!quiet || !r.ok)) log(`${JOBS[key].label}: ${r.summary}`);
}

async function ixcSync(): Promise<void> {
  const x = ixc();
  if (!x || cycleMode() === "desligado" || (await minutesSinceLastRun(JOBS.ixcSync.name)) < x.cfg.syncMinutes) return;
  await run("ixcSync", TASKS.ixcSync);
}

async function cycle(): Promise<void> {
  if (cycleMode() === "desligado" || !ixc() || (await minutesSinceLastRun(JOBS.cycle.name)) < EVERY_MIN.cycle) return;
  // Sem uma sincronização bem-sucedida não há títulos para trabalhar
  if (!(await hasBacklog("select 1 from job_runs where job = $1 and ok", [JOBS.ixcSync.name]))) return;
  await run("cycle", TASKS.cycle);
}

async function confirm(): Promise<void> {
  if (!appypay() || (await minutesSinceLastRun(JOBS.confirm.name)) < EVERY_MIN.confirm) return;
  if (!(await hasBacklog(`select 1 from payments where status = 'pending' and appypay_id is not null
    union all select 1 from appypay_tests where status = 'pending'`))) return;
  await run("confirm", TASKS.confirm, true);
}

async function settle(): Promise<void> {
  if (cycleMode() !== "ativo" || !ixc()) return;
  const due = await hasBacklog(`select 1 from payments where status = 'paid' and ixc_receivable_id is not null and ixc_settled_at is null
    and (ixc_settle_next_at is null or ixc_settle_next_at <= now()) and (ixc_settle_claimed_until is null or ixc_settle_claimed_until < now())`);
  if (due) await run("settle", TASKS.settle);
}

async function issue(): Promise<void> {
  const og = officegest();
  if (!og?.cfg.issueFrom) return;
  const due = await hasBacklog(`select 1 from payments p
    where p.status = 'paid' and p.paid_at >= ($1::date)::timestamp at time zone 'Africa/Luanda'
      and not exists (select 1 from invoices i where i.payment_id = p.id)
      and (p.invoice_next_attempt_at is null or p.invoice_next_attempt_at <= now())
      and (p.invoice_claimed_until is null or p.invoice_claimed_until < now())`, [og.cfg.issueFrom]);
  if (due) await run("issue", () => issueInvoiceBacklog(() => stopping));
}

async function sync(): Promise<void> {
  const og = officegest();
  if (!og || (await minutesSinceLastRun(JOBS.sync.name)) < og.cfg.syncMinutes) return;
  await run("sync", syncAllInvoices);
}

async function expire(): Promise<void> {
  if ((await minutesSinceLastRun(JOBS.expire.name)) < EVERY_MIN.expire) return;
  await run("expire", TASKS.expire, true);
}

async function tick(): Promise<void> {
  // Primeiro o que mexe com dinheiro já recebido; depois a sincronização e o ciclo
  for (const step of [confirm, settle, issue, ixcSync, cycle, sync, expire]) {
    if (stopping) return;
    try {
      await step();
    } catch (err) {
      log(`erro em ${step.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function main(): Promise<void> {
  const og = officegest();
  const x = ixc();
  log(`ciclo de cobrança: ${cycleMode()}; IXC ${x ? new URL(x.cfg.url).host : "por configurar"}; AppyPay ${appypay() ? "configurada" : "por configurar"}`);
  log(og
    ? `OfficeGest em ${new URL(og.cfg.url).host}; emissão ${og.cfg.issueFrom ? `a partir de ${og.cfg.issueFrom}` : "desligada"}; sincronização a cada ${og.cfg.syncMinutes} min`
    : "OfficeGest por configurar");
  await pruneJobRuns(14);
  let lastPrune = Date.now();
  while (!stopping) {
    await tick();
    if (Date.now() - lastPrune > 86_400_000) {
      await pruneJobRuns(14).catch(() => undefined);
      lastPrune = Date.now();
    }
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, TICK_MS);
      wake = () => { clearTimeout(t); resolve(); };
    });
  }
  await pool().end();
  log("parado");
}

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    log(`${sig}: a terminar`);
    stopping = true;
    wake?.();
  });
}

main().catch((err) => {
  console.error("[worker] falhou:", err);
  process.exit(1);
});
