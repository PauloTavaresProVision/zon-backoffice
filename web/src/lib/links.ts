import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

// Link público e assinado para o cliente abrir a fatura sem conta (ex.: enviado por SMS).
// Não dá acesso a mais nada e expira.
const PURPOSE = "invoice:";

function mac(payload: string): string {
  return createHmac("sha256", env().APP_SECRET).update(PURPOSE + payload).digest("base64url").slice(0, 32);
}

export function signInvoiceToken(invoiceId: number, ttlDays = 30, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + ttlDays * 86_400;
  const payload = `${invoiceId}.${exp}`;
  return `${Buffer.from(payload).toString("base64url")}.${mac(payload)}`;
}

export function verifyInvoiceToken(token: string, now = Date.now()): number | null {
  const [p, sig] = token.split(".");
  if (!p || !sig) return null;
  const payload = Buffer.from(p, "base64url").toString();
  const expected = mac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [id, exp] = payload.split(".").map(Number);
  if (!id || !exp || exp * 1000 < now) return null;
  return id;
}

export const publicInvoiceUrl = (invoiceId: number, ttlDays = 30) => `${env().APP_URL.replace(/\/+$/, "")}/f/${signInvoiceToken(invoiceId, ttlDays)}`;
