"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { attempt, positiveId, type ActionResult } from "@/lib/action";
import { appypay } from "@/lib/appypay";
import { requireRole } from "@/lib/auth/session";
import { createTestReference, lookupTestReference } from "@/lib/cycle/test-reference";
import { db, schema } from "@/lib/db";
import { env, smsConfig } from "@/lib/env";
import { kz, refFmt } from "@/lib/format";
import { ixc } from "@/lib/ixc";
import { JOBS, runJob } from "@/lib/jobs";
import { officegest } from "@/lib/officegest";
import { sendSms } from "@/lib/sms";
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

export async function testIxc(): Promise<ActionResult> {
  return attempt(async () => {
    await requireRole("admin");
    const x = ixc();
    if (!x) throw new Error("O IXC não está configurado no .env do servidor.");
    const { total } = await x.client.listPage("cliente", { qtype: "cliente.id", query: "0", oper: ">", rp: 1 });
    return `Ligação ao IXC OK · ${total} clientes`;
  });
}

export async function testAppypay(): Promise<ActionResult> {
  return attempt(async () => {
    await requireRole("admin");
    const a = appypay();
    if (!a) throw new Error("A AppyPay não está configurada no .env do servidor.");
    await a.client.ping();
    return "Ligação à AppyPay OK · credenciais aceites";
  });
}

/** Referência de 100 Kz sem cliente, para pagar no Multicaixa e ver a notificação da AppyPay chegar. */
export async function createAppypayTest(): Promise<ActionResult> {
  return attempt(async () => {
    const user = await requireRole("admin");
    const t = await createTestReference(user.id);
    revalidatePath("/definicoes");
    return `Referência de teste criada · entidade ${t.entity} · referência ${refFmt(t.reference)} · ${kz(t.amountKz)}`;
  });
}

export async function lookupAppypayTest(testId: number): Promise<ActionResult> {
  return attempt(async () => {
    await requireRole("admin");
    const msg = await lookupTestReference(positiveId(testId));
    revalidatePath("/definicoes");
    return msg;
  });
}

/** Só desenvolvimento: paga a referência de teste na AppyPay simulada, que chama o webhook. */
export async function simulateAppypayTest(testId: number): Promise<ActionResult> {
  return attempt(async () => {
    await requireRole("admin");
    const mocks = env().DEV_MOCKS_URL?.replace(/\/+$/, "");
    if (!mocks) throw new Error("Só disponível com os simuladores de desenvolvimento.");
    const [t] = await db().select().from(schema.appypayTests).where(eq(schema.appypayTests.id, positiveId(testId))).limit(1);
    if (!t || t.status !== "pending") throw new Error("Esta referência já não está por pagar.");
    const res = await fetch(`${mocks}/__dev/appypay/pay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reference: t.reference }),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { message?: string; webhook?: string } | null;
    if (!res?.ok) throw new Error(body?.message ?? "O simulador não respondeu.");
    revalidatePath("/definicoes");
    return `Pagamento simulado · webhook: ${body?.webhook ?? "sem resposta"}`;
  });
}

/** Só para o número de testes: nunca envia a clientes. */
export async function testWesender(): Promise<ActionResult> {
  return attempt(async () => {
    const user = await requireRole("admin");
    const cfg = smsConfig();
    if (!cfg) throw new Error("A WeSender não está configurada no .env do servidor.");
    if (!cfg.testPhone) throw new Error("Defina SMS_TEST_PHONE no servidor para enviar uma SMS de teste.");
    const r = await sendSms({ customerId: null, kind: "manual", phone: cfg.testPhone, body: "Zon Backoffice: SMS de teste. Pode ignorar.", userId: user.id });
    if (!r.ok) throw new Error(`A SMS falhou: ${r.error}`);
    return `SMS de teste enviada para ${r.phone}${r.reply ? ` · WeSender: ${r.reply}` : ""}`;
  });
}

export async function runJobNow(key: string): Promise<ActionResult> {
  return attempt(async () => {
    await requireRole("admin");
    if (!Object.hasOwn(TASKS, key)) throw new Error("Tarefa desconhecida.");
    const k = key as JobKey;
    const r = await runJob(JOBS[k].name, TASKS[k]);
    revalidatePath("/definicoes");
    revalidatePath("/cobranca");
    if (!r.ran) return "Esta tarefa já está a correr no worker. Tente daqui a pouco.";
    if (!r.ok) throw new Error(r.summary ?? "A tarefa falhou.");
    return r.summary ?? "Feito";
  });
}
