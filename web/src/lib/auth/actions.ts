"use server";

import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { db, schema } from "@/lib/db";
import { verifyPassword } from "./password";
import { allowAttempt, clearAttempts } from "./rate-limit";
import { createSession, currentUser, destroySession } from "./session";

export type LoginState = { error?: string; email?: string };

// Comparar com um hash real mesmo quando o email não existe: o tempo de resposta não revela contas.
const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function safeNext(raw: FormDataEntryValue | null): string {
  const s = typeof raw === "string" ? raw : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/dashboard";
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const remember = form.get("remember") === "on";
  if (!email || !password) return { error: "Preencha o email e a palavra-passe.", email };

  const ip = ((await headers()).get("x-forwarded-for") ?? "local").split(",")[0]!.trim();
  const key = `${ip}|${email}`;
  if (!allowAttempt(key)) return { error: "Demasiadas tentativas. Tente de novo dentro de 15 minutos.", email };

  const [user] = await db().select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1);
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) return { error: "Email ou palavra-passe errados.", email };

  clearAttempts(key);
  await createSession(user.id, remember);
  await db().update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  await logActivity({ kind: "login", message: `**${user.name}** entrou no backoffice`, userId: user.id });
  redirect(safeNext(form.get("next")));
}

export async function logout(): Promise<void> {
  const user = await currentUser();
  await destroySession();
  if (user) await logActivity({ kind: "logout", message: `**${user.name}** terminou a sessão`, userId: user.id });
  redirect("/entrar");
}
