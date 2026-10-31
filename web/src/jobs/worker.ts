// Tarefas automáticas: emitir faturas, sincronizar com o OfficeGest e expirar referências.
import { desc, eq } from "drizzle-orm";
import { db, pool, schema } from "@/lib/db";
import { JOBS, pruneJobRuns, runJob } from "@/lib/jobs";
import { officegest } from "@/lib/officegest";
import { syncAllInvoices } from "@/lib/officegest/sync";
import { expireReferences, issueInvoiceBacklog } from "@/lib/tasks";

const TICK_MS = 60_000;
const EXPIRE_EVERY_MIN = 10;

let stopping = false;
let wake: (() => void) | null = null;

const log = (msg: string) => console.log(`${new Date().toISOString()} [worker] ${msg}`);

async function minutesSinceLastRun(job: string): Promise<number> {
  const [last] = await db().select({ at: schema.jobRuns.startedAt }).from(schema.jobRuns)
    .where(eq(schema.jobRuns.job, job)).orderBy(desc(schema.jobRuns.startedAt)).limit(1);
  return last ? (Date.now() - last.at.getTime()) / 60_000 : Infinity;
}

async function hasInvoiceBacklog(issueFrom: string): Promise<boolean> {
  const { rows } = await pool().query(`
    select 1 from payments p
    where p.status = 'paid' and p.paid_at >= ($1::date)::timestamp at time zone 'Africa/Luanda'
      and not exists (select 1 from invoices i where i.payment_id = p.id)
      and (p.invoice_next_attempt_at is null or p.invoice_next_attempt_at <= now())
      and (p.invoice_claimed_until is null or p.invoice_claimed_until < now())
    limit 1`, [issueFrom]);
  return rows.length > 0;
}

async function issue(): Promise<void> {
  const og = officegest();
  if (!og?.cfg.issueFrom || !(await hasInvoiceBacklog(og.cfg.issueFrom))) return;
  const r = await runJob(JOBS.issue.name, () => issueInvoiceBacklog(() => stopping));
  if (r.ran) log(`emitir faturas: ${r.summary}`);
}

async function sync(): Promise<void> {
  const og = officegest();
  if (!og || (await minutesSinceLastRun(JOBS.sync.name)) < og.cfg.syncMinutes) return;
  const r = await runJob(JOBS.sync.name, syncAllInvoices);
  if (r.ran) log(`sincronizar faturas: ${r.summary}`);
}

async function expire(): Promise<void> {
  if ((await minutesSinceLastRun(JOBS.expire.name)) < EXPIRE_EVERY_MIN) return;
  const r = await runJob(JOBS.expire.name, expireReferences);
  if (r.ran && !r.ok) log(`expirar referências: ${r.summary}`);
}

async function tick(): Promise<void> {
  for (const step of [issue, sync, expire]) {
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
  log(og
    ? `OfficeGest em ${new URL(og.cfg.url).host}; emissão ${og.cfg.issueFrom ? `a partir de ${og.cfg.issueFrom}` : "desligada"}; sincronização a cada ${og.cfg.syncMinutes} min`
    : "OfficeGest por configurar: só corre a expiração de referências");
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
