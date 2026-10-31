// Como o backoffice mostra uma box. A app sincroniza de minuto a minuto enquanto está aberta.
export const ONLINE_MS = 3 * 60_000;

export type BoxFilter = "all" | "online" | "offline" | "blocked";
export const parseBoxFilter = (v: string | undefined): BoxFilter =>
  v === "online" || v === "offline" || v === "blocked" ? v : "all";

export type BoxView = "online" | "offline" | "waiting" | "blocked" | "disabled" | "inactive" | "orphan";

export function boxView(
  box: { blockedAt: Date | null; lastSeenAt: Date | null },
  customer: { status: string; disabledAt: Date | null } | null,
  now = Date.now(),
): BoxView {
  if (box.blockedAt) return "blocked";
  if (!customer) return "orphan";
  if (customer.disabledAt) return "disabled";
  if (customer.status === "inactive") return "inactive";
  if (!box.lastSeenAt) return "waiting";
  return now - box.lastSeenAt.getTime() <= ONLINE_MS ? "online" : "offline";
}
