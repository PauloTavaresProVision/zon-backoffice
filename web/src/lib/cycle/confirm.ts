// Confirmação de pagamentos na AppyPay: pelo webhook e por verificação periódica.
import { and, asc, eq, gte, inArray, isNotNull, ne, notLike, or, sql } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { appypay, isPaidStatus, type AppyPayCharge } from "@/lib/appypay";
import { db, schema } from "@/lib/db";
import { kz, monthLabel, refFmt } from "@/lib/format";
import { parseProviderDate } from "./rules";

/** Pagamentos expirados há menos disto ainda são verificados: o cliente pode ter pago no limite. */
const LATE_CHECK_DAYS = 30;

/** Prefixo do appypayId quando a AppyPay criou a referência sem devolver o id do pagamento. */
export const NO_ID = "sem-id:";

export type ConfirmOutcome = "paid" | "already" | "not_paid" | "amount_mismatch" | "unknown";

/**
 * Dá a referência como paga se a cobrança na AppyPay estiver paga e com o valor certo.
 * A atualização é condicional: só um processo a consegue fazer, os outros recebem "already".
 */
export async function applyCharge(paymentId: number, charge: AppyPayCharge): Promise<ConfirmOutcome> {
  if (!isPaidStatus(charge.status)) return "not_paid";
  const [p] = await db().select().from(schema.payments).where(eq(schema.payments.id, paymentId)).limit(1);
  if (!p) return "unknown";
  if (p.status === "paid") return "already";
  // A cobrança tem de ser desta referência (o id pode ter vindo de uma notificação)
  const chargeRef = charge.referenceNumber?.replace(/\D/g, "");
  if (chargeRef && chargeRef !== p.reference) return "unknown";
  if (Math.abs(charge.amount - p.amountKz) > 1) {
    await logActivity({
      kind: "payment.mismatch",
      customerId: p.customerId,
      message: `A AppyPay indica **${kz(charge.amount)}** pagos na referência **${refFmt(p.reference)}**, mas eram **${kz(p.amountKz)}**. Verificar à mão.`,
      meta: { paymentId: p.id, chargeId: charge.id },
    });
    return "amount_mismatch";
  }
  const paidAt = parseProviderDate(charge.providerPaidAt) ?? parseProviderDate(charge.updatedAt) ?? new Date();
  const [done] = await db().update(schema.payments)
    .set({
      status: "paid", paidAt, paidAmountKz: Math.round(charge.amount), appypayCheckedAt: new Date(),
      appypayId: !p.appypayId || p.appypayId.startsWith(NO_ID) ? charge.id || p.appypayId : p.appypayId,
    })
    .where(and(eq(schema.payments.id, p.id), inArray(schema.payments.status, ["pending", "expired"])))
    .returning({ id: schema.payments.id });
  if (!done) return "already";

  if (p.ixcReceivableId) await samePeriodCleanup(p);
  await db().update(schema.customers).set({
    lastPaymentAt: sql`greatest(${schema.customers.lastPaymentAt}, ${paidAt})`,
    // Pago: deixa de estar em atraso (a próxima sincronização do IXC confirma o estado)
    status: sql`case when ${schema.customers.disabledAt} is null then 'active'::customer_status else ${schema.customers.status} end`,
    updatedAt: new Date(),
  }).where(eq(schema.customers.id, p.customerId));
  await logActivity({
    kind: "payment.paid",
    customerId: p.customerId,
    message: `Pagamento de **${kz(p.amountKz)}** confirmado (${monthLabel(p.period.slice(0, 7))})`,
    meta: { paymentId: p.id, chargeId: charge.id, reference: p.reference },
  });
  return "paid";
}

/**
 * Uma referência expirada que acabou por ser paga deixa a seguinte do mesmo título a mais: é cancelada.
 * Se o título já tinha outro pagamento, o cliente pagou duas vezes e fica o aviso para tratar à mão.
 */
