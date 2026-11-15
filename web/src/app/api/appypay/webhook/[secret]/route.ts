import { createHash, timingSafeEqual } from "node:crypto";
import { handleWebhook } from "@/lib/cycle/confirm";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ secret: string }> };

const MAX_BODY = 64 * 1024;
const digest = (s: string) => createHash("sha256").update(s).digest();
const json = (status: number, message: string) => Response.json({ message }, { status, headers: { "cache-control": "no-store" } });

// O segredo vale mesmo antes de as credenciais da AppyPay estarem no .env: o portal testa o URL ao gravar o webhook.
async function secretOk({ params }: Ctx) {
  const { secret } = await params;
  const expected = env().APPYPAY_WEBHOOK_SECRET?.trim();
  return !!expected && expected.length >= 24 && timingSafeEqual(digest(secret), digest(expected));
}

/** Para o portal da AppyPay (ou um browser) confirmar que o URL existe. */
export async function GET(_req: Request, ctx: Ctx) {
  return (await secretOk(ctx)) ? json(200, "OK") : json(404, "Not found");
}

// Notificação de pagamento da AppyPay. A AppyPay não assina os pedidos: o segredo vai no caminho do URL
// e o estado do pagamento é sempre confirmado de novo na AppyPay antes de dar a referência como paga.
export async function POST(req: Request, ctx: Ctx) {
  if (!(await secretOk(ctx))) return json(404, "Not found");

  const text = await req.text();
  if (text.length > MAX_BODY) return json(413, "Pedido demasiado grande");
  let body: unknown = {};
  try {
    if (text.trim()) body = JSON.parse(text);
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
