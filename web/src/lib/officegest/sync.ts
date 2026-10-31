import { and, eq, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { db, schema } from "@/lib/db";
import type { Customer } from "@/lib/db/schema";
import { kvGet, kvSet } from "@/lib/kv";
import { deletePdf } from "@/lib/storage";
import type { OfficeGestClient, OgDocumentSummary } from "./client";
import { isCancelled, requireOfficegest, typeLabel } from "./index";

const PAGE = 200;
const cursorKey = (type: string) => `officegest.sync.cursor.${type}`;

/** officegestId → id do cliente no backoffice (o mais antigo, se o NIF estiver repetido no IXC). */
async function customerMap(): Promise<Map<number, number>> {
  const rows = await db().select({ id: schema.customers.id, og: schema.customers.officegestId })
    .from(schema.customers).where(isNotNull(schema.customers.officegestId)).orderBy(schema.customers.id);
  const map = new Map<number, number>();
  for (const r of rows) if (r.og && !map.has(r.og)) map.set(r.og, r.id);
  return map;
}

/** Grava os documentos dos clientes conhecidos. Idempotente: pode ler o mesmo documento várias vezes. */
export async function upsertDocuments(type: string, docs: OgDocumentSummary[], customers: Map<number, number>): Promise<number> {
  const known = docs.filter((d) => d.number && d.idcustomer && customers.has(d.idcustomer) && d.date);
  if (!known.length) return 0;
  const existing = await db().select({
    id: schema.invoices.id, ogNumber: schema.invoices.ogNumber, cancelled: schema.invoices.cancelled,
    pdfPath: schema.invoices.pdfPath, documentNumber: schema.invoices.documentNumber, customerId: schema.invoices.customerId,
  }).from(schema.invoices).where(and(eq(schema.invoices.ogType, type), inArray(schema.invoices.ogNumber, known.map((d) => d.number))));
  const byNumber = new Map(existing.map((e) => [e.ogNumber, e]));

  for (const d of known) {
    const cancelled = isCancelled(d.state);
    const values = {
      documentNumber: d.documentNumber,
      date: d.date,
      total: d.total,
      paidValue: d.paidValue,
      state: d.state,
      cancelled,
      ogAlteredAt: d.dateAlter,
      syncedAt: new Date(),
    };
    const prev = byNumber.get(d.number);
    if (prev) {
      // Anulado entretanto: o PDF guardado deixa de ser o atual
      const becameCancelled = cancelled && !prev.cancelled;
      await db().update(schema.invoices)
        .set(becameCancelled ? { ...values, pdfPath: null, pdfFetchedAt: null } : values)
        .where(eq(schema.invoices.id, prev.id));
      if (becameCancelled) {
        if (prev.pdfPath) await deletePdf(prev.pdfPath);
        await logActivity({ kind: "invoice.cancelled", customerId: prev.customerId, message: `${typeLabel(type)} **${prev.documentNumber}** anulada no OfficeGest` });
      }
    } else {
      await db().insert(schema.invoices).values({
        ...values,
        customerId: customers.get(d.idcustomer!)!,
        ogType: type,
        ogNumber: d.number,
        description: typeLabel(type),
        origin: "officegest",
      }).onConflictDoNothing();
    }
  }
  return known.length;
}

/**
 * Sincronização incremental de todas as faturas: lê o que mudou desde a última vez em cada tipo.
 * O cursor é a maior `date_alter` que o próprio OfficeGest devolveu, para não depender do relógio nem do fuso.
 */
export async function syncAllInvoices(): Promise<string> {
  const { client, cfg } = requireOfficegest();
  const customers = await customerMap();
  let seen = 0;
  let saved = 0;
  for (const type of cfg.docTypes) {
    const cursor = await kvGet(cursorKey(type));
    let max = cursor;
    let offset = 0;
    for (;;) {
      const page = await client.listDocuments(type, {
        ...(cursor ? { filters: { date_alter: cursor }, operator: ">=" } : {}),
        order: "number", sorder: "ASC", limit: PAGE, offset,
      });
      seen += page.documents.length;
      saved += await upsertDocuments(type, page.documents, customers);
      for (const d of page.documents) if (d.dateAlter && (!max || d.dateAlter > max)) max = d.dateAlter;
      offset += page.documents.length;
      if (page.documents.length < PAGE || (page.total !== null && offset >= page.total)) break;
    }
    if (max && max !== cursor) await kvSet(cursorKey(type), max);
  }
  const linked = await linkCustomersByNif(client, cfg.consumerNif);
  return `${saved} documentos de clientes atualizados (${seen} lidos)` + (linked ? ` · ${linked} clientes ligados ao OfficeGest` : "");
}

/** Todas as faturas de um cliente, de todos os tipos. Usado no botão Atualizar e quando o cliente é ligado. */
export async function syncCustomerInvoices(customer: Pick<Customer, "id" | "officegestId">, client?: OfficeGestClient): Promise<number> {
  if (!customer.officegestId) return 0;
  const og = requireOfficegest();
  const c = client ?? og.client;
  const map = new Map([[customer.officegestId, customer.id]]);
  let saved = 0;
  for (const type of og.cfg.docTypes) {
    let offset = 0;
    for (;;) {
      const page = await c.listDocuments(type, { filters: { idcustomer: String(customer.officegestId) }, order: "number", sorder: "ASC", limit: PAGE, offset });
      saved += await upsertDocuments(type, page.documents, map);
      offset += page.documents.length;
      if (page.documents.length < PAGE || (page.total !== null && offset >= page.total)) break;
    }
  }
  return saved;
}

/**
 * Liga ao OfficeGest os clientes com NIF que ainda não estão ligados. Não cria clientes:
 * isso só acontece quando é preciso emitir uma fatura. Cada cliente é revisto no máximo uma vez por semana.
 */
export async function linkCustomersByNif(client: OfficeGestClient, consumerNif: string, limit = 100): Promise<number> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const pending = await db().select().from(schema.customers).where(and(
    isNull(schema.customers.officegestId),
    isNotNull(schema.customers.nif),
    ne(schema.customers.nif, consumerNif),
    or(isNull(schema.customers.officegestCheckedAt), lt(schema.customers.officegestCheckedAt, weekAgo)),
  )).limit(limit);
  let linked = 0;
  for (const c of pending) {
    const ogId = await client.findCustomerByTaxId(c.nif!);
    await db().update(schema.customers)
      .set({ officegestCheckedAt: new Date(), ...(ogId ? { officegestId: ogId } : {}) })
      .where(eq(schema.customers.id, c.id));
    if (ogId) {
      linked += 1;
      await logActivity({ kind: "officegest.link", customerId: c.id, message: `Cliente ligado ao OfficeGest pelo NIF (n.º **${ogId}**)` });
      await syncCustomerInvoices({ id: c.id, officegestId: ogId }, client);
    }
  }
  return linked;
}

export async function invoiceCounts(): Promise<{ total: number; linkedCustomers: number }> {
  const [row] = await db().select({
    total: sql<number>`(select count(*)::int from ${schema.invoices})`,
    linkedCustomers: sql<number>`(select count(*)::int from ${schema.customers} where ${schema.customers.officegestId} is not null)`,
  }).from(sql`(select 1) as one`);
  return row ?? { total: 0, linkedCustomers: 0 };
}
