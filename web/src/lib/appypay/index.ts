import { appypayConfig, type AppyPayConfig } from "@/lib/env";
import { AppyPayClient } from "./client";

export { AppyPayClient, AppyPayError, isPaidStatus, toCharge } from "./client";
export type { AppyPayCharge } from "./client";

export function appypay(): { client: AppyPayClient; cfg: AppyPayConfig } | null {
  const cfg = appypayConfig();
  return cfg ? { client: new AppyPayClient(cfg), cfg } : null;
}

export function requireAppypay(): { client: AppyPayClient; cfg: AppyPayConfig } {
  const a = appypay();
  if (!a) throw new Error("A AppyPay não está configurada (APPYPAY_URL, APPYPAY_TOKEN_URL, APPYPAY_CLIENT_ID, APPYPAY_CLIENT_SECRET e APPYPAY_PAYMENT_METHOD).");
  return a;
}
