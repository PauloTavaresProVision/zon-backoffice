// Ciclo de cobrança: uma referência por título do IXC a vencer, e avisos por SMS a 7, 3 e 1 dia.
import { and, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { appypay, type AppyPayClient } from "@/lib/appypay";
import { db, schema } from "@/lib/db";
import { cycleFromDue, cycleMode, env, smsConfig, type AppyPayConfig } from "@/lib/env";
import { addDays, daysFrom, isoDay, kz, refFmt } from "@/lib/format";
import { angolaMobile } from "@/lib/phone";
import { sendSms } from "@/lib/sms";
import { NO_ID } from "./confirm";
import {
  OVERDUE_MAX_DAYS, WINDOW_DAYS, endOfDayUtc, newReferenceNumber, nowUtc, paidSms, referenceLastDay, referenceSms,
  smsHours, stageKind,
} from "./rules";

/** Uma referência criada e não confirmada pela AppyPay em 15 minutos ficou a meio: é descartada. */
const STALE_MINUTES = 15;
/** Tentativas de uma SMS que falhou, por fase. */
const SMS_MAX_TRIES = 3;
const SMS_RETRY_MINUTES = 30;

type Candidate = {
  receivableId: number;
  receivableIxcId: string;
  amountKz: number;
  dueDate: string;
  contractId: number;
  contractIxcId: number;
  customerId: number;
  customerName: string;
  phone: string | null;
  service: string;
  payment: typeof schema.payments.$inferSelect | null;
};

/**
 * Títulos em aberto de contratos ativos, de clientes não desativados, dentro da janela do ciclo.
 * Com `receivableId`, só esse título e sem olhar à janela (pedido manual).
 */
async function candidates(today: string, receivableId?: number): Promise<Candidate[]> {
  const r = schema.receivables;
  const k = schema.contracts;
  const c = schema.customers;
  const oldest = addDays(today, -OVERDUE_MAX_DAYS);
  const from = cycleFromDue();
  const rows = await db().select({
    receivableId: r.id, receivableIxcId: r.ixcId, amountKz: r.amountKz, dueDate: r.dueDate,
    contractId: k.id, contractIxcId: k.ixcId, customerId: c.id, customerName: c.name, phone: c.phone,
    planName: schema.plans.name,
  }).from(r)
    .innerJoin(k, eq(k.id, r.contractId))
    .innerJoin(c, eq(c.id, k.customerId))
    .leftJoin(schema.plans, eq(schema.plans.id, k.planId))
    .where(and(
      isNull(r.closedAt), eq(k.status, "A"), isNull(c.disabledAt),
      // Pago e à espera da baixa no IXC: não leva outra referência
      sql`not exists (select 1 from ${schema.payments} p where p.ixc_receivable_id = ${r.ixcId} and p.status = 'paid')`,
      ...(receivableId
        ? [eq(r.id, receivableId)]
        : [lte(r.dueDate, addDays(today, WINDOW_DAYS)), gte(r.dueDate, from && from > oldest ? from : oldest)]),
    ))
    .orderBy(r.dueDate, r.id);
  if (!rows.length) return [];
  const live = await db().select().from(schema.payments)
    .where(and(eq(schema.payments.status, "pending"), inArray(schema.payments.ixcReceivableId, rows.map((x) => x.receivableIxcId))));
  const byReceivable = new Map(live.map((p) => [p.ixcReceivableId!, p]));
  return rows.map((x) => ({
    ...x,
    service: x.planName ? `ZON ${x.planName.replace(/^ZON\s+/i, "")}` : "ZON",
    payment: byReceivable.get(x.receivableIxcId) ?? null,
  }));
}

/** Cria a referência na AppyPay. A linha é reservada antes, para nunca haver duas vivas para o mesmo título. */
async function createReference(x: Candidate, today: string, client: AppyPayClient, cfg: AppyPayConfig) {
  const lastDay = referenceLastDay(x.dueDate, today);
  let reference = "";
  let paymentId: number | null = null;
  for (let i = 0; i < 5 && !paymentId; i++) {
    reference = newReferenceNumber();
    const [row] = await db().insert(schema.payments).values({
      customerId: x.customerId,
      contractId: x.contractId,
      ixcReceivableId: x.receivableIxcId,
      entity: cfg.entity,
      reference,
      amountKz: x.amountKz,
      period: `${x.dueDate.slice(0, 7)}-01`,
      issuedAt: new Date(),
      dueDate: lastDay,
      status: "pending",
    }).onConflictDoNothing().returning({ id: schema.payments.id });
    if (row) paymentId = row.id;
    else {
      // Ou o número já existe, ou outro processo reservou este título entretanto
      const [taken] = await db().select({ id: schema.payments.id }).from(schema.payments)
        .where(and(eq(schema.payments.ixcReceivableId, x.receivableIxcId), eq(schema.payments.status, "pending"))).limit(1);
      if (taken) return null;
    }
  }
  if (!paymentId) throw new Error("Não foi possível reservar um número de referência livre.");

  try {
    const created = await client.createReference({
      referenceNumber: reference,
      amount: x.amountKz,
      descriptionLine1: `${x.service} ${x.dueDate.slice(5, 7)}/${x.dueDate.slice(0, 4)}`.slice(0, 40),
      descriptionLine2: x.customerName.slice(0, 40),
      startDate: nowUtc(),
      expirationDate: endOfDayUtc(lastDay),
    });
    const [p] = await db().update(schema.payments).set({
      // Sem id não há como consultar a cobrança; fica a valer o webhook, que traz o número da referência
      appypayId: created.paymentId ?? `${NO_ID}${reference}`,
      reference: created.referenceNumber.replace(/\D/g, "") || reference,
      entity: created.entity ?? cfg.entity,
    }).where(eq(schema.payments.id, paymentId)).returning();
    await logActivity({
      kind: "payment.reference",
      customerId: x.customerId,
      message: `Referência **${refFmt(p!.reference)}** de **${kz(x.amountKz)}** criada (válida até ${lastDay.split("-").reverse().join("/")})`,
      meta: { paymentId, receivable: x.receivableIxcId },
    });
    return p!;
  } catch (err) {
    await db().delete(schema.payments).where(eq(schema.payments.id, paymentId));
    throw err;
  }
}

async function smsAlreadyHandled(paymentId: number, kind: string): Promise<boolean> {
  const rows = await db().select({ status: schema.smsMessages.status, at: schema.smsMessages.at }).from(schema.smsMessages)
    .where(and(eq(schema.smsMessages.paymentId, paymentId), eq(schema.smsMessages.kind, kind)));
  if (rows.some((r) => r.status === "sent")) return true;
  if (rows.length >= SMS_MAX_TRIES) return true;
  const last = rows.reduce<Date | null>((m, r) => (!m || r.at > m ? r.at : m), null);
  return !!last && Date.now() - last.getTime() < SMS_RETRY_MINUTES * 60_000;
}

async function smsThisWeek(receivableIxcId: string): Promise<boolean> {
  const rows = await db().execute(sql`
    select 1 from ${schema.smsMessages} s join ${schema.payments} p on p.id = s.payment_id
    where p.ixc_receivable_id = ${receivableIxcId} and s.status = 'sent' and s.kind like 'stage_%'
      and s.at > now() - interval '7 days'
    limit 1`);
  return rows.rows.length > 0;
}

/** Referências reservadas que a AppyPay nunca confirmou (processo interrompido a meio). */
async function dropStale(): Promise<number> {
  const rows = await db().delete(schema.payments).where(and(
    eq(schema.payments.status, "pending"), isNull(schema.payments.appypayId), sql`${schema.payments.ixcReceivableId} is not null`,
    lt(schema.payments.issuedAt, new Date(Date.now() - STALE_MINUTES * 60_000)),
    sql`not exists (select 1 from ${schema.smsMessages} s where s.payment_id = ${schema.payments.id})`,
  )).returning({ id: schema.payments.id });
  return rows.length;
}

/** SMS de agradecimento para pagamentos das últimas 24 h (só em horário de SMS). */
async function thankYous(): Promise<number> {
  const rows = await db().select({
    id: schema.payments.id, customerId: schema.payments.customerId, amountKz: schema.payments.amountKz,
    reference: schema.payments.reference, name: schema.customers.name, phone: schema.customers.phone,
  }).from(schema.payments)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.payments.customerId))
    .where(and(
      eq(schema.payments.status, "paid"), sql`${schema.payments.contractId} is not null`,
      gte(schema.payments.paidAt, new Date(Date.now() - 86_400_000)),
    ));
  let sent = 0;
  for (const p of rows) {
    if (await smsAlreadyHandled(p.id, "paid")) continue;
    const r = await sendSms({ customerId: p.customerId, paymentId: p.id, kind: "paid", phone: p.phone, body: paidSms({ name: p.name, amount: p.amountKz, reference: p.reference }) });
    if (r.ok) sent += 1;
  }
  return sent;
}

