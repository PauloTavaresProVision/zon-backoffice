"use server";

import { revalidatePath } from "next/cache";
import { attempt, type ActionResult } from "@/lib/action";
import { requireRole } from "@/lib/auth/session";
import { issuePendingInvoices, retryFailedNow } from "@/lib/officegest/issue";

const MAX_NOW = 50;

/** Botão "Repetir agora": volta a pedir ao OfficeGest as faturas que falharam, sem esperar pela próxima tentativa. */
export async function retryInvoices(): Promise<ActionResult> {
  return attempt(async () => {
    await requireRole("operador");
    const ids = await retryFailedNow();
    if (!ids.length) return "Não há faturas por repetir.";
    const r = await issuePendingInvoices({ onlyIds: ids, limit: Math.min(ids.length, MAX_NOW) });
    if (r.disabled) throw new Error(r.disabled);
    revalidatePath("/pagamentos");
    revalidatePath("/dashboard");
    if (r.failed && !r.issued.length) throw new Error(`O OfficeGest continua sem responder (${r.failed} por emitir). Fica para a próxima tentativa automática.`);
    const left = ids.length - r.issued.length;
    return `${r.issued.length} fatura${r.issued.length === 1 ? "" : "s"} emitida${r.issued.length === 1 ? "" : "s"}` + (left ? ` · ${left} ainda por emitir` : "");
  });
}
