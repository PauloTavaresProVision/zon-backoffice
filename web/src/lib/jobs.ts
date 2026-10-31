import { eq, lt } from "drizzle-orm";
import { db, pool, schema } from "@/lib/db";

export type JobResult = { ran: boolean; ok?: boolean; summary?: string };

export const JOBS = {
  ixcSync: { name: "ixc.sync", label: "Sincronizar o IXC", desc: "Clientes, contratos e títulos em aberto (só leitura)" },
  cycle: { name: "cycle.run", label: "Referências e avisos por SMS", desc: "Uma referência por título a vencer; SMS a 7, 3 e 1 dia, das 8h às 20h" },
  confirm: { name: "appypay.check", label: "Confirmar pagamentos na AppyPay", desc: "Verifica as referências por pagar; o webhook confirma logo que o cliente paga" },
  settle: { name: "ixc.settle", label: "Baixas no IXC", desc: "Liquida o título pago e cria o do período seguinte" },
  issue: { name: "officegest.issue", label: "Emitir faturas no OfficeGest", desc: "Fatura-recibo para cada pagamento confirmado" },
  sync: { name: "officegest.sync", label: "Sincronizar faturas do OfficeGest", desc: "Traz para a conta do cliente todas as faturas, também as emitidas fora do backoffice" },
  expire: { name: "payments.expire", label: "Expirar referências", desc: "Marca como expiradas as referências por pagar depois da validade" },
} as const;

/**
 * Corre uma tarefa com um bloqueio no Postgres (um só worker de cada vez) e regista o resultado.
 * Se outro processo já a estiver a correr, não faz nada.
 */
export async function runJob(job: string, fn: () => Promise<string>): Promise<JobResult> {
  const lockClient = await pool().connect();
  try {
    const { rows } = await lockClient.query<{ ok: boolean }>("select pg_try_advisory_lock(hashtext($1)) as ok", [job]);
    if (!rows[0]?.ok) return { ran: false };
    const [run] = await db().insert(schema.jobRuns).values({ job }).returning({ id: schema.jobRuns.id });
    try {
      const summary = await fn();
      await db().update(schema.jobRuns).set({ finishedAt: new Date(), ok: true, summary }).where(eq(schema.jobRuns.id, run!.id));
      return { ran: true, ok: true, summary };
    } catch (err) {
      const summary = err instanceof Error ? err.message : String(err);
      await db().update(schema.jobRuns).set({ finishedAt: new Date(), ok: false, summary: summary.slice(0, 500) }).where(eq(schema.jobRuns.id, run!.id));
      return { ran: true, ok: false, summary };
    } finally {
      await lockClient.query("select pg_advisory_unlock(hashtext($1))", [job]);
    }
  } finally {
    lockClient.release();
  }
}

export async function pruneJobRuns(days = 30): Promise<void> {
  await db().delete(schema.jobRuns).where(lt(schema.jobRuns.startedAt, new Date(Date.now() - days * 86_400_000)));
}
