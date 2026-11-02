import { eq } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { db, schema } from "@/lib/db";
import { smsConfig } from "@/lib/env";
import { refFmt } from "@/lib/format";
import type { SmsKind } from "@/lib/cycle/rules";
import { angolaMobile } from "@/lib/phone";
import { wesenderSend } from "./wesender";

export { SmsError } from "./wesender";

export type SmsInput = {
  customerId: number | null;
  paymentId?: number | null;
  kind: SmsKind;
  phone: string | null;
  body: string;
  reference?: string | null;
  userId?: number | null;
};

export type SmsOutcome = { ok: boolean; error?: string; reply?: string; test: boolean; phone: string | null };

const LABEL: Record<string, string> = {
  stage_7: "SMS com a referência",
  stage_3: "Lembrete (3 dias) com a referência",
  stage_1: "Último aviso com a referência",
  paid: "SMS de pagamento recebido",
  manual: "SMS reenviada com a referência",
};

/**
 * Envia e regista uma SMS. Com SMS_TEST_PHONE definido, vai para esse número e fica marcada como teste.
 * Nunca lança: o resultado fica no histórico e no estado da referência.
 */
export async function sendSms(input: SmsInput): Promise<SmsOutcome> {
  const cfg = smsConfig();
  const real = angolaMobile(input.phone);
  const test = !!cfg?.testPhone;
  const dest = cfg?.testPhone ? angolaMobile(cfg.testPhone) : real;
  let error: string | undefined;
  let reply: string | undefined;

  if (!cfg) error = "A WeSender não está configurada.";
  else if (!real) error = "O cliente não tem um telemóvel válido.";
  else if (!dest) error = "SMS_TEST_PHONE não é um telemóvel válido.";
  else {
    try {
      reply = await wesenderSend(cfg, dest, input.body);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  await db().insert(schema.smsMessages).values({
    customerId: input.customerId,
    paymentId: input.paymentId ?? null,
    kind: input.kind,
    phone: dest ?? input.phone ?? "",
    body: input.body,
    status: error ? "failed" : "sent",
    // A WeSender não devolve id da mensagem
    providerId: null,
    error: error ?? null,
    test,
    userId: input.userId ?? null,
  });
  if (input.paymentId && input.kind !== "paid") {
    await db().update(schema.payments).set({ sms: error ? "failed" : "sent" }).where(eq(schema.payments.id, input.paymentId));
  }
  // Sem cliente nem referência: é a SMS de teste das Definições
  const label = input.customerId === null && !input.reference ? "SMS de teste" : (LABEL[input.kind] ?? "SMS") + (input.reference ? ` **${refFmt(input.reference)}**` : "");
  await logActivity({
    kind: error ? "sms.failed" : "sms.sent",
    customerId: input.customerId,
    userId: input.userId ?? null,
    message: error ? `${label} falhou: ${error}` : `${label} enviada${test ? " (para o número de testes)" : ""}${reply ? ` · WeSender: ${reply}` : ""}`,
    meta: { paymentId: input.paymentId ?? null, kind: input.kind },
  });
  return { ok: !error, error, reply, test, phone: dest };
}
