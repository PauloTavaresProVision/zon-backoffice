import "server-only";
import { and, desc, eq, gte, ilike, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { EXPIRING_DAYS, type ClientFilter } from "@/lib/client-state";
import { db, schema } from "@/lib/db";
import { addDays, isoDay, shiftMonth } from "@/lib/format";

const c = schema.customers;
const p = schema.payments;
const inv = schema.invoices;

/** Meia-noite de um dia em Luanda, como timestamptz. */
const luanda = (iso: string) => sql`((${iso})::date)::timestamp at time zone 'Africa/Luanda'`;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/* ---------------- Clientes ---------------- */

export function clientFilterSql(f: ClientFilter, today = isoDay()): SQL | undefined {
  switch (f) {
    case "active": return and(eq(c.status, "active"), or(isNull(c.dueDate), gte(c.dueDate, today)));
    case "expiring": return and(eq(c.status, "active"), gte(c.dueDate, today), lte(c.dueDate, addDays(today, EXPIRING_DAYS)));
    case "late": return or(eq(c.status, "late"), and(eq(c.status, "active"), lt(c.dueDate, today)));
    case "inactive": return eq(c.status, "inactive");
    default: return undefined;
  }
}

function customerSearchSql(q: string): SQL {
  const like = `%${escapeLike(q)}%`;
  const digits = q.replace(/\D/g, "");
  const ors: SQL[] = [ilike(c.name, like), ilike(c.nif, like), ilike(c.zone, like), ilike(c.email, like)];
  if (digits.length >= 3) ors.push(ilike(c.phone, `%${digits}%`), sql`${c.ixcId}::text like ${`${digits}%`}`);
  return or(...ors)!;
}

export async function clientCounts(today = isoDay()) {
  const f = (k: ClientFilter) => sql<number>`(count(*) filter (where ${clientFilterSql(k, today)!}))::int`;
  const [r] = await db().select({
    all: sql<number>`count(*)::int`,
    active: f("active"),
    expiring: f("expiring"),
    late: f("late"),
    inactive: f("inactive"),
    newThisMonth: sql<number>`(count(*) filter (where ${c.since} >= ${`${today.slice(0, 8)}01`}))::int`,
  }).from(c);
  return r ?? { all: 0, active: 0, expiring: 0, late: 0, inactive: 0, newThisMonth: 0 };
}

export async function listClients(o: { filter: ClientFilter; q: string; planId: number | null; page: number; pageSize: number }) {
  const conds = [clientFilterSql(o.filter), o.planId ? eq(c.planId, o.planId) : undefined, o.q ? customerSearchSql(o.q) : undefined]
    .filter((x): x is SQL => !!x);
  const where = conds.length ? and(...conds) : undefined;
  const [rows, [total]] = await Promise.all([
    db().select({ customer: c, plan: { name: schema.plans.name, priceKz: schema.plans.priceKz } })
      .from(c).leftJoin(schema.plans, eq(schema.plans.id, c.planId))
      .where(where)
      .orderBy(o.filter === "inactive" || o.filter === "late" ? sql`${c.dueDate} desc nulls last` : sql`${c.dueDate} asc nulls last`, c.name)
      .limit(o.pageSize).offset((o.page - 1) * o.pageSize),
    db().select({ n: sql<number>`count(*)::int` }).from(c).where(where),
  ]);
  return { rows, total: total?.n ?? 0 };
}

export async function getClient(id: number) {
  const [row] = await db().select({ customer: c, plan: schema.plans })
    .from(c).leftJoin(schema.plans, eq(schema.plans.id, c.planId)).where(eq(c.id, id)).limit(1);
  return row ?? null;
}

export async function clientPayments(customerId: number, limit = 12) {
  return db().select({ payment: p, invoice: { id: inv.id, documentNumber: inv.documentNumber, ogType: inv.ogType } })
    .from(p).leftJoin(inv, eq(inv.paymentId, p.id))
    .where(eq(p.customerId, customerId))
    .orderBy(desc(p.period), desc(p.id)).limit(limit);
}

export async function clientInvoices(customerId: number) {
  return db().select({ invoice: inv, reference: p.reference })
    .from(inv).leftJoin(p, eq(p.id, inv.paymentId))
    .where(eq(inv.customerId, customerId))
    .orderBy(desc(inv.date), desc(inv.id));
}

export async function openReference(customerId: number) {
  const [row] = await db().select().from(p)
    .where(and(eq(p.customerId, customerId), eq(p.status, "pending")))
    .orderBy(desc(p.dueDate)).limit(1);
  return row ?? null;
}

export async function activityFeed(o: { customerId?: number; limit: number }) {
  return db().select({
    id: schema.activity.id, at: schema.activity.at, kind: schema.activity.kind, message: schema.activity.message,
    customerId: schema.activity.customerId, customerName: c.name, userName: schema.users.name,
  })
    .from(schema.activity)
    .leftJoin(c, eq(c.id, schema.activity.customerId))
    .leftJoin(schema.users, eq(schema.users.id, schema.activity.userId))
    .where(o.customerId ? eq(schema.activity.customerId, o.customerId) : undefined)
    .orderBy(desc(schema.activity.at), desc(schema.activity.id)).limit(o.limit);
}

export async function expiringSoon(limit = 6, today = isoDay()) {
  return db().select({ id: c.id, name: c.name, dueDate: c.dueDate, phone: c.phone, planName: schema.plans.name, priceKz: schema.plans.priceKz })
    .from(c).leftJoin(schema.plans, eq(schema.plans.id, c.planId))
    .where(clientFilterSql("expiring", today))
    .orderBy(c.dueDate, c.name).limit(limit);
}

export async function plansWithClients() {
  return db().select({
    plan: schema.plans,
    clients: sql<number>`(count(${c.id}) filter (where ${c.status} <> 'inactive'))::int`,
  })
    .from(schema.plans).leftJoin(c, eq(c.planId, schema.plans.id))
    .groupBy(schema.plans.id)
    .orderBy(desc(sql`count(${c.id}) filter (where ${c.status} <> 'inactive')`), schema.plans.priceKz);
}

/* ---------------- Pagamentos ---------------- */

const ym = (iso = isoDay()) => iso.slice(0, 7);
export const currentMonth = () => ym();

/** Referências de um mês (pelo mês a que respeitam), por estado. */
export async function refStats(month: string) {
  const sum = (cond?: SQL) => cond
    ? sql<number>`coalesce(sum(${p.amountKz}) filter (where ${cond}), 0)::float8`
    : sql<number>`coalesce(sum(${p.amountKz}), 0)::float8`;
  const n = (cond: SQL) => sql<number>`(count(*) filter (where ${cond}))::int`;
  const [r] = await db().select({
    issued: sql<number>`count(*)::int`, issuedKz: sum(),
    paid: n(eq(p.status, "paid")), paidKz: sum(eq(p.status, "paid")),
    pending: n(eq(p.status, "pending")), pendingKz: sum(eq(p.status, "pending")),
    expired: n(eq(p.status, "expired")), expiredKz: sum(eq(p.status, "expired")),
  }).from(p).where(eq(p.period, `${month}-01`));
  return r ?? { issued: 0, issuedKz: 0, paid: 0, paidKz: 0, pending: 0, pendingKz: 0, expired: 0, expiredKz: 0 };
}

/** Dinheiro recebido entre dois dias (fim exclusivo), pela data do pagamento. */
export async function cashReceived(fromIso: string, toIso: string): Promise<number> {
  const [r] = await db().select({ kz: sql<number>`coalesce(sum(${p.amountKz}), 0)::float8` }).from(p)
    .where(and(eq(p.status, "paid"), gte(p.paidAt, luanda(fromIso)), lt(p.paidAt, luanda(toIso))));
  return r?.kz ?? 0;
}

/** Emitido e recebido por mês, dos últimos `n` meses até `end` (inclusive). */
export async function monthlySeries(end: string, n = 12) {
  const start = shiftMonth(end, -(n - 1));
  const rows = await db().select({
    ym: sql<string>`to_char(${p.period}, 'YYYY-MM')`,
    issued: sql<number>`sum(${p.amountKz})::float8`,
    received: sql<number>`coalesce(sum(${p.amountKz}) filter (where ${p.status} = 'paid'), 0)::float8`,
  }).from(p).where(and(gte(p.period, `${start}-01`), lt(p.period, `${shiftMonth(end, 1)}-01`))).groupBy(sql`1`);
  const by = new Map(rows.map((r) => [r.ym, r]));
  return Array.from({ length: n }, (_, i) => {
    const m = shiftMonth(start, i);
    return { ym: m, issued: by.get(m)?.issued ?? 0, received: by.get(m)?.received ?? 0 };
  });
}

export async function dailyReceived(month: string): Promise<number[]> {
  const days = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  const rows = await db().select({
    d: sql<number>`extract(day from ${p.paidAt} at time zone 'Africa/Luanda')::int`,
    kz: sql<number>`sum(${p.amountKz})::float8`,
  }).from(p)
    .where(and(eq(p.status, "paid"), gte(p.paidAt, luanda(`${month}-01`)), lt(p.paidAt, luanda(`${shiftMonth(month, 1)}-01`))))
    .groupBy(sql`1`);
  const out = Array<number>(days).fill(0);
  for (const r of rows) out[r.d - 1] = r.kz;
  return out;
}

export async function paymentMonthRange(): Promise<{ first: string; last: string }> {
  const [r] = await db().select({ first: sql<string | null>`to_char(min(${p.period}), 'YYYY-MM')` }).from(p);
  const now = currentMonth();
  return { first: r?.first ?? now, last: now };
}

export type PayFilter = "all" | "paid" | "pending" | "expired" | "smsfail" | "noinvoice";
export const PAY_FILTERS: PayFilter[] = ["all", "paid", "pending", "expired", "smsfail", "noinvoice"];

/** Pagamentos confirmados que o backoffice devia faturar e ainda não faturou. */
const noInvoiceSql = (issueFrom: string | null) =>
  issueFrom ? and(eq(p.status, "paid"), isNull(inv.id), gte(p.paidAt, luanda(issueFrom)))! : sql`false`;

export async function listPayments(o: { month: string; filter: PayFilter; q: string; page: number; pageSize: number; issueFrom: string | null }) {
  const filter: Record<PayFilter, SQL | undefined> = {
    all: undefined,
    paid: eq(p.status, "paid"),
    pending: eq(p.status, "pending"),
    expired: eq(p.status, "expired"),
    smsfail: eq(p.sms, "failed"),
    noinvoice: noInvoiceSql(o.issueFrom),
  };
  const digits = o.q.replace(/\D/g, "");
  const search = o.q
    ? or(ilike(c.name, `%${escapeLike(o.q)}%`), ...(digits.length >= 3 ? [sql`${p.reference} like ${`${digits}%`}`, sql`${c.ixcId}::text = ${digits}`] : []))
    : undefined;
  const where = and(eq(p.period, `${o.month}-01`), filter[o.filter], search);
  const base = () => db().select({
    payment: p,
    customer: { id: c.id, name: c.name, ixcId: c.ixcId },
    invoice: { id: inv.id, documentNumber: inv.documentNumber, ogType: inv.ogType },
  }).from(p).innerJoin(c, eq(c.id, p.customerId)).leftJoin(inv, eq(inv.paymentId, p.id));
  const [rows, [total]] = await Promise.all([
    base().where(where).orderBy(desc(p.issuedAt), desc(p.id)).limit(o.pageSize).offset((o.page - 1) * o.pageSize),
    db().select({ n: sql<number>`count(*)::int` }).from(p).innerJoin(c, eq(c.id, p.customerId)).leftJoin(inv, eq(inv.paymentId, p.id)).where(where),
  ]);
  return { rows, total: total?.n ?? 0 };
}

/** Faturas em falta: as que já falharam (com o último erro) e as que estão na fila. */
export async function invoiceBacklog(issueFrom: string | null) {
  if (!issueFrom) return { failed: 0, waiting: 0, lastError: null as string | null };
  const [r] = await db().select({
    failed: sql<number>`(count(*) filter (where ${p.invoiceAttempts} > 0))::int`,
    waiting: sql<number>`(count(*) filter (where ${p.invoiceAttempts} = 0))::int`,
    lastError: sql<string | null>`(array_agg(${p.invoiceError} order by ${p.paidAt} desc) filter (where ${p.invoiceError} is not null))[1]`,
  }).from(p).leftJoin(inv, eq(inv.paymentId, p.id)).where(noInvoiceSql(issueFrom));
  return r ?? { failed: 0, waiting: 0, lastError: null };
}

/** Faturação das referências pagas de um mês. */
export async function invoicingOfMonth(month: string, issueFrom: string | null) {
  const [r] = await db().select({
    paid: sql<number>`count(*)::int`,
    withInvoice: sql<number>`(count(*) filter (where ${inv.id} is not null))::int`,
    beforeIssueFrom: issueFrom
      ? sql<number>`(count(*) filter (where ${inv.id} is null and ${p.paidAt} < ${luanda(issueFrom)}))::int`
      : sql<number>`(count(*) filter (where ${inv.id} is null))::int`,
  }).from(p).leftJoin(inv, eq(inv.paymentId, p.id))
    .where(and(eq(p.period, `${month}-01`), eq(p.status, "paid")));
  return r ?? { paid: 0, withInvoice: 0, beforeIssueFrom: 0 };
}

/* ---------------- Sistema ---------------- */

/** Última execução de cada tarefa e a última que correu bem. */
export async function jobStatus() {
  const j = schema.jobRuns;
  const [last, lastOk] = await Promise.all([
    db().selectDistinctOn([j.job]).from(j).orderBy(j.job, desc(j.startedAt)),
    db().selectDistinctOn([j.job]).from(j).where(eq(j.ok, true)).orderBy(j.job, desc(j.startedAt)),
  ]);
  return { last: new Map(last.map((r) => [r.job, r])), lastOk: new Map(lastOk.map((r) => [r.job, r])) };
}

export async function officegestLinkStats(consumerNif: string) {
  const [r] = await db().select({
    linked: sql<number>`(count(*) filter (where ${c.officegestId} is not null))::int`,
    withNif: sql<number>`(count(*) filter (where ${c.nif} is not null and ${c.nif} <> ${consumerNif}))::int`,
    invoices: sql<number>`(select count(*)::int from ${inv})`,
  }).from(c);
  return r ?? { linked: 0, withNif: 0, invoices: 0 };
}

export async function listUsers() {
  return db().select({
    user: schema.users,
    // Coluna qualificada à mão: dentro do subquery, um "id" solto seria o das sessões
    sessions: sql<number>`(select count(*)::int from ${schema.sessions} s where s.user_id = ${schema.users}.id and s.expires_at > now())`,
  }).from(schema.users).orderBy(desc(schema.users.active), schema.users.name);
}

/* ---------------- Pesquisa global ---------------- */

export async function globalSearch(q: string) {
  const digits = q.replace(/\D/g, "");
  const [clients, refs, docs] = await Promise.all([
    db().select({ id: c.id, name: c.name, ixcId: c.ixcId }).from(c).where(customerSearchSql(q)).orderBy(c.name).limit(5),
    digits.length >= 3
      ? db().select({ customerId: p.customerId, reference: p.reference, amountKz: p.amountKz }).from(p)
        .where(sql`${p.reference} like ${`${digits}%`}`).orderBy(desc(p.issuedAt)).limit(3)
      : Promise.resolve([]),
    q.length >= 3
      ? db().select({ customerId: inv.customerId, documentNumber: inv.documentNumber, total: inv.total }).from(inv)
        .where(ilike(inv.documentNumber, `%${escapeLike(q)}%`)).orderBy(desc(inv.date)).limit(3)
      : Promise.resolve([]),
  ]);
  return { clients, refs, docs };
}
