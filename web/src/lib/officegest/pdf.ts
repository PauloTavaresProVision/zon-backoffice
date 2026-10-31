import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Invoice } from "@/lib/db/schema";
import { pdfRelPath, readPdf, savePdf } from "@/lib/storage";
import { OfficeGestError } from "./client";
import { requireOfficegest } from "./index";

// Pedidos em curso por fatura: dois cliques seguidos não pedem o PDF duas vezes ao OfficeGest.
const inflight = new Map<number, Promise<Buffer>>();

async function fetchAndStore(invoice: Invoice): Promise<Buffer> {
  const { client, cfg } = requireOfficegest();
  const { pdfUrl } = await client.getDocument(invoice.ogType, invoice.ogNumber, cfg.print);
  if (!pdfUrl) throw new OfficeGestError("O OfficeGest não devolveu o PDF deste documento.");
  const buf = await client.downloadPdf(pdfUrl);
  const rel = pdfRelPath(invoice.ogType, invoice.ogNumber);
  await savePdf(rel, buf);
  await db().update(schema.invoices).set({ pdfPath: rel, pdfFetchedAt: new Date() }).where(eq(schema.invoices.id, invoice.id));
  return buf;
}

/** PDF da fatura: do volume se já estiver guardado, senão pedido ao OfficeGest e guardado. */
export async function invoicePdf(invoiceId: number): Promise<{ invoice: Invoice; pdf: Buffer }> {
  const [invoice] = await db().select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).limit(1);
  if (!invoice) throw new Error("Fatura não encontrada.");
  if (invoice.pdfPath) {
    const cached = await readPdf(invoice.pdfPath);
    if (cached) return { invoice, pdf: cached };
  }
  let p = inflight.get(invoiceId);
  if (!p) {
    p = fetchAndStore(invoice).finally(() => inflight.delete(invoiceId));
    inflight.set(invoiceId, p);
  }
  return { invoice, pdf: await p };
}

export async function cacheInvoicePdf(invoiceId: number): Promise<void> {
  await invoicePdf(invoiceId);
}
