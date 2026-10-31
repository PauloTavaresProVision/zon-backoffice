// Tarefas partilhadas pelo worker e pelo botão "Executar agora" das Definições.
import { and, eq, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isoDay } from "@/lib/format";
import { JOBS } from "@/lib/jobs";
import { issuePendingInvoices } from "@/lib/officegest/issue";
import { syncAllInvoices } from "@/lib/officegest/sync";

const BATCH = 25;

/** Esvazia a fila de faturas por emitir em lotes; cada lote tem a sua reserva. */
export async function issueInvoiceBacklog(shouldStop: () => boolean = () => false): Promise<string> {
  let issued = 0;
  let failed = 0;
  for (let i = 0; i < 40 && !shouldStop(); i++) {
    const res = await issuePendingInvoices({ limit: BATCH });
    if (res.disabled) return res.disabled;
    issued += res.issued.length;
    failed += res.failed;
    if (res.issued.length + res.failed < BATCH) break;
  }
  if (failed && !issued) throw new Error(`${failed} faturas falharam; nova tentativa automática`);
  return `${issued} faturas emitidas` + (failed ? ` · ${failed} falharam e vão ser repetidas` : "");
}

export async function expireReferences(): Promise<string> {
  const rows = await db().update(schema.payments).set({ status: "expired" })
    .where(and(eq(schema.payments.status, "pending"), lt(schema.payments.dueDate, isoDay())))
    .returning({ id: schema.payments.id });
  return `${rows.length} referências expiradas`;
}

export type JobKey = keyof typeof JOBS;

export const TASKS: Record<JobKey, () => Promise<string>> = {
  issue: () => issueInvoiceBacklog(),
  sync: syncAllInvoices,
  expire: expireReferences,
};
