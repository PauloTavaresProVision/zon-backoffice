// Limite simples por janela fixa, em memória (um só processo web).
const buckets = new Map<string, { count: number; reset: number }>();

/** true enquanto a chave não passar de `limit` pedidos na janela. */
export function allow(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    if (buckets.size > 50_000) for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

/** IP do pedido, tal como o proxy HTTPS à frente da app o passa. */
export const requestIp = (req: Request) => (req.headers.get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