export async function runCycle(): Promise<string> {
  const mode = cycleMode();
  if (mode === "desligado") return "Ciclo desligado (CYCLE_MODE)";
  const today = isoDay();
  const list = await candidates(today);
  const support = env().SMS_SUPPORT_PHONE?.trim() || null;

  if (mode === "simulacao") return simulate(list, today, support);

  const a = appypay();
  if (!a) throw new Error("A AppyPay não está configurada: o ciclo ativo precisa dela para criar referências.");
  const canSms = !!smsConfig() && smsHours();
  const stale = await dropStale();
  let created = 0;
  let failed = 0;
  let sms = 0;
  const errors = new Set<string>();

  for (const x of list) {
    let p = x.payment;
    if (!p) {
      try {
        p = await createReference(x, today, a.client, a.cfg);
        if (p) created += 1;
      } catch (err) {
        failed += 1;
        errors.add(err instanceof Error ? err.message : String(err));
        continue;
      }
    }
    if (!p?.appypayId || !canSms) continue;
    const days = daysFrom(x.dueDate, today);
    const kind = stageKind(days);
    if (await smsAlreadyHandled(p.id, kind)) continue;
    // Em atraso, cada referência nova traz uma SMS, mas no máximo uma por semana
    if (days < 0 && (await smsThisWeek(x.receivableIxcId))) continue;
    const r = await sendSms({
      customerId: x.customerId, paymentId: p.id, kind, phone: x.phone, reference: p.reference,
      body: referenceSms({ name: x.customerName, service: x.service, dueDate: x.dueDate, today, entity: p.entity, reference: p.reference, amount: p.amountKz, support }),
    });
    if (r.ok) sms += 1;
  }
  const thanks = canSms ? await thankYous() : 0;

  if (failed && !created) throw new Error(`${failed} referências falharam: ${[...errors][0]}`);
  return [
    `${list.length} títulos no ciclo`,
    `${created} referências criadas`,
    `${sms} SMS enviadas`,
    ...(thanks ? [thanks === 1 ? "1 agradecimento" : `${thanks} agradecimentos`] : []),
    ...(failed ? [`${failed} referências falharam (${[...errors][0]})`] : []),
    ...(stale ? [`${stale} reservas descartadas`] : []),
    ...(!canSms && smsConfig() ? ["SMS fora de horas"] : []),
  ].join(" · ");
}

