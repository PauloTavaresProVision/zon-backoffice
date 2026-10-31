import { currentUser } from "@/lib/auth/session";
import { pdfFileName } from "@/lib/format";
import { invoicePdf } from "@/lib/officegest/pdf";
import { pdfResponse, pdfError } from "@/lib/pdf-response";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return pdfError("A sessão expirou. Volte a entrar no backoffice.", 401);
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) return pdfError("Fatura inválida.", 400);
  try {
    const { invoice, pdf } = await invoicePdf(Number(id));
    const download = new URL(req.url).searchParams.get("download") === "1";
    return pdfResponse(pdf, pdfFileName(invoice.documentNumber), download);
  } catch (err) {
    return pdfError(err instanceof Error ? err.message : "Não foi possível obter o PDF.", 502);
  }
}
