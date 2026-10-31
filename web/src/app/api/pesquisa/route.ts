import { currentUser } from "@/lib/auth/session";
import { globalSearch } from "@/lib/queries";

export async function POST(req: Request) {
  if (!(await currentUser())) return Response.json({ error: "Sessão expirada." }, { status: 401 });
  const body = await req.json().catch(() => null) as { q?: unknown } | null;
  const q = typeof body?.q === "string" ? body.q.trim().slice(0, 80) : "";
  if (q.length < 2) return Response.json({ clients: [], refs: [], docs: [] });
  return Response.json(await globalSearch(q), { headers: { "cache-control": "private, no-store" } });
}
