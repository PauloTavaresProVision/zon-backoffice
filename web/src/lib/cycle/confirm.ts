// Confirmação de pagamentos na AppyPay: pelo webhook e por verificação periódica.
import { and, asc, eq, gte, inArray, isNotNull, like, ne, notLike, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { logActivity } from "@/lib/activity";
import { appypay, isPaidStatus, type AppyPayCharge, type AppyPayClient } from "@/lib/appypay";
import { db, schema } from "@/lib/db";
import { kz, monthLabel, refFmt } from "@/lib/format";
import { nowUtc, parseProviderDate } from "./rules";

/** Pagamentos expirados há menos disto ainda são verificados: o cliente pode ter pago no limite. */
const LATE_CHECK_DAYS = 30;
/** Lista de pagamentos da AppyPay: registos por página e páginas por verificação. */
const LIST_PAGE = 100;
const LIST_MAX_PAGES = 20;

/** Prefixo do appypayId quando a AppyPay criou a referência sem devolver o id do pagamento. */
export const NO_ID = "sem-id:";

export type ConfirmOutcome = "paid" | "already" | "not_paid" | "amount_mismatch" | "unknown";
/** Como se soube do pagamento de uma referência de teste. */
export type ConfirmedBy = "webhook" | "verificacao";

const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

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
  const chargeRef = digits(charge.referenceNumber);
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

/** O mesmo que applyCharge, para uma referência de teste (sem cliente, sem IXC, sem fatura). */
export async function applyTestCharge(testId: number, charge: AppyPayCharge, via: ConfirmedBy): Promise<ConfirmOutcome> {
  if (!isPaidStatus(charge.status)) return "not_paid";
  const T = schema.appypayTests;
  const [t] = await db().select().from(T).where(eq(T.id, testId)).limit(1);
  if (!t) return "unknown";
  if (t.status === "paid") return "already";
  // Aqui a referência tem de vir na cobrança e ser esta
  if (digits(charge.referenceNumber) !== t.reference) return "unknown";
  if (Math.abs(charge.amount - t.amountKz) > 1) {
    await logActivity({
      kind: "appypay.test",
      message: `Teste da AppyPay: **${kz(charge.amount)}** pagos na referência **${refFmt(t.reference)}**, mas eram **${kz(t.amountKz)}**.`,
      meta: { testId: t.id, chargeId: charge.id },
    });
    return "amount_mismatch";
  }
  const paidAt = parseProviderDate(charge.providerPaidAt) ?? parseProviderDate(charge.updatedAt) ?? new Date();
  const [done] = await db().update(T)
    .set({
      status: "paid", paidAt, paidAmountKz: Math.round(charge.amount), confirmedBy: via, checkedAt: new Date(),
      appypayId: !t.appypayId || t.appypayId.startsWith(NO_ID) ? charge.id || t.appypayId : t.appypayId,
    })
    .where(and(eq(T.id, t.id), inArray(T.status, ["pending", "expired"])))
    .returning({ id: T.id });
  if (!done) return "already";
  await logActivity({
    kind: "appypay.test",
    message: `Teste da AppyPay: referência **${refFmt(t.reference)}** paga (${kz(charge.amount)}), confirmada ${via === "webhook" ? "pela notificação da AppyPay" : "pela verificação periódica"}`,
    meta: { testId: t.id, chargeId: charge.id },
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

type Wanted = { reference: string; amountKz: number; issuedAt: Date };
export type ListLookup = { found: Map<string, AppyPayCharge>; scanned: number; truncated: boolean };

/**
 * Procura referências na lista de pagamentos da AppyPay, pelo número. Só pede pagamentos desde a mais antiga
 * (com um dia de folga) e entre o valor mais baixo e o mais alto. Se a mesma referência aparecer várias vezes,
 * fica a cobrança paga.
 */
export async function findChargesByReference(client: AppyPayClient, wanted: Wanted[]): Promise<ListLookup> {
  const found = new Map<string, AppyPayCharge>();
  if (!wanted.length) return { found, scanned: 0, truncated: false };
  const refs = new Set(wanted.map((w) => w.reference));
  const oldest = Math.min(...wanted.map((w) => w.issuedAt.getTime()));
  const amounts = wanted.map((w) => w.amountKz);
  const filter = {
    dateFrom: nowUtc(new Date(oldest - 86_400_000)),
    dateTo: nowUtc(new Date(Date.now() + 3_600_000)),
    amountFrom: Math.max(0, Math.min(...amounts) - 1),
    amountTo: Math.max(...amounts) + 1,
  };
  let scanned = 0;
  for (let page = 0; page < LIST_MAX_PAGES; page++) {
    const list = await client.listCharges({ ...filter, skip: page * LIST_PAGE, limit: LIST_PAGE });
    scanned += list.length;
    for (const c of list) {
      const ref = digits(c.referenceNumber);
      if (!refs.has(ref)) continue;
      const prev = found.get(ref);
      if (!prev || (isPaidStatus(c.status) && !isPaidStatus(prev.status))) found.set(ref, c);
    }
    if (list.length < LIST_PAGE) return { found, scanned, truncated: false };
    if ([...refs].every((r) => isPaidStatus(found.get(r)?.status))) return { found, scanned, truncated: false };
  }
  return { found, scanned, truncated: true };
}

/** Por pagar, ou expirada há pouco (o cliente pode ter pago no limite). */
const stillOpen = (status: PgColumn, issuedAt: PgColumn, since: Date): SQL =>
  or(eq(status, "pending"), and(eq(status, "expired"), gte(issuedAt, since)))!;

/**
 * Verifica na AppyPay as referências por pagar (e as expiradas há pouco). As que têm o id do pagamento
 * consultam-se uma a uma; as outras (a AppyPay não devolve o id ao criar) procuram-se na lista de pagamentos.
 */
export async function checkPendingCharges(limit = 60): Promise<string> {
  const a = appypay();
  if (!a) return "AppyPay por configurar";
  const since = new Date(Date.now() - LATE_CHECK_DAYS * 86_400_000);
  const P = schema.payments;
  const T = schema.appypayTests;
  let checked = 0;
  let paid = 0;
  let failed = 0;
  let calls = 0;

  // 1. Com id: uma consulta por pagamento
  const withId = await db().select({ id: P.id, appypayId: P.appypayId }).from(P)
    .where(and(isNotNull(P.appypayId), notLike(P.appypayId, `${NO_ID}%`), stillOpen(P.status, P.issuedAt, since)))
    .orderBy(sql`${P.appypayCheckedAt} asc nulls first`, asc(P.id))
    .limit(limit);
  for (const r of withId) {
    calls += 1;
    try {
      const charge = await a.client.getCharge(r.appypayId!);
      if (charge && (await applyCharge(r.id, charge)) === "paid") paid += 1;
    } catch {
      failed += 1;
    }
    await db().update(P).set({ appypayCheckedAt: new Date() }).where(eq(P.id, r.id));
  }
  checked += withId.length;

  // 2. Sem id, e as referências de teste: pela lista de pagamentos
  const noId = await db().select({ id: P.id, reference: P.reference, amountKz: P.amountKz, issuedAt: P.issuedAt }).from(P)
    .where(and(like(P.appypayId, `${NO_ID}%`), stillOpen(P.status, P.issuedAt, since)))
    .orderBy(asc(P.issuedAt)).limit(500);
  const tests = await db().select({ id: T.id, reference: T.reference, amountKz: T.amountKz, issuedAt: T.issuedAt }).from(T)
    .where(stillOpen(T.status, T.issuedAt, since))
    .orderBy(asc(T.issuedAt)).limit(50);
  let truncated = false;
  if (noId.length || tests.length) {
    calls += 1;
    try {
      const look = await findChargesByReference(a.client, [...noId, ...tests]);
      truncated = look.truncated;
      for (const r of noId) {
        const c = look.found.get(r.reference);
        if (c && (await applyCharge(r.id, c)) === "paid") paid += 1;
      }
      for (const t of tests) {
        const c = look.found.get(t.reference);
        if (c && (await applyTestCharge(t.id, c, "verificacao")) === "paid") paid += 1;
      }
    } catch {
      failed += 1;
    }
    if (noId.length) await db().update(P).set({ appypayCheckedAt: new Date() }).where(inArray(P.id, noId.map((r) => r.id)));
    if (tests.length) await db().update(T).set({ checkedAt: new Date() }).where(inArray(T.id, tests.map((t) => t.id)));
    checked += noId.length + tests.length;
  }

  if (failed && failed === calls) throw new Error(`A AppyPay não respondeu (${failed} verificações falharam)`);
  return `${checked} referências verificadas · ${paid} pagas`
    + (truncated ? " · lista da AppyPay longa demais, o resto fica para a próxima" : "")
    + (failed ? ` · ${failed} sem resposta` : "");
}

export type WebhookOutcome = { status: number; message: string };

const OUTCOME_MESSAGE: Record<ConfirmOutcome, string> = {
  paid: "Pagamento confirmado",
  already: "Já estava paga",
  not_paid: "A cobrança ainda não está paga",
  amount_mismatch: "Valor diferente do esperado",
  unknown: "Referência desconhecida",
};

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
  const refNumber = typeof ref === "string" || typeof ref === "number" ? digits(String(ref)) : null;
  if (!id && !refNumber) return { status: 400, message: "Notificação sem id nem referência" };

  const P = schema.payments;
  const [p] = await db().select().from(P)
    .where(or(...(id ? [eq(P.appypayId, id)] : []), ...(refNumber ? [eq(P.reference, refNumber)] : [])))
    .limit(1);
  if (!p) return handleTestWebhook(a.client, id, refNumber);
  if (p.status === "paid") return { status: 200, message: "Já estava paga" };

  const chargeId = p.appypayId && !p.appypayId.startsWith(NO_ID) ? p.appypayId : id;
  if (!chargeId) return { status: 202, message: "Sem id de cobrança para verificar" };
  const charge = await a.client.getCharge(chargeId);
  if (!charge) return { status: 404, message: "Cobrança não encontrada na AppyPay" };
  const outcome = await applyCharge(p.id, charge);
  await db().update(P).set({ appypayCheckedAt: new Date() }).where(eq(P.id, p.id));
  return { status: outcome === "unknown" ? 404 : 200, message: OUTCOME_MESSAGE[outcome] };
}

/** Notificação de uma referência de teste: fica registado que chegou, e o pagamento confirma-se na AppyPay. */
async function handleTestWebhook(client: AppyPayClient, id: string | null, refNumber: string | null): Promise<WebhookOutcome> {
  const T = schema.appypayTests;
  const [t] = await db().select().from(T)
    .where(or(...(id ? [eq(T.appypayId, id)] : []), ...(refNumber ? [eq(T.reference, refNumber)] : [])))
    .limit(1);
  if (!t) return { status: 404, message: "Referência desconhecida" };
  await db().update(T).set({ noticeCount: sql`${T.noticeCount} + 1`, lastNoticeAt: new Date() }).where(eq(T.id, t.id));
  if (t.status === "paid") return { status: 200, message: "Já estava paga" };
  const chargeId = t.appypayId && !t.appypayId.startsWith(NO_ID) ? t.appypayId : id;
  if (!chargeId) return { status: 202, message: "Notificação recebida, sem id de cobrança para verificar" };
  const charge = await client.getCharge(chargeId);
  if (!charge) return { status: 404, message: "Cobrança não encontrada na AppyPay" };
  const outcome = await applyTestCharge(t.id, charge, "webhook");
  await db().update(T).set({ checkedAt: new Date() }).where(eq(T.id, t.id));
  return { status: outcome === "unknown" ? 404 : 200, message: OUTCOME_MESSAGE[outcome] };
}
