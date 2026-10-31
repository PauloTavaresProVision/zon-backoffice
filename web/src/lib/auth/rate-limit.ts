// Limite simples em memória (uma instância da app). Chega para travar tentativas de adivinhar palavras-passe.
const WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 8;

const attempts = new Map<string, { count: number; first: number }>();

export function allowAttempt(key: string, now = Date.now()): boolean {
  const a = attempts.get(key);
  if (!a || now - a.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: now });
    if (attempts.size > 5000) prune(now);
    return true;
  }
  a.count += 1;
  return a.count <= MAX_FAILS;
}

export function clearAttempts(key: string): void {
  attempts.delete(key);
}

function prune(now: number): void {
  for (const [k, v] of attempts) if (now - v.first > WINDOW_MS) attempts.delete(k);
}
