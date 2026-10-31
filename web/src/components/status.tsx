import { CircleAlert, CircleCheck, CirclePause, CircleX, Clock, Lock, PowerOff, Unlink, Wifi, WifiOff, type LucideIcon } from "lucide-react";
import type { BoxView } from "@/lib/boxes/view";
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

export const SMS_KIND: Record<string, string> = {
  stage_7: "Referência (7 dias)",
  stage_3: "Lembrete (3 dias)",
  stage_1: "Último aviso",
  paid: "Pagamento recebido",
  manual: "Reenviada",
};

export const SMS_STATE: Record<string, StateDef> = {
  sent: { label: "Enviada", tone: "good", Icon: CircleCheck },
  failed: { label: "Falhou", tone: "critical", Icon: CircleX },
};

export const BOX_STATE: Record<BoxView, StateDef> = {
  online: { label: "Ligada", tone: "good", Icon: Wifi },
  offline: { label: "Sem contacto", tone: "", Icon: WifiOff },
  waiting: { label: "À espera da box", tone: "warning", Icon: Clock },
  blocked: { label: "Bloqueada", tone: "critical", Icon: Lock },
  disabled: { label: "Cliente desativado", tone: "critical", Icon: PowerOff },
  inactive: { label: "Cliente inativo", tone: "", Icon: CirclePause },
  orphan: { label: "Sem cliente", tone: "warning", Icon: Unlink },
};

export function Pill({ s, label }: { s: StateDef; label?: string }) {
  const { Icon } = s;
  return <span className={`pill ${s.tone}`}><Icon className="ico" aria-hidden />{label ?? s.label}</span>;
}
