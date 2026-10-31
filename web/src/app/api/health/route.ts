import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

// Usado pelo HEALTHCHECK do Docker: a app responde e a base de dados também.
export async function GET() {
  try {
    await pool().query("select 1");
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
