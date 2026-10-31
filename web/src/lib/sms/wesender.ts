import type { SmsConfig } from "@/lib/env";

/** Erro da WeSender ou de rede. A mensagem é segura para mostrar no backoffice. */
export class SmsError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "SmsError";
  }
}

const TIMEOUT_MS = 30_000;

/**
 * Envia uma SMS pela WeSender. O número vai em 9 dígitos, como a WeSender o aceita para Angola.
 * Devolve o id da mensagem quando a WeSender o indica.
 */
export async function wesenderSend(cfg: Pick<SmsConfig, "url" | "key">, phone: string, text: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      // CEspeciais: aceita acentos (a mensagem pode ocupar mais SMS)
      body: JSON.stringify({ ApiKey: cfg.key, Destino: [phone], Mensagem: text, CEspeciais: "true" }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError" ? "não respondeu a tempo" : "não está acessível";
    throw new SmsError(`A WeSender ${reason}.`);
  }
  const body = await res.text();
  let json: Record<string, unknown> | null = null;
  try { json = body ? (JSON.parse(body) as Record<string, unknown>) : null; } catch { json = null; }
  if (res.status === 401 || res.status === 403) throw new SmsError("A WeSender recusou a chave de API.", res.status);
  if (!res.ok || json?.succeeded === false) {
    const msg = typeof json?.message === "string" ? json.message : `HTTP ${res.status}`;
    throw new SmsError(`WeSender: ${msg.slice(0, 200)}`, res.status);
  }
  const data = json?.data && typeof json.data === "object" ? (json.data as Record<string, unknown>) : null;
  return data?.id !== undefined && data.id !== null ? String(data.id) : null;
}
