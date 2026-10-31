import { and, eq, isNull, sql } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { db, schema } from "@/lib/db";
import type { Customer } from "@/lib/db/schema";
import type { OfficeGestConfig } from "@/lib/env";
import { isoDay, monthLabel } from "@/lib/format";
import type { OfficeGestClient } from "./client";
import { requireOfficegest, typeLabel } from "./index";
import { cacheInvoicePdf } from "./pdf";
import { syncCustomerInvoices } from "./sync";

const LEASE_MINUTES = 15;
const MAX_BACKOFF_MINUTES = 60;

/**
 * Garante que o cliente existe no OfficeGest. Procura pelo NIF e só cria se não encontrar.
 * Sem NIF usa o de consumidor final e nunca inventa email.
 */
export async function ensureOfficegestCustomer(customer: Customer, client: OfficeGestClient, cfg: OfficeGestConfig): Promise<number> {
  if (customer.officegestId) return customer.officegestId;
  const nif = customer.nif?.replace(/\s/g, "") || null;
  let ogId = nif && nif !== cfg.consumerNif ? await client.findCustomerByTaxId(nif) : null;
  const created = !ogId;
  if (!ogId) {
    ogId = await client.createCustomer({
      name: customer.name,
      customertaxid: nif ?? cfg.consumerNif,
      mobilephone: customer.phone,
      email: customer.email,
      address: customer.zone ? `${customer.zone}, ${customer.city}` : customer.city,
      city: customer.city,
      country: "AO",
    });
  }
  await db().update(schema.customers).set({ officegestId: ogId, officegestCheckedAt: new Date() }).where(eq(schema.customers.id, customer.id));
  await logActivity({
    kind: "officegest.link",
    customerId: customer.id,
    message: created ? `Cliente criado no OfficeGest (n.º **${ogId}**)` : `Cliente ligado ao OfficeGest pelo NIF (n.º **${ogId}**)`,
  });
  // Traz o histórico de faturas que o cliente já tinha no OfficeGest
  if (!created) await syncCustomerInvoices({ id: customer.id, officegestId: ogId }, client);
  return ogId;
}

/** Reserva até `limit` pagamentos por faturar. A reserva expira, por isso um worker que caia não bloqueia nada. */
async function claim(limit: number, issueFrom: string, onlyIds?: number[]): Promise<number[]> {
  const ids = onlyIds?.length ? sql`and p.id in (${sql.join(onlyIds.map((i) => sql`${i}`), sql`, `)})` : sql``;
  const res = await db().execute<{ id: number }>(sql`
    update payments set invoice_claimed_until = now() + make_interval(mins => ${LEASE_MINUTES})
    where id in (
      select p.id from payments p
      where p.status = 'paid'
        and p.paid_at >= (${issueFrom}::date)::timestamp at time zone 'Africa/Luanda'
        and not exists (select 1 from invoices i where i.payment_id = p.id)
        and (p.invoice_next_attempt_at is null or p.invoice_next_attempt_at <= now())
        and (p.invoice_claimed_until is null or p.invoice_claimed_until < now())
        ${ids}
      order by p.paid_at
      limit ${limit}
      for update skip locked
    )
    returning id`);
  return res.rows.map((r) => Number(r.id));
}

/**
 * Se uma tentativa anterior caiu depois de o OfficeGest criar o documento, ele já existe:
 * procura-o (mesmo cliente, mesmo valor, ainda sem pagamento associado) em vez de criar outro.
 */
async function findOrphan(client: OfficeGestClient, type: string, ogCustomerId: number, amount: number, since: string) {
  const page = await client.listDocuments(type, { filters: { idcustomer: String(ogCustomerId) }, order: "number", sorder: "DESC", limit: 20 });
  for (const d of page.documents) {
    if (d.date < since || Math.abs(d.total - amount) > 0.5) continue;
    const [linked] = await db().select({ id: schema.invoices.id }).from(schema.invoices)
      .where(and(eq(schema.invoices.ogType, type), eq(schema.invoices.ogNumber, d.number), sql`${schema.invoices.paymentId} is not null`)).limit(1);
    if (!linked) return d;
  }
  return null;
}

