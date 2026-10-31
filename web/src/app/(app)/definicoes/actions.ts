"use server";

import { revalidatePath } from "next/cache";
import { attempt, type ActionResult } from "@/lib/action";
import { requireRole } from "@/lib/auth/session";
import { JOBS, runJob } from "@/lib/jobs";
import { officegest } from "@/lib/officegest";
import { TASKS, type JobKey } from "@/lib/tasks";

export async function testOfficegest(): Promise<ActionResult> {
  return attempt(async () => {
    await requireRole("admin");
    const og = officegest();
    if (!og) throw new Error("O OfficeGest não está configurado no .env do servidor.");
    const types = await og.client.listDocumentTypes();
    return `Ligação ao OfficeGest OK · ${types.length} tipos de documento`;
  });
}

export async function runJobNow(key: string): Promise<ActionResult> {
  return attempt(async () => {
    await requireRole("admin");
    if (!Object.hasOwn(TASKS, key)) throw new Error("Tarefa desconhecida.");
    const k = key as JobKey;
    const r = await runJob(JOBS[k].name, TASKS[k]);
    revalidatePath("/definicoes");
    if (!r.ran) return "Esta tarefa já está a correr no worker. Tente daqui a pouco.";
    if (!r.ok) throw new Error(r.summary ?? "A tarefa falhou.");
    return r.summary ?? "Feito";
  });
}
