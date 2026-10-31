// Respostas das rotas de PDF. Os erros vêm em HTML simples porque aparecem dentro do iframe.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function pdfResponse(pdf: Buffer, fileName: string, download: boolean): Response {
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(pdf.length),
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export function pdfError(message: string, status: number): Response {
  const html = `<!doctype html><html lang="pt"><meta charset="utf-8"><title>Fatura</title>
<body style="font:14px system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;color:#3a4045;background:#f4f5f6">
<div style="max-width:420px;text-align:center;padding:24px"><p style="font-weight:600;margin:0 0 6px">Não foi possível mostrar a fatura</p><p style="margin:0">${esc(message)}</p></div>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