async function issueOne(paymentId: number, client: OfficeGestClient, cfg: OfficeGestConfig): Promise<string> {
  const [row] = await db().select().from(schema.payments)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.payments.customerId))
    .leftJoin(schema.plans, eq(schema.plans.id, schema.customers.planId))
    .where(eq(schema.payments.id, paymentId)).limit(1);
  if (!row) throw new Error(`Pagamento ${paymentId} não existe.`);
  const { payments: p, customers: c, plans: plan } = row;
  if (!cfg.articleId) throw new Error("Falta OFFICEGEST_ARTICLE_ID: o artigo da mensalidade no OfficeGest.");

  const ogCustomerId = await ensureOfficegestCustomer(c, client, cfg);
  const type = cfg.issueType;
  const description = [`Mensalidade${plan ? ` ${plan.name}` : ""}`, monthLabel(p.period.slice(0, 7)), `Ref. Multicaixa ${p.reference}`].join(" · ");

  const orphan = p.invoiceAttempts > 0 ? await findOrphan(client, type, ogCustomerId, p.amountKz, isoDay(p.paidAt ?? p.issuedAt)) : null;
  const doc = orphan ?? await client.createDocument(type, {
    idcustomer: ogCustomerId,
    lines: [{ idarticle: cfg.articleId, quantity: 1, sellingprice: p.amountKz, extradescription: description, vatid: cfg.vatId }],
  });

  await db().transaction(async (tx) => {
    const values = {
      customerId: c.id,
      paymentId: p.id,
      documentNumber: doc.documentNumber,
      date: doc.date || isoDay(),
      total: doc.total || p.amountKz,
      state: doc.state,
      description,
      origin: "backoffice" as const,
      syncedAt: new Date(),
    };
    // A sincronização pode já ter trazido o documento; nesse caso só se associa ao pagamento
    await tx.insert(schema.invoices).values({ ...values, ogType: type, ogNumber: doc.number })
      .onConflictDoUpdate({ target: [schema.invoices.ogType, schema.invoices.ogNumber], set: { paymentId: p.id, description, origin: "backoffice" } });
    await tx.update(schema.payments)
      .set({ invoiceClaimedUntil: null, invoiceError: null, invoiceNextAttemptAt: null })
      .where(eq(schema.payments.id, p.id));
  });
  await logActivity({
    kind: "invoice.issued",
    customerId: c.id,
    message: `${typeLabel(type)} **${doc.documentNumber}** emitida`,
    meta: { paymentId: p.id, reference: p.reference },
  });

  // O PDF fica guardado já; se falhar agora, é pedido quando alguém o abrir
  const [inv] = await db().select({ id: schema.invoices.id }).from(schema.invoices)
    .where(and(eq(schema.invoices.ogType, type), eq(schema.invoices.ogNumber, doc.number))).limit(1);
  if (inv) await cacheInvoicePdf(inv.id).catch(() => undefined);
  return doc.documentNumber;
}

async function recordFailure(paymentId: number, err: unknown): Promise<void> {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
  await db().update(schema.payments).set({
    invoiceAttempts: sql`${schema.payments.invoiceAttempts} + 1`,
    invoiceError: message,
    invoiceClaimedUntil: null,
    // 1, 2, 4, 8… minutos, no máximo uma hora
    invoiceNextAttemptAt: sql`now() + make_interval(mins => least(${MAX_BACKOFF_MINUTES}, power(2, ${schema.payments.invoiceAttempts})::int))`,
  }).where(eq(schema.payments.id, paymentId));
}

export type IssueResult = { issued: string[]; failed: number; disabled?: string };

/** Emite a fatura-recibo dos pagamentos confirmados que ainda não a têm. */
export async function issuePendingInvoices(opts: { limit?: number; onlyIds?: number[] } = {}): Promise<IssueResult> {
  const { client, cfg } = requireOfficegest();
  if (!cfg.issueFrom) return { issued: [], failed: 0, disabled: "Emissão desligada: falta OFFICEGEST_ISSUE_FROM." };
  const ids = await claim(opts.limit ?? 25, cfg.issueFrom, opts.onlyIds);
  const issued: string[] = [];
  let failed = 0;
  for (const id of ids) {
    try {
      issued.push(await issueOne(id, client, cfg));
    } catch (err) {
      failed += 1;
      await recordFailure(id, err);
    }
  }
  return { issued, failed };
}

/** Volta a pôr na fila os pagamentos que falharam, para o botão "Repetir agora". */
export async function retryFailedNow(): Promise<number[]> {
  const rows = await db().update(schema.payments)
    .set({ invoiceNextAttemptAt: null })
    .where(and(eq(schema.payments.status, "paid"), sql`${schema.payments.invoiceAttempts} > 0`,
      sql`not exists (select 1 from ${schema.invoices} i where i.payment_id = ${schema.payments.id})`,
      isNull(schema.payments.invoiceClaimedUntil)))
    .returning({ id: schema.payments.id });
  return rows.map((r) => r.id);
}