const smsBody = (x: Pick<Candidate, "customerName" | "service" | "dueDate">, p: { entity: string; reference: string; amountKz: number }, today: string) =>
  referenceSms({ name: x.customerName, service: x.service, dueDate: x.dueDate, today, entity: p.entity, reference: p.reference, amount: p.amountKz, support: env().SMS_SUPPORT_PHONE?.trim() || null });

/** "Gerar referência agora" na ficha do cliente: cria (ou reaproveita) e envia por SMS. */
export async function referenceNow(receivableId: number, userId: number): Promise<string> {
  if (cycleMode() !== "ativo") throw new Error("O ciclo de cobrança não está ativo (CYCLE_MODE).");
  const a = appypay();
  if (!a) throw new Error("A AppyPay não está configurada.");
  const today = isoDay();
  const [x] = await candidates(today, receivableId);
  if (!x) throw new Error("Este título já não está em aberto, ou o contrato ou o cliente não estão ativos.");
  const from = cycleFromDue();
  if (!x.payment && from && x.dueDate < from) throw new Error(`Este título vence antes de ${from.split("-").reverse().join("/")}: a referência é do sistema antigo (CYCLE_FROM_DUE).`);
  const p = x.payment ?? (await createReference(x, today, a.client, a.cfg));
  if (!p?.appypayId) throw new Error("A referência está a ser criada noutro processo; tente daqui a um minuto.");
  const sms = await sendSms({ customerId: x.customerId, paymentId: p.id, kind: "manual", phone: x.phone, reference: p.reference, body: smsBody(x, p, today), userId });
  const what = x.payment ? `Referência ${refFmt(p.reference)}` : `Referência ${refFmt(p.reference)} criada`;
  return sms.ok ? `${what} e enviada por SMS${sms.test ? " (número de testes)" : ""}` : `${what}; a SMS falhou: ${sms.error}`;
}

