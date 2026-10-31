import { unstable_rethrow } from "next/navigation";

// O que as ações do servidor devolvem aos botões: uma mensagem para o toast e, às vezes, um valor.
export type ActionResult = { ok: boolean; message: string; value?: string };

export async function attempt(fn: () => Promise<string | { message: string; value?: string }>): Promise<ActionResult> {
  try {
    const r = await fn();
    return typeof r === "string" ? { ok: true, message: r } : { ok: true, ...r };
  } catch (err) {
    // Os redirecionamentos do Next (sessão expirada) têm de continuar a subir
    unstable_rethrow(err);
    return { ok: false, message: err instanceof Error ? err.message : "Erro inesperado." };
  }
}

export const positiveId = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error("Identificador inválido.");
  return n;
};
