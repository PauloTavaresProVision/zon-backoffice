// Protocolo da app ZON TV (ver ManagementClient.kt). Funções puras, sem base de dados.
import { createHash, createPublicKey, verify, type KeyObject } from "node:crypto";
import { isoDay } from "@/lib/format";

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const SERIAL = /^[A-Z0-9][A-Z0-9._-]{3,79}$/;
const NOT_SERIALS = new Set(["UNKNOWN", "NULL", "NONE", "00000000"]);

/** Serial da etiqueta ou do Android, em maiúsculas. É só inventário: não prova nada. */
export function normalizeSerial(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toUpperCase();
  return SERIAL.test(s) && !NOT_SERIALS.has(s) ? s : null;
}

/** Chave pública da box (X.509 SubjectPublicKeyInfo em base64), RSA de 2048 bits gerada no AndroidKeyStore. */
export function parsePublicKey(b64: unknown): { key: KeyObject; fingerprint: string } | null {
  if (typeof b64 !== "string" || b64.length > 3000 || !BASE64.test(b64)) return null;
  try {
    const der = Buffer.from(b64, "base64");
    const key = createPublicKey({ key: der, format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "rsa" || key.asymmetricKeyDetails?.modulusLength !== 2048) return null;
    return { key, fingerprint: createHash("sha256").update(der).digest("hex").toUpperCase() };
  } catch {
    return null;
  }
}

/** Código da instalação que a box mostra no ecrã de ativação (12 primeiros caracteres do fingerprint). */
export const installCode = (fingerprint: string) => fingerprint.slice(0, 12);

/** O operador escreve o código que vê na TV; espaços e hífenes não contam. */
export function codeMatches(fingerprint: string, typed: string): boolean {
  const code = typed.replace(/[\s-]/g, "").toUpperCase();
  return code.length >= 12 && code.length <= 64 && fingerprint.startsWith(code);
}

/** Assinatura SHA256withRSA (PKCS#1 v1.5) sobre "ZON1\n<serial>\n<nonce>\n<payload>". */
export function verifySignature(publicKey: string, serial: string, nonce: string, payload: string, signature: string): boolean {
  const k = parsePublicKey(publicKey);
  if (!k || signature.length > 1000 || !BASE64.test(signature)) return false;
  try {
    return verify("sha256", Buffer.from(`ZON1\n${serial}\n${nonce}\n${payload}`, "utf8"), k.key, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

/** O que a box diz de si: base64 de {"appVersion","osVersion","catalogVersion"}. */
export function parsePayload(payload: string): { appVersion: string; osVersion: string; gridVersion: number } | null {
  if (payload.length > 4096 || !BASE64.test(payload)) return null;
  try {
    const o = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as Record<string, unknown>;
    if (!o || typeof o !== "object") return null;
    const grid = Number(o.catalogVersion ?? 0);
    return {
      appVersion: String(o.appVersion ?? "").slice(0, 60),
      osVersion: String(o.osVersion ?? "").slice(0, 60),
      gridVersion: Number.isInteger(grid) && grid >= 0 && grid < 2 ** 31 ? grid : 0,
    };
  } catch {
    return null;
  }
}

/** Estados que a app conhece: active (vê TV), pending (à espera de aprovação), blocked, expired. */
export type BoxState = "active" | "pending" | "blocked" | "expired";

/**
 * A box segue o cliente: bloqueada à mão ou cliente desativado no backoffice → blocked;
 * cliente inativo no IXC → expired. Em atraso continua a ver TV, com a referência nas Definições.
 */
export function boxState(box: { blockedAt: Date | null }, customer: { status: string; disabledAt: Date | null } | null): BoxState {
  if (box.blockedAt) return "blocked";
  if (!customer) return "pending";
  if (customer.disabledAt) return "blocked";
  if (customer.status === "inactive") return "expired";
  return "active";
}

/* ---------- Conta do cliente, para o ecrã Definições da app ---------- */

export type Billing = {
  customer: string;
  plan: string | null;
  // Referência por pagar: o que o cliente tem de pagar já
  pending: { entity: string; reference: string; amountKz: number; dueDate: string; validUntil: string } | null;
  // Quando é o próximo pagamento (o da referência pendente, se houver)
  nextPayment: { date: string; amountKz: number | null } | null;
  overdue: boolean;
  lastPaymentDate: string | null;
};

export type BillingInput = {
  name: string;
  planName: string | null;
  planPriceKz: number | null;
  dueDate: string | null;
  lastPaymentAt: Date | null;
  pending: { entity: string; reference: string; amountKz: number; validUntil: string; dueDate: string | null } | null;
  nextOpen: { dueDate: string; amountKz: number } | null;
};

export function billing(i: BillingInput, today: string): Billing {
  const pending = i.pending
    ? { entity: i.pending.entity, reference: i.pending.reference, amountKz: i.pending.amountKz, dueDate: i.pending.dueDate ?? i.pending.validUntil, validUntil: i.pending.validUntil }
    : null;
  const nextPayment = pending
    ? { date: pending.dueDate, amountKz: pending.amountKz }
    : i.nextOpen
      ? { date: i.nextOpen.dueDate, amountKz: i.nextOpen.amountKz }
      : i.dueDate ? { date: i.dueDate, amountKz: i.planPriceKz } : null;
  return {
    customer: i.name,
    plan: i.planName,
    pending,
    nextPayment,
    overdue: !!nextPayment && nextPayment.date < today,
    lastPaymentDate: i.lastPaymentAt ? isoDay(i.lastPaymentAt) : null,
  };
}