/** "Reenviar SMS" de uma referência por pagar. */
export async function resendReference(paymentId: number, userId: number): Promise<string> {
  const [row] = await db().select().from(schema.payments)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.payments.customerId))
    .leftJoin(schema.plans, eq(schema.plans.id, schema.customers.planId))
    .where(eq(schema.payments.id, paymentId)).limit(1);
  if (!row) throw new Error("Referência não encontrada.");
  const { payments: p, customers: c, plans: plan } = row;
  if (p.status !== "pending") throw new Error("Esta referência já não está por pagar.");
  const [rec] = p.ixcReceivableId
    ? await db().select({ dueDate: schema.receivables.dueDate }).from(schema.receivables).where(eq(schema.receivables.ixcId, p.ixcReceivableId)).limit(1)
    : [];
  const x = { customerName: c.name, service: plan ? `ZON ${plan.name.replace(/^ZON\s+/i, "")}` : "ZON", dueDate: rec?.dueDate ?? c.dueDate ?? p.dueDate };
  const sms = await sendSms({ customerId: c.id, paymentId: p.id, kind: "manual", phone: c.phone, reference: p.reference, body: smsBody(x, p, isoDay()), userId });
  if (!sms.ok) throw new Error(`A SMS falhou: ${sms.error}`);
  return `SMS enviada para ${sms.phone}${sms.test ? " (número de testes)" : ""}`;
}

/** Modo simulação: guarda o que faria, sem criar referências, sem SMS e sem escrever no IXC. */
async function simulate(list: Candidate[], today: string, support: string | null): Promise<string> {
  const entries: (typeof schema.cyclePreview.$inferInsert)[] = [];
  const entity = appypay()?.cfg.entity ?? env().APPYPAY_ENTITY;
  for (const x of list) {
    const base = { customerId: x.customerId, contractIxcId: x.contractIxcId, receivableIxcId: x.receivableIxcId, amountKz: x.amountKz, dueDate: x.dueDate };
    const days = daysFrom(x.dueDate, today);
    if (!x.payment) {
      entries.push({ ...base, kind: "reference", detail: `Criaria referência de ${kz(x.amountKz)}, válida até ${referenceLastDay(x.dueDate, today).split("-").reverse().join("/")}` });
    }
    const phone = angolaMobile(x.phone);
    entries.push(phone
      ? { ...base, kind: "sms", detail: `Enviaria SMS (${stageKind(days).replace("stage_", "fase ")} dias) para ${phone}: ${referenceSms({ name: x.customerName, service: x.service, dueDate: x.dueDate, today, entity, reference: x.payment?.reference ?? "000000000", amount: x.amountKz, support }).replace(/\n/g, " ")}` }
      : { ...base, kind: "skip", detail: "Sem telemóvel válido: não receberia SMS" });
  }
  await db().transaction(async (tx) => {
    await tx.delete(schema.cyclePreview);
    for (let i = 0; i < entries.length; i += 500) await tx.insert(schema.cyclePreview).values(entries.slice(i, i + 500));
  });
  const refs = entries.filter((e) => e.kind === "reference").length;
  const sms = entries.filter((e) => e.kind === "sms").length;
  return `Simulação: ${list.length} títulos · criaria ${refs} referências · enviaria ${sms} SMS`;
}
