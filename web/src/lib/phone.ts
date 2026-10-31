/**
 * Telemóvel angolano em 9 dígitos (9XXXXXXXX), sem indicativo.
 * Aceita "+244 923 418 552", "00244923418552", "923-418-552"... Devolve null se não for um telemóvel.
 */
export function angolaMobile(raw: string | null | undefined): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00244")) d = d.slice(5);
  else if (d.startsWith("244") && d.length === 12) d = d.slice(3);
  return /^9\d{8}$/.test(d) ? d : null;
}

/** O primeiro telemóvel válido de uma lista de campos (o IXC tem vários: celular, fone, whatsapp). */
export function firstMobile(...values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    // Um campo pode ter dois números separados por "/" ou ","
    for (const part of (v ?? "").split(/[/,;]/)) {
      const m = angolaMobile(part);
      if (m) return m;
    }
  }
  return null;
}