async function samePeriodCleanup(p: typeof schema.payments.$inferSelect): Promise<void> {
  const others = await db().select({ id: schema.payments.id, status: schema.payments.status, reference: schema.payments.reference })
    .from(schema.payments)
    .where(and(eq(schema.payments.ixcReceivableId, p.ixcReceivableId!), ne(schema.payments.id, p.id), inArray(schema.payments.status, ["pending", "paid"])));
  for (const o of others) {
    if (o.status === "pending") {
      await db().update(schema.payments).set({ status: "expired" }).where(and(eq(schema.payments.id, o.id), eq(schema.payments.status, "pending")));
      await logActivity({
        kind: "payment.cancelled",
        customerId: p.customerId,
        message: `Referência **${refFmt(o.reference)}** cancelada: o mesmo período foi pago com a referência **${refFmt(p.reference)}**`,
        meta: { paymentId: o.id, paidWith: p.id },
      });
    } else {
      await logActivity({
        kind: "payment.duplicate",
        customerId: p.customerId,
        message: `Pagamento em duplicado: o mesmo período já tinha sido pago com a referência **${refFmt(o.reference)}**. Verificar à mão (devolver ou abater no período seguinte).`,
        meta: { paymentId: p.id, other: o.id },
      });
    }
  }
}

/** Verifica na AppyPay as referências por pagar (e as expiradas há pouco). */
export async function checkPendingCharges(limit = 60): Promise<string> {
  const a = appypay();
  if (!a) return "AppyPay por configurar";
  const since = new Date(Date.now() - LATE_CHECK_DAYS * 86_400_000);
  const rows = await db().select({ id: schema.payments.id, appypayId: schema.payments.appypayId }).from(schema.payments)
    .where(and(
      isNotNull(schema.payments.appypayId), notLike(schema.payments.appypayId, `${NO_ID}%`),
      or(eq(schema.payments.status, "pending"), and(eq(schema.payments.status, "expired"), gte(schema.payments.issuedAt, since))),
    ))
    .orderBy(sql`${schema.payments.appypayCheckedAt} asc nulls first`, asc(schema.payments.id))
    .limit(limit);
  let paid = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      const charge = await a.client.getCharge(r.appypayId!);
      if (charge && (await applyCharge(r.id, charge)) === "paid") paid += 1;
    } catch {
      failed += 1;
    }
    await db().update(schema.payments).set({ appypayCheckedAt: new Date() }).where(eq(schema.payments.id, r.id));
  }
  if (failed && failed === rows.length) throw new Error(`A AppyPay não respondeu (${failed} verificações falharam)`);
  return `${rows.length} referências verificadas · ${paid} pagas` + (failed ? ` · ${failed} sem resposta` : "");
}

export type WebhookOutcome = { status: number; message: string };

/**
 * Notificação da AppyPay. O conteúdo não é de confiança: só serve para saber que cobrança verificar,
 * e o estado é sempre lido de novo na AppyPay.
 */
export async function handleWebhook(body: unknown): Promise<WebhookOutcome> {
  const a = appypay();
  if (!a) return { status: 503, message: "AppyPay por configurar" };
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const id = typeof b.id === "string" ? b.id : null;
  const ref = b.reference && typeof b.reference === "object" ? (b.reference as Record<string, unknown>).referenceNumber : null;
  const refNumber = typeof ref === "string" || typeof ref === "number" ? String(ref).replace(/\D/g, "") : null;
  if (!id && !refNumber) return { status: 400, message: "Notificação sem id nem referência" };

  const conds = [
    ...(id ? [eq(schema.payments.appypayId, id)] : []),
    ...(refNumber ? [eq(schema.payments.reference, refNumber)] : []),
  ];
  const [p] = await db().select().from(schema.payments).where(or(...conds)).limit(1);
  if (!p) return { status: 404, message: "Referência desconhecida" };
  if (p.status === "paid") return { status: 200, message: "Já estava paga" };

  const chargeId = p.appypayId && !p.appypayId.startsWith(NO_ID) ? p.appypayId : id;
  if (!chargeId) return { status: 202, message: "Sem id de cobrança para verificar" };
  const charge = await a.client.getCharge(chargeId);
  if (!charge) return { status: 404, message: "Cobrança não encontrada na AppyPay" };
  const outcome = await applyCharge(p.id, charge);
  await db().update(schema.payments).set({ appypayCheckedAt: new Date() }).where(eq(schema.payments.id, p.id));
  const messages: Record<ConfirmOutcome, string> = {
    paid: "Pagamento confirmado",
    already: "Já estava paga",
    not_paid: "A cobrança ainda não está paga",
    amount_mismatch: "Valor diferente do esperado",
    unknown: "Referência desconhecida",
  };
  return { status: outcome === "unknown" ? 404 : 200, message: messages[outcome] };
}
