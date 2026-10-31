import { CircleAlert, CircleCheck, CirclePause, CircleX, Clock, type LucideIcon } from "lucide-react";
import type { ClientStateKey } from "@/lib/client-state";
import type { Payment } from "@/lib/db/schema";

export type Tone = "" | "good" | "warning" | "serious" | "critical" | "gold";
export type StateDef = { label: string; tone: Tone; Icon: LucideIcon };

export const CLIENT_STATE: Record<ClientStateKey, StateDef> = {
  active: { label: "Ativo", tone: "good", Icon: CircleCheck },
  expiring: { label: "A expirar", tone: "warning", Icon: Clock },
  late: { label: "Em atraso", tone: "serious", Icon: CircleAlert },
  inactive: { label: "Inativo", tone: "", Icon: CirclePause },
};

export const PAY_STATE: Record<Payment["status"], StateDef> = {
  paid: { label: "Paga", tone: "good", Icon: CircleCheck },
  pending: { label: "Pendente", tone: "warning", Icon: Clock },
  expired: { label: "Expirada", tone: "critical", Icon: CircleX },
};

export function Pill({ s, label }: { s: StateDef; label?: string }) {
  const { Icon } = s;
  return <span className={`pill ${s.tone}`}><Icon className="ico" aria-hidden />{label ?? s.label}</span>;
}
