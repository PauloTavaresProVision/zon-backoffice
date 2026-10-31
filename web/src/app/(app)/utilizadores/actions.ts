"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { attempt, positiveId, type ActionResult } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import { generatePassword, hashPassword } from "@/lib/auth/password";
import { destroyUserSessions, requireRole } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import type { Role } from "@/lib/db/schema";

const ROLES = ["admin", "operador", "consulta"] as const satisfies readonly Role[];

export type CreateUserState = { error?: string; password?: string; email?: string; name?: string };

const newUser = z.object({
  name: z.string().trim().min(2, "Indique o nome.").max(80),
  email: z.string().trim().toLowerCase().email("Email inválido."),
  role: z.enum(ROLES),
});

/** Cria o utilizador com uma palavra-passe gerada, mostrada uma única vez ao administrador. */
export async function createUser(_prev: CreateUserState, form: FormData): Promise<CreateUserState> {
  try {
    const admin = await requireRole("admin");
    const parsed = newUser.safeParse({ name: form.get("name"), email: form.get("email"), role: form.get("role") });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    const { name, email, role } = parsed.data;
    const [exists] = await db().select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1);
    if (exists) return { error: "Já existe um utilizador com este email." };
    const password = generatePassword();
    await db().insert(schema.users).values({ name, email, role, passwordHash: await hashPassword(password) });
    await logActivity({ kind: "user.created", userId: admin.id, message: `**${admin.name}** criou o utilizador **${name}** (${role})` });
    revalidatePath("/utilizadores");
    return { password, email, name };
  } catch (err) {
    unstable_rethrow(err);
    return { error: err instanceof Error ? err.message : "Erro inesperado." };
  }
}

async function loadOther(adminId: number, userId: number) {
  const id = positiveId(userId);
  if (id === adminId) throw new Error("Não pode alterar a sua própria conta aqui.");
  const [u] = await db().select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!u) throw new Error("Utilizador não encontrado.");
  return u;
}

export async function setUserActive(userId: number, active: boolean): Promise<ActionResult> {
  return attempt(async () => {
    const admin = await requireRole("admin");
    const u = await loadOther(admin.id, userId);
    const on = active === true;
    await db().update(schema.users).set({ active: on }).where(eq(schema.users.id, u.id));
    if (!on) await destroyUserSessions(u.id);
    await logActivity({ kind: "user.updated", userId: admin.id, message: `**${admin.name}** ${on ? "ativou" : "desativou"} **${u.name}**` });
    revalidatePath("/utilizadores");
    return on ? `${u.name} ativado` : `${u.name} desativado e sessões terminadas`;
  });
}

export async function setUserRole(userId: number, role: string): Promise<ActionResult> {
  return attempt(async () => {
    const admin = await requireRole("admin");
    const u = await loadOther(admin.id, userId);
    const r = z.enum(ROLES).parse(role);
    await db().update(schema.users).set({ role: r }).where(eq(schema.users.id, u.id));
    await logActivity({ kind: "user.updated", userId: admin.id, message: `**${admin.name}** mudou o perfil de **${u.name}** para ${r}` });
    revalidatePath("/utilizadores");
    return `${u.name}: perfil ${r}`;
  });
}

/** Nova palavra-passe gerada; as sessões abertas terminam. */
export async function resetUserPassword(userId: number): Promise<ActionResult> {
  return attempt(async () => {
    const admin = await requireRole("admin");
    const u = await loadOther(admin.id, userId);
    const password = generatePassword();
    await db().update(schema.users).set({ passwordHash: await hashPassword(password) }).where(eq(schema.users.id, u.id));
    await destroyUserSessions(u.id);
    await logActivity({ kind: "user.updated", userId: admin.id, message: `**${admin.name}** repôs a palavra-passe de **${u.name}**` });
    revalidatePath("/utilizadores");
    return { message: `Nova palavra-passe de ${u.name}`, value: password };
  });
}

export async function revokeUserSessions(userId: number): Promise<ActionResult> {
  return attempt(async () => {
    const admin = await requireRole("admin");
    const u = await loadOther(admin.id, userId);
    await destroyUserSessions(u.id);
    revalidatePath("/utilizadores");
    return `Sessões de ${u.name} terminadas`;
  });
}
