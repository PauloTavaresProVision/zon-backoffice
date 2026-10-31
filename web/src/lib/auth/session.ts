import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "@/lib/db";
import type { Role, User } from "@/lib/db/schema";
import { env } from "@/lib/env";

const COOKIE = "zb_session";
const SHORT_HOURS = 12;
const LONG_DAYS = 30;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export type SessionUser = Pick<User, "id" | "email" | "name" | "role">;

export async function createSession(userId: number, remember: boolean): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const ms = remember ? LONG_DAYS * 86_400_000 : SHORT_HOURS * 3_600_000;
  const expiresAt = new Date(Date.now() + ms);
  const h = await headers();
  await db().insert(schema.sessions).values({
    id: sha256(token),
    userId,
    expiresAt,
    ip: (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  });
  // Limpeza oportunista das sessões caducadas
  await db().delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().COOKIE_SECURE === "true",
    path: "/",
    ...(remember ? { expires: expiresAt } : {}),
  });
}

/** Sessão do pedido atual, ou null. Memorizada por pedido. */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const id = sha256(token);
  const [row] = await db()
    .select({
      id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role,
      lastSeenAt: schema.sessions.lastSeenAt,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, id), gt(schema.sessions.expiresAt, new Date()), eq(schema.users.active, true)))
    .limit(1);
  if (!row) return null;
  if (Date.now() - row.lastSeenAt.getTime() > 5 * 60_000) {
    await db().update(schema.sessions).set({ lastSeenAt: sql`now()` }).where(eq(schema.sessions.id, id));
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  return user;
}

const RANK: Record<Role, number> = { consulta: 0, operador: 1, admin: 2 };

export class ForbiddenError extends Error {
  constructor() { super("Sem permissão para esta ação."); }
}

/** Para ações que alteram dados. Lança erro se o perfil não chegar. */
export async function requireRole(min: Role): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (RANK[user.role] < RANK[min]) throw new ForbiddenError();
  return user;
}

export const canEdit = (user: SessionUser, min: Role = "operador") => RANK[user.role] >= RANK[min];

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db().delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  jar.delete(COOKIE);
}

export async function destroyUserSessions(userId: number): Promise<void> {
  await db().delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}
