import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { pdfFileName } from "@/lib/format";
import { verifyInvoiceToken } from "@/lib/links";
import { invoicePdf } from "@/lib/officegest/pdf";
import { pdfError, pdfResponse } from "@/lib/pdf-response";

// Link público da fatura (ex.: enviado por SMS). Só abre aquele documento e expira.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = token.length < 200 ? verifyInvoiceToken(token) : null;
  if (!id) return pdfError("Este link não é válido ou já expirou. Peça um novo à ZON.", 404);
  const [row] = await db().select({ cancelled: schema.invoices.cancelled }).from(schema.invoices).where(eq(schema.invoices.id, id)).limit(1);
  if (!row) return pdfError("Fatura não encontrada.", 404);
  if (row.cancelled) return pdfError("Esta fatura foi anulada.", 410);
  try {
    const { invoice, pdf } = await invoicePdf(id);
    return pdfResponse(pdf, pdfFileName(invoice.documentNumber), false);
  } catch {
    return pdfError("A fatura não está disponível neste momento. Tente mais tarde.", 503);
  }
}
