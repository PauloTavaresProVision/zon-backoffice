// Aplica as migrações e cria o primeiro administrador. Corre antes de a app arrancar.
import path from "node:path";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { MIN_PASSWORD, hashPassword } from "@/lib/auth/password";
import { db, pool, schema } from "@/lib/db";

const log = (msg: string) => console.log(`[migrate] ${msg}`);

async function waitForDb(): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await pool().query("select 1");
      return;
    } catch (err) {
      if (i >= 30) throw err;
      log(`à espera da base de dados (${i})…`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function bootstrapAdmin(): Promise<void> {
  const [{ n } = { n: 0 }] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.users);
  if (n > 0) return;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = process.env.ADMIN_NAME?.trim() || "Administrador";
  if (!email || password.length < MIN_PASSWORD) {
    log(`sem utilizadores: defina ADMIN_EMAIL e ADMIN_PASSWORD (mín. ${MIN_PASSWORD} caracteres) para criar o administrador`);
    return;
  }
  await db().insert(schema.users).values({ email, name, role: "admin", passwordHash: await hashPassword(password) });
  log(`administrador ${email} criado`);
}

async function main(): Promise<void> {
  await waitForDb();
  const folder = process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "drizzle");
  await migrate(db(), { migrationsFolder: folder });
  log("migrações aplicadas");
  await bootstrapAdmin();
}

main()
  .then(() => pool().end())
  .catch(async (err) => {
    console.error("[migrate] falhou:", err);
    await pool().end().catch(() => undefined);
    process.exit(1);
  });
