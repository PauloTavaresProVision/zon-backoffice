import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, count, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isoDay } from "@/lib/format";
import { allow } from "@/lib/rate-limit";
import { gridFor } from "./grid";
import { billing, boxState, normalizeSerial, parsePayload, parsePublicKey, verifySignature, type Billing, type BoxState } from "./protocol";

/** Erro com o código HTTP que a app espera (403 = ainda não autorizada). */
export class DeviceError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const LEASE_SECONDS = 86_400;
const CHALLENGE_SECONDS = 60;
const ENROLLMENT_DAYS = 30;

const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);

function limit(key: string, n: number) {
  if (!allow(key, n)) throw new DeviceError(429, "Demasiados pedidos. Tenta daqui a um minuto.");
}

/** Pedido de ativação. Se a box já estiver aprovada com esta chave, devolve o estado dela. */
export async function enroll(body: Record<string, unknown>, ip: string): Promise<{ state: BoxState; fingerprint: string }> {
  limit(`enroll:${ip}`, 600);
  const serial = normalizeSerial(body.serial);
  if (!serial) throw new DeviceError(422, "Serial inválido: 4 a 80 letras, números, pontos, hífen ou sublinhado.");
  limit(`enroll:${serial}`, 8);
  const publicKey = str(body.public_key, 3000);
  const key = parsePublicKey(publicKey);
  if (!publicKey || !key) throw new DeviceError(422, "Chave RSA de 2048 bits inválida.");
  const source = body.source === "android" || body.source === "label" ? body.source : null;
  if (!source) throw new DeviceError(422, "Origem do serial inválida.");
  const model = (str(body.model, 120) ?? "").trim() || null;

  const [box] = await db().select().from(schema.boxes).where(eq(schema.boxes.serial, serial)).limit(1);
  if (box && box.publicKey === publicKey) {
    const customer = box.customerId ? await customerOf(box.customerId) : null;
    return { state: boxState(box, customer), fingerprint: key.fingerprint };
  }

  const e = schema.boxEnrollments;
  await db().delete(e).where(lt(e.lastSeenAt, new Date(Date.now() - ENROLLMENT_DAYS * 86_400_000)));
  const [{ n } = { n: 0 }] = await db().select({ n: count() }).from(e);
  if (n >= 10_000) throw new DeviceError(429, "Limite de pedidos pendentes.");
  await db().insert(e).values({ serial, publicKey, fingerprint: key.fingerprint, model, serialSource: source })
    .onConflictDoUpdate({ target: [e.serial, e.fingerprint], set: { lastSeenAt: new Date(), model, serialSource: source } });
  return { state: "pending", fingerprint: key.fingerprint };
}

/** Desafio de uma só utilização. Responde da mesma forma exista ou não a box. */
export async function challenge(body: Record<string, unknown>, ip: string): Promise<{ nonce: string }> {
  limit(`challenge:${ip}`, 6000);
  const serial = normalizeSerial(body.serial);
  if (!serial) throw new DeviceError(422, "Serial inválido.");
  limit(`challenge:${serial}`, 12);
  const c = schema.boxChallenges;
  await db().delete(c).where(lt(c.expiresAt, new Date()));
  const [{ n } = { n: 0 }] = await db().select({ n: count() }).from(c);
  if (n > 20_000) throw new DeviceError(429, "Tenta novamente.");
  const nonce = randomBytes(32).toString("base64url");
  await db().insert(c).values({ nonce, serial, expiresAt: new Date(Date.now() + CHALLENGE_SECONDS * 1000) });
  return { nonce };
}

export type SyncResult = {
  state: BoxState;
  client: string;
  expires: null;
  plan: string | null;
  version: number;
  channels?: { number: number; name: string; ip: string; port: number; category: string }[];
  billing: Billing | null;
  serverTime: number;
  leaseSeconds: number;
};

