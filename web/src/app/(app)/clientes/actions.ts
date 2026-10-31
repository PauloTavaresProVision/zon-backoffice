"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { attempt, positiveId, type ActionResult } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import { requireRole } from "@/lib/auth/session";
import { referenceNow, resendReference } from "@/lib/cycle/run";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { isoDay } from "@/lib/format";
import { publicInvoiceUrl } from "@/lib/links";
import { requireOfficegest, typeLabel } from "@/lib/officegest";
import { syncCustomerInvoices } from "@/lib/officegest/sync";

const LINK_DAYS = 30;

async function loadCustomer(id: number) {
  const [c] = await db().select().from(schema.customers).where(eq(schema.customers.id, id)).limit(1);
  if (!c) throw new Error("Cliente não encontrado.");
  return c;
}

/**
 * Ativa ou desativa o cliente no backoffice. Desativado, sai do ciclo de cobrança (sem referências nem SMS)
 * e a sincronização do IXC não o volta a ativar.
 */
export async function setClientActive(customerId: number, active: boolean): Promise<ActionResult> {
  return attempt(async () => {
    const user = await requireRole("operador");
    const c = await loadCustomer(positiveId(customerId));
    const on = active === true;
    const status = on ? (c.dueDate && c.dueDate < isoDay() ? "late" : "active") : "inactive";
    await db().update(schema.customers).set({ status, disabledAt: on ? null : new Date(), updatedAt: new Date() }).where(eq(schema.customers.id, c.id));
    await logActivity({
      kind: on ? "customer.activated" : "customer.deactivated",
      customerId: c.id,
      userId: user.id,
      message: on ? `Cliente ativado por **${user.name}**` : `Cliente desativado por **${user.name}**`,
    });
    revalidatePath(`/clientes/${c.id}`);
    return on ? `${c.name} ativado` : `${c.name} desativado`;
  });
}

/** Volta a ler do OfficeGest todas as faturas do cliente. Se ainda não estiver ligado, procura-o pelo NIF. */
export async function refreshClientInvoices(customerId: number): Promise<ActionResult> {
  return attempt(async () => {
    const user = await requireRole("consulta");
    const { client, cfg } = requireOfficegest();
    const c = await loadCustomer(positiveId(customerId));
    let ogId = c.officegestId;
    if (!ogId) {
      const nif = c.nif?.replace(/\s/g, "");
      if (!nif || nif === cfg.consumerNif) throw new Error("Cliente sem NIF: fica ligado ao OfficeGest na primeira fatura que o backoffice emitir.");
      ogId = await client.findCustomerByTaxId(nif);
      await db().update(schema.customers)
        .set({ officegestCheckedAt: new Date(), ...(ogId ? { officegestId: ogId } : {}) })
        .where(eq(schema.customers.id, c.id));
      if (!ogId) throw new Error(`Não há nenhum cliente com o NIF ${nif} no OfficeGest.`);
      await logActivity({ kind: "officegest.link", customerId: c.id, userId: user.id, message: `Cliente ligado ao OfficeGest pelo NIF (n.º **${ogId}**)` });
    }
    const n = await syncCustomerInvoices({ id: c.id, officegestId: ogId }, client);
    revalidatePath(`/clientes/${c.id}`);
    return n ? `${n} documento${n === 1 ? "" : "s"} atualizado${n === 1 ? "" : "s"} do OfficeGest` : "Sem documentos no OfficeGest para este cliente";
  });
}

/** Cria já a referência de um título do IXC (ou reaproveita a que está viva) e envia-a por SMS. */
export async function generateReferenceNow(receivableId: number): Promise<ActionResult> {
  return attempt(async () => {
    const user = await requireRole("operador");
    const msg = await referenceNow(positiveId(receivableId), user.id);
    revalidatePath("/clientes/[id]", "page");
    return msg;
  });
}

/** Volta a enviar por SMS uma referência por pagar. */
export async function resendReferenceSms(paymentId: number): Promise<ActionResult> {
  return attempt(async () => {
    const user = await requireRole("operador");
    const msg = await resendReference(positiveId(paymentId), user.id);
    revalidatePath("/clientes/[id]", "page");
    return msg;
  });
}

/** Só desenvolvimento: paga a referência na AppyPay simulada, que chama o webhook como a verdadeira. */
export async function simulatePayment(paymentId: number): Promise<ActionResult> {
  return attempt(async () => {
    await requireRole("operador");
    const mocks = env().DEV_MOCKS_URL?.replace(/\/+$/, "");
    if (!mocks) throw new Error("Só disponível com os simuladores de desenvolvimento.");
    const [p] = await db().select().from(schema.payments).where(eq(schema.payments.id, positiveId(paymentId))).limit(1);
    if (!p || p.status !== "pending") throw new Error("Esta referência já não está por pagar.");
    const res = await fetch(`${mocks}/__dev/appypay/pay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reference: p.reference }),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { message?: string; webhook?: string } | null;
    if (!res?.ok) throw new Error(body?.message ?? "O simulador não respondeu.");
    revalidatePath("/clientes/[id]", "page");
    return `Pagamento simulado · webhook: ${body?.webhook ?? "sem resposta"}`;
  });
}

/** Link público e temporário da fatura, para enviar ao cliente. */
export async function invoiceShareLink(invoiceId: number): Promise<ActionResult> {
  return attempt(async () => {
    const user = await requireRole("operador");
    const [i] = await db().select().from(schema.invoices).where(eq(schema.invoices.id, positiveId(invoiceId))).limit(1);
    if (!i) throw new Error("Fatura não encontrada.");
    if (i.cancelled) throw new Error("Esta fatura foi anulada; não se partilha.");
    await logActivity({
      kind: "invoice.link",
      customerId: i.customerId,
      userId: user.id,
      message: `Link da ${typeLabel(i.ogType).toLowerCase()} **${i.documentNumber}** criado por **${user.name}**`,
    });
    return { message: `Link copiado · válido ${LINK_DAYS} dias`, value: publicInvoiceUrl(i.id, LINK_DAYS) };
  });
}
