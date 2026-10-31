import { eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { ogDateTime } from "@/lib/format";

// CSV para a contabilidade: separador ";" e BOM, para o Excel em português abrir bem.
const cell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Evita fórmulas injetadas quando o ficheiro é aberto no Excel
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET(req: Request) {
  if (!(await currentUser())) return new Response("Sessão expirada.", { status: 401 });
  const mes = new URL(req.url).searchParams.get("mes") ?? "";
  if (!/^\d{4}-\d{2}$/.test(mes)) return new Response("Mês inválido.", { status: 400 });
  const p = schema.payments;
  const rows = await db().select({
    reference: p.reference, entity: p.entity, amountKz: p.amountKz, status: p.status, issuedAt: p.issuedAt, dueDate: p.dueDate, paidAt: p.paidAt,
    ixcId: schema.customers.ixcId, name: schema.customers.name, nif: schema.customers.nif, invoice: schema.invoices.documentNumber,
  }).from(p)
    .innerJoin(schema.customers, eq(schema.customers.id, p.customerId))
    .leftJoin(schema.invoices, eq(schema.invoices.paymentId, p.id))
    .where(eq(p.period, `${mes}-01`))
    .orderBy(p.issuedAt);
  const head = ["Referência", "Entidade", "Valor (Kz)", "Estado", "Emitida", "Validade", "Paga em", "N.º IXC", "Cliente", "NIF", "Fatura"];
  const STATUS = { paid: "Paga", pending: "Pendente", expired: "Expirada" } as const;
  const lines = rows.map((r) => [
    r.reference, r.entity, r.amountKz, STATUS[r.status], ogDateTime(r.issuedAt), r.dueDate, r.paidAt ? ogDateTime(r.paidAt) : "", r.ixcId, r.name, r.nif, r.invoice,
  ].map(cell).join(";"));
  const body = `﻿${[head.join(";"), ...lines].join("\r\n")}\r\n`;
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="pagamentos-${mes}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
