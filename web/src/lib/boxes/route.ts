import "server-only";
import { requestIp } from "@/lib/rate-limit";
import { DeviceError } from "./device";

const MAX_BODY = 16 * 1024;
const HEADERS = { "cache-control": "no-store" };

/** Lê o JSON da box, corre o passo do protocolo e responde como a app espera ({"detail"} nos erros). */
export async function deviceRoute<T>(req: Request, step: (body: Record<string, unknown>, ip: string) => Promise<T>): Promise<Response> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return Response.json({ detail: "Pedido demasiado grande." }, { status: 413, headers: HEADERS });
  const text = await req.text().catch(() => "");
  if (text.length > MAX_BODY) return Response.json({ detail: "Pedido demasiado grande." }, { status: 413, headers: HEADERS });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ detail: "JSON inválido." }, { status: 400, headers: HEADERS });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ detail: "JSON inválido." }, { status: 400, headers: HEADERS });
  try {
    return Response.json(await step(body as Record<string, unknown>, requestIp(req)), { headers: HEADERS });
  } catch (err) {
    if (err instanceof DeviceError) return Response.json({ detail: err.message }, { status: err.status, headers: HEADERS });
    console.error("[boxes] erro:", err);
    return Response.json({ detail: "Erro no servidor." }, { status: 503, headers: HEADERS });
  }
}
