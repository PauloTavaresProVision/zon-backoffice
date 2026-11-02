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
 * Lê a resposta da WeSender: `{ "Exito": true, "Mensagem": "Foram enviados 1 de 1 mensagens", "Objeto": {...} }`
 * (às vezes "Message" em vez de "Mensagem"). Não traz id da mensagem: devolve o texto da WeSender para o histórico.
 * Só conta como enviada com Exito a true e, quando o texto diz "X de Y", com todas enviadas.
 */
export function readWesenderReply(status: number, json: Record<string, unknown> | null): string {
  if (status === 401 || status === 403) throw new SmsError("A WeSender recusou a chave de API.", status);
  const text = [json?.Mensagem, json?.Message, json?.message].find((v): v is string => typeof v === "string")?.trim().slice(0, 200) ?? "";
  if (status < 200 || status >= 300) throw new SmsError(`WeSender: ${text || `HTTP ${status}`}`, status);
  if (json?.Exito !== true) throw new SmsError(`WeSender: ${text || "resposta sem confirmação de envio"}`, status);
  const count = /(\d+)\s+de\s+(\d+)/.exec(text);
  if (count && Number(count[1]) < Number(count[2])) throw new SmsError(`WeSender: ${text}`, status);
  return text;
}

/**
 * Envia uma SMS pela WeSender. O número vai em 9 dígitos, como a WeSender o aceita para Angola.
 * Devolve a resposta da WeSender (ex.: "Foram enviados 1 de 1 mensagens").
 */
export async function wesenderSend(cfg: Pick<SmsConfig, "url" | "key">, phone: string, text: string): Promise<string> {
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
  return readWesenderReply(res.status, json);
}
