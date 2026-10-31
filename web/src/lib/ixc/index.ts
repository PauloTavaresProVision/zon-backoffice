import { ixcConfig, type IxcConfig } from "@/lib/env";
import { IxcClient } from "./client";

export { IxcClient, IxcError, fromIxcDate, ixcDate, ixcMoney } from "./client";

// Estados do contrato e da internet no IXC, para mostrar no backoffice
export const CONTRACT_STATUS: Record<string, string> = {
  P: "Pré-contrato", A: "Ativo", I: "Inativo", N: "Negativado", D: "Desistiu",
};
export const INTERNET_STATUS: Record<string, string> = {
  A: "Internet ativa", D: "Internet desativada", CM: "Bloqueio manual", CA: "Bloqueio automático",
  FA: "Financeiro em atraso", AA: "Aguarda assinatura",
};
/** Estados da internet que significam serviço cortado. */
export const BLOCKED_INTERNET = ["CM", "CA", "FA"];

export function ixc(): { client: IxcClient; cfg: IxcConfig } | null {
  const cfg = ixcConfig();
  return cfg ? { client: new IxcClient(cfg), cfg } : null;
}

export function requireIxc(): { client: IxcClient; cfg: IxcConfig } {
  const x = ixc();
  if (!x) throw new Error("O IXC não está configurado (IXC_URL e IXC_TOKEN).");
  return x;
}