/** Sincronização assinada: prova a chave, regista a box e devolve estado, grelha e conta do cliente. */
export async function sync(body: Record<string, unknown>, ip: string): Promise<SyncResult> {
  limit(`sync:${ip}`, 6000);
  const rawSerial = str(body.serial, 80);
  const nonce = str(body.nonce, 100);
  const payload = str(body.payload, 4096);
  const signature = str(body.signature, 1000);
  const serial = normalizeSerial(rawSerial);
  if (!rawSerial || !serial || !nonce || !payload || !signature) throw new DeviceError(403, "Instalação não autorizada.");
  limit(`sync:${serial}`, 12);

  // O desafio gasta-se logo, mesmo que a assinatura falhe
  const c = schema.boxChallenges;
  const used = await db().delete(c).where(and(eq(c.nonce, nonce), eq(c.serial, serial), gt(c.expiresAt, new Date()))).returning({ nonce: c.nonce });
  const [box] = await db().select().from(schema.boxes).where(eq(schema.boxes.serial, serial)).limit(1);
  if (!used.length || !box || !verifySignature(box.publicKey, rawSerial, nonce, payload, signature)) {
    throw new DeviceError(403, "Instalação não autorizada.");
  }
  const info = parsePayload(payload);
  if (!info) throw new DeviceError(403, "Assinatura inválida.");
  await db().update(schema.boxes)
    .set({ lastSeenAt: new Date(), appVersion: info.appVersion || null, osVersion: info.osVersion || null, gridVersion: info.gridVersion })
    .where(eq(schema.boxes.id, box.id));

  const customer = box.customerId ? await customerOf(box.customerId) : null;
  const state = boxState(box, customer);
  const result: SyncResult = {
    state,
    client: customer?.name ?? "",
    expires: null,
    plan: customer?.planName ?? null,
    version: 0,
    billing: customer ? await billingFor(customer.id) : null,
    serverTime: Math.floor(Date.now() / 1000),
    leaseSeconds: LEASE_SECONDS,
  };
  if (state === "active") {
    const grid = await gridFor(customer?.gridId);
    result.version = grid.version;
    result.channels = grid.channels;
  }
  return result;
}

async function customerOf(id: number) {
  const [row] = await db()
    .select({ id: schema.customers.id, name: schema.customers.name, status: schema.customers.status, disabledAt: schema.customers.disabledAt, planName: schema.plans.name, gridId: schema.plans.gridId })
    .from(schema.customers)
    .leftJoin(schema.plans, eq(schema.plans.id, schema.customers.planId))
    .where(eq(schema.customers.id, id))
    .limit(1);
  return row ?? null;
}

/** Nome, referência por pagar e próximo pagamento do cliente, para o ecrã Definições da box. */
export async function billingFor(customerId: number, today = isoDay()): Promise<Billing | null> {
  const p = schema.payments;
  const r = schema.receivables;
  const [row] = await db()
    .select({ c: schema.customers, planName: schema.plans.name, planPriceKz: schema.plans.priceKz })
    .from(schema.customers)
    .leftJoin(schema.plans, eq(schema.plans.id, schema.customers.planId))
    .where(eq(schema.customers.id, customerId))
    .limit(1);
  if (!row) return null;
  const [pending] = await db()
    .select({ entity: p.entity, reference: p.reference, amountKz: p.amountKz, validUntil: p.dueDate, dueDate: r.dueDate })
    .from(p)
    .leftJoin(r, eq(r.ixcId, p.ixcReceivableId))
    .where(and(eq(p.customerId, customerId), eq(p.status, "pending")))
    .orderBy(asc(p.dueDate))
    .limit(1);
  const [nextOpen] = pending ? [] : await db()
    .select({ dueDate: r.dueDate, amountKz: r.amountKz })
    .from(r)
    .where(and(
      eq(r.customerId, customerId),
      eq(r.status, "A"),
      isNull(r.closedAt),
      sql`not exists (select 1 from ${p} where ${p.ixcReceivableId} = ${r.ixcId} and ${p.status} = 'paid')`,
    ))
    .orderBy(asc(r.dueDate))
    .limit(1);
  return billing({
    name: row.c.name,
    planName: row.planName,
    planPriceKz: row.planPriceKz,
    dueDate: row.c.dueDate,
    lastPaymentAt: row.c.lastPaymentAt,
    pending: pending ?? null,
    nextOpen: nextOpen ?? null,
  }, today);
}
