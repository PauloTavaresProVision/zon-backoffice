import "server-only";
import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ONLINE_MS, type BoxFilter } from "./view";

const b = schema.boxes;
const c = schema.customers;
const e = schema.boxEnrollments;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

// Bloqueada à mão ou cliente desativado no backoffice: a box não vê TV
const blockedSql = sql`(${b.blockedAt} is not null or ${c.disabledAt} is not null)`;
const onlineSql = (since: Date) => sql`(${b.lastSeenAt} >= ${since} and not ${blockedSql})`;
// Pedidos de instalações que ainda não estão aprovadas
const openEnrollment = sql`not exists (select 1 from ${b} where ${b.fingerprint} = ${e.fingerprint})`;

export async function boxStats() {
  const since = new Date(Date.now() - ONLINE_MS);
  const [[r], [p]] = await Promise.all([
    db().select({
      total: sql<number>`count(*)::int`,
      online: sql<number>`(count(*) filter (where ${onlineSql(since)}))::int`,
      blocked: sql<number>`(count(*) filter (where ${blockedSql}))::int`,
      lastSeenAt: sql<Date | null>`max(${b.lastSeenAt})`,
    }).from(b).leftJoin(c, eq(c.id, b.customerId)),
    db().select({ n: count() }).from(e).where(openEnrollment),
  ]);
  const total = r?.total ?? 0;
  const online = r?.online ?? 0;
  const blocked = r?.blocked ?? 0;
  const last = r?.lastSeenAt ? new Date(r.lastSeenAt) : null;
  return { total, online, blocked, offline: Math.max(0, total - online - blocked), pending: p?.n ?? 0, lastSeenAt: last };
}

function filterSql(f: BoxFilter, since: Date): SQL | undefined {
  if (f === "online") return onlineSql(since);
  if (f === "blocked") return blockedSql;
  if (f === "offline") return sql`(not ${onlineSql(since)} and not ${blockedSql})`;
  return undefined;
}

export async function listBoxes(o: { filter: BoxFilter; q: string; page: number; pageSize: number }) {
  const since = new Date(Date.now() - ONLINE_MS);
  const like = `%${escapeLike(o.q)}%`;
  const digits = o.q.replace(/\D/g, "");
  const search = o.q
    ? or(ilike(b.serial, like), ilike(c.name, like), ilike(b.model, like), ...(digits.length >= 3 ? [sql`${c.ixcId}::text = ${digits}`] : []))
    : undefined;
  const where = and(filterSql(o.filter, since), search);
  const [rows, [t]] = await Promise.all([
    db().select({
      box: b,
      customer: { id: c.id, name: c.name, ixcId: c.ixcId, status: c.status, disabledAt: c.disabledAt },
    })
      .from(b).leftJoin(c, eq(c.id, b.customerId)).where(where)
      .orderBy(sql`${b.lastSeenAt} desc nulls last`, b.serial)
      .limit(o.pageSize).offset((o.page - 1) * o.pageSize),
    db().select({ n: count() }).from(b).leftJoin(c, eq(c.id, b.customerId)).where(where),
  ]);
  return { rows, total: t?.n ?? 0 };
}

/** Pedidos de ativação por aprovar, os mais recentes primeiro, com a box que já tiver este serial (reinstalação). */
export async function pendingEnrollments(limit = 20) {
  const [rows, [t]] = await Promise.all([
    // O serial é único nas boxes: no máximo uma linha por pedido. Com joins o Drizzle qualifica as colunas.
    db().select({ enrollment: e, existingCustomer: c.name }).from(e)
      .leftJoin(b, eq(b.serial, e.serial)).leftJoin(c, eq(c.id, b.customerId))
      .where(openEnrollment).orderBy(desc(e.lastSeenAt)).limit(limit),
    db().select({ n: count() }).from(e).where(openEnrollment),
  ]);
  return { rows, total: t?.n ?? 0 };
}

export async function customerBoxes(customerId: number) {
  return db()
    .select({ box: b, approvedBy: schema.users.name })
    .from(b)
    .leftJoin(schema.users, eq(schema.users.id, b.approvedBy))
    .where(eq(b.customerId, customerId))
    .orderBy(b.approvedAt);
}
