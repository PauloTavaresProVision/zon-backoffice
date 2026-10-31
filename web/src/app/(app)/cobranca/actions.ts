"use server";

import { revalidatePath } from "next/cache";
import { attempt, type ActionResult } from "@/lib/action";
import { requireRole } from "@/lib/auth/session";
import { retrySettleNow, settlePaidInIxc } from "@/lib/cycle/settle";
import { JOBS, runJob } from "@/lib/jobs";

/** Repete já as baixas no IXC que falharam, sem esperar pela próxima tentativa automática. */
export async function retrySettle(): Promise<ActionResult> {
  return attempt(async () => {
    await requireRole("operador");
    const ids = await retrySettleNow();
    if (!ids.length) return "Não há baixas por repetir";
    const r = await runJob(JOBS.settle.name, () => settlePaidInIxc({ onlyIds: ids }));
    revalidatePath("/cobranca");
    if (!r.ran) return "As baixas já estão a correr no worker. Veja daqui a pouco.";
    if (!r.ok) throw new Error(r.summary ?? "As baixas falharam.");
    return r.summary ?? "Feito";
  });
}
