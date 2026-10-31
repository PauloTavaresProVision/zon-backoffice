"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { attempt, positiveId, type ActionResult } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import { requireRole } from "@/lib/auth/session";
import { codeMatches } from "@/lib/boxes/protocol";
import { db, schema } from "@/lib/db";

const b = schema.boxes;
const e = schema.boxEnrollments;

function refresh() {
  revalidatePath("/boxes");
  revalidatePath("/clientes/[id]", "page");
}

async function loadBox(id: number) {
  const [box] = await db().select().from(b).where(eq(b.id, positiveId(id))).limit(1);
  if (!box) throw new Error("Box não encontrada.");
  return box;
}

/**
 * Aprova o pedido de ativação e associa a box ao cliente. O código que a TV mostra prova que o pedido
 * vem da box que o técnico tem à frente (o serial da etiqueta pode ser copiado por outra).
 */
export async function approveEnrollment(enrollmentId: number, customerId: number, code: string): Promise<ActionResult> {
  return attempt(async () => {
    const user = await requireRole("operador");
    const [req] = await db().select().from(e).where(eq(e.id, positiveId(enrollmentId))).limit(1);
    if (!req) throw new Error("Pedido não encontrado: já foi aprovado ou rejeitado.");
    const [c] = await db().select().from(schema.customers).where(eq(schema.customers.id, positiveId(customerId))).limit(1);
    if (!c) throw new Error("Cliente não encontrado.");
    if (typeof code !== "string" || !codeMatches(req.fingerprint, code)) {
      throw new Error("O código não é o que aparece no ecrã da box. Confirme o serial e o código da instalação.");
    }
    const previous = await db().transaction(async (tx) => {
      const [other] = await tx.select({ serial: b.serial }).from(b).where(and(eq(b.fingerprint, req.fingerprint), ne(b.serial, req.serial))).limit(1);
      if (other) throw new Error(`Esta instalação já está aprovada como box ${other.serial}. Desassocie essa box primeiro.`);
      const [old] = await tx.select().from(b).where(eq(b.serial, req.serial)).limit(1);
      const values = {
        publicKey: req.publicKey, fingerprint: req.fingerprint, model: req.model, serialSource: req.serialSource,
        customerId: c.id, approvedAt: new Date(), approvedBy: user.id, lastSeenAt: null,
      };
      // Reinstalação da mesma box: troca a chave e mantém o bloqueio, se houver
      if (old) await tx.update(b).set(values).where(eq(b.id, old.id));
      else await tx.insert(b).values({ serial: req.serial, ...values });
      await tx.delete(e).where(eq(e.serial, req.serial));
      await tx.delete(schema.boxChallenges).where(eq(schema.boxChallenges.serial, req.serial));
      return old ?? null;
    });
    await logActivity({
      kind: "box.approved",
      customerId: c.id,
      userId: user.id,
      message: previous
        ? `Box **${req.serial}** reinstalada e aprovada de novo por **${user.name}**`
        : `Box **${req.serial}** associada e aprovada por **${user.name}**`,
      meta: { serial: req.serial, model: req.model, previousCustomerId: previous?.customerId ?? null },
    });
    if (previous?.customerId && previous.customerId !== c.id) {
      await logActivity({ kind: "box.removed", customerId: previous.customerId, userId: user.id, message: `Box **${req.serial}** passou para outro cliente (${c.name})` });
    }
    refresh();
    return `Box ${req.serial} aprovada para ${c.name}`;
  });
}

export async function rejectEnrollment(enrollmentId: number): Promise<ActionResult> {
  return attempt(async () => {
    const user = await requireRole("operador");
    const [req] = await db().delete(e).where(eq(e.id, positiveId(enrollmentId))).returning();
    if (!req) throw new Error("Pedido não encontrado.");
    await logActivity({ kind: "box.rejected", userId: user.id, message: `Pedido de ativação da box **${req.serial}** rejeitado por **${user.name}**` });
    refresh();
    return `Pedido da box ${req.serial} rejeitado`;
  });
}

/** Bloqueada, a box deixa de mostrar canais na sincronização seguinte (até 1 minuto com a app aberta). */
export async function setBoxBlocked(boxId: number, blocked: boolean): Promise<ActionResult> {
  return attempt(async () => {
    const user = await requireRole("operador");
    const box = await loadBox(boxId);
    const on = blocked === true;
    await db().update(b).set({ blockedAt: on ? new Date() : null }).where(eq(b.id, box.id));
    await logActivity({
      kind: on ? "box.blocked" : "box.unblocked",
      customerId: box.customerId,
      userId: user.id,
      message: `Box **${box.serial}** ${on ? "bloqueada" : "desbloqueada"} por **${user.name}**`,
    });
    refresh();
    return `Box ${box.serial} ${on ? "bloqueada" : "desbloqueada"}`;
  });
}

/** Tira a box ao cliente e apaga a chave: para voltar a ver TV precisa de novo pedido e aprovação. */
export async function removeBox(boxId: number): Promise<ActionResult> {
  return attempt(async () => {
    const user = await requireRole("operador");
    const box = await loadBox(boxId);
    await db().delete(b).where(eq(b.id, box.id));
    await db().delete(schema.boxChallenges).where(eq(schema.boxChallenges.serial, box.serial));
    await logActivity({
      kind: "box.removed",
      customerId: box.customerId,
      userId: user.id,
      message: `Box **${box.serial}** desassociada por **${user.name}**: precisa de nova aprovação`,
    });
    refresh();
    return `Box ${box.serial} desassociada`;
  });
}
