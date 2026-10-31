import { officegestConfig, type OfficeGestConfig } from "@/lib/env";
import { OfficeGestClient } from "./client";

export { OfficeGestClient, OfficeGestError, isCancelled } from "./client";

const LABELS: Record<string, string> = {
  FR: "Fatura-recibo",
  FT: "Fatura",
  FS: "Fatura simplificada",
  NC: "Nota de crédito",
  ND: "Nota de débito",
  RE: "Recibo",
  RG: "Recibo",
};

export const typeLabel = (type: string) => LABELS[type.toUpperCase()] ?? type.toUpperCase();

export function officegest(): { client: OfficeGestClient; cfg: OfficeGestConfig } | null {
  const cfg = officegestConfig();
  return cfg ? { client: new OfficeGestClient(cfg), cfg } : null;
}

export function requireOfficegest(): { client: OfficeGestClient; cfg: OfficeGestConfig } {
  const og = officegest();
  if (!og) throw new Error("O OfficeGest não está configurado (OFFICEGEST_URL, OFFICEGEST_USER e OFFICEGEST_KEY).");
  return og;
}
