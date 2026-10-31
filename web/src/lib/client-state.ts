import type { Customer } from "@/lib/db/schema";
import { daysFrom, isoDay } from "@/lib/format";

// O estado que o backoffice mostra: o do IXC, mais "a expirar" para quem vence nos próximos 7 dias.
export type ClientStateKey = "active" | "expiring" | "late" | "inactive";
export type ClientFilter = "all" | ClientStateKey;
export const CLIENT_FILTERS: ClientFilter[] = ["all", "active", "expiring", "late", "inactive"];
export const EXPIRING_DAYS = 7;

export function clientState(c: Pick<Customer, "status" | "dueDate">, today = isoDay()): ClientStateKey {
  if (c.status === "inactive") return "inactive";
  if (c.status === "late") return "late";
  if (!c.dueDate) return "active";
  const n = daysFrom(c.dueDate, today);
  if (n < 0) return "late";
  return n <= EXPIRING_DAYS ? "expiring" : "active";
}

export const parseClientFilter = (v: unknown): ClientFilter =>
  CLIENT_FILTERS.includes(v as ClientFilter) ? (v as ClientFilter) : "all";
