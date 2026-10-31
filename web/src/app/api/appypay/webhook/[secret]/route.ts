import { createHash, timingSafeEqual } from "node:crypto";
import { handleWebhook } from "@/lib/cycle/confirm";
import { appypayConfig } from "@/lib/env";

export const dynamic = "force-dynamic";

const MAX_BODY = 64 * 1024;
const digest = (s: string) => createHash("sha256").update(s).digest();
const json = (status: number, message: string) => Response.json({ message }, { status, headers: { "cache-control": "no-store" } });

// Notificação de pagamento da AppyPay. A AppyPay não assina os pedidos: o segredo vai no caminho do URL
// e o estado do pagamento é sempre confirmado de novo na AppyPay antes de dar a referência como paga.
export async function POST(req: Request, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  const expected = appypayConfig()?.webhookSecret;
  if (!expected || expected.length < 24 || !timingSafeEqual(digest(secret), digest(expected))) return json(404, "Not found");

  const text = await req.text();
  if (text.length > MAX_BODY) return json(413, "Pedido demasiado grande");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, "JSON inválido");
  }
  try {
    const r = await handleWebhook(body);
    return json(r.status, r.message);
  } catch (err) {
    console.error("[appypay.webhook]", err instanceof Error ? err.message : err);
    // 503: a AppyPay volta a tentar; a verificação periódica também apanha o pagamento
    return json(503, "Indisponível; tente de novo");
  }
}
