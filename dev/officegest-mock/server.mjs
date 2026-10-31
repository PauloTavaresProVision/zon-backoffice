// OfficeGest simulado, só para desenvolvimento e testes. Imita a parte da API v1 que o backoffice usa:
// clientes, listagem e detalhe de documentos de venda, criação de documentos e o PDF.
// Os documentos são marcados como "documento de teste" e não têm valor fiscal.
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";

const PORT = Number(process.env.PORT ?? 4630);
const USER = process.env.MOCK_USER ?? "demo";
const KEY = process.env.MOCK_KEY ?? "demo-key";
const PUBLIC_URL = (process.env.MOCK_PUBLIC_URL ?? `http://127.0.0.1:${PORT}`).replace(/\/+$/, "");
const STATE_FILE = process.env.STATE_FILE ?? "./data/state.json";

const TYPES = {
  fr: { label: "Fatura-recibo", start: 5000 },
  ft: { label: "Fatura", start: 1200 },
  nc: { label: "Nota de crédito", start: 40 },
};

/* ---------- estado ---------- */
let state = { customers: {}, documents: {}, counters: {}, nextCustomer: 2001, fail: {}, pdfTokens: {} };
try { state = { ...state, ...JSON.parse(readFileSync(STATE_FILE, "utf8")) }; } catch { /* começa vazio */ }
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE + ".tmp", JSON.stringify(state));
    renameSync(STATE_FILE + ".tmp", STATE_FILE);
  }, 200);
}

const pad = (n) => String(n).padStart(2, "0");
function luanda(d = new Date()) {
  const t = new Date(d.getTime() + 3600_000); // UTC+1, sem hora de verão
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
}

const docKey = (type, number) => `${type}:${number}`;

function nextNumber(type) {
  const cur = state.counters[type] ?? TYPES[type]?.start ?? 100;
  state.counters[type] = cur + 1;
  return cur + 1;
}

function createCustomer({ name, customertaxid, mobilephone, email, city, address }) {
  const id = state.nextCustomer++;
  state.customers[id] = { id: String(id), name, customertaxid: String(customertaxid ?? ""), mobilephone: mobilephone ?? "", email: email ?? "", city: city ?? "Luanda", address: address ?? "", country: "AO", active: "T" };
  save();
  return state.customers[id];
}

function createDocument(type, { idcustomer, lines, date, state: docState }) {
  const number = nextNumber(type);
  const year = (date ?? luanda()).slice(0, 4);
  const total = lines.reduce((s, l) => s + l.quantity * l.sellingprice, 0);
  const stamp = date ? `${date.slice(0, 10)} 10:00:00` : luanda();
  const doc = {
    type, number, serie: Number(year), idcustomer: Number(idcustomer), total, paid_value: type === "fr" ? total : 0,
    state: docState ?? (type === "fr" ? "FEC" : "ABR"), date: `${stamp.slice(0, 10)} 00:00:00`, systemdate: luanda(),
    documentnumber: `${type.toUpperCase()} ${year}/${number}`, date_alter: luanda(), lines,
  };
  state.documents[docKey(type, number)] = doc;
  save();
  return doc;
}

const summary = ({ lines, type, ...d }) => d;

/* ---------- PDF ---------- */
const kz = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " Kz";
const winAnsi = (s) => String(s).replace(/[^\x20-\x7E -ÿ—–’“”•…]/g, "");

async function renderPdf(doc) {
  const c = state.customers[doc.idcustomer] ?? { name: "Cliente", customertaxid: "999999999" };
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${TYPES[doc.type]?.label ?? doc.type} ${doc.documentnumber}`);
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.07, 0.08, 0.09);
  const grey = rgb(0.45, 0.48, 0.5);
  const gold = rgb(1, 0.745, 0);
  const text = (s, x, y, o = {}) => page.drawText(winAnsi(s), { x, y, size: o.size ?? 10, font: o.bold ? bold : font, color: o.color ?? ink });
  const right = (s, x, y, o = {}) => { const w = (o.bold ? bold : font).widthOfTextAtSize(winAnsi(s), o.size ?? 10); text(s, x - w, y, o); };

  page.drawRectangle({ x: 0, y: 805, width: 595.28, height: 37, color: rgb(0.82, 0.23, 0.23) });
  text("DOCUMENTO DE TESTE  ·  OfficeGest simulado  ·  sem valor fiscal", 48, 820, { size: 10, bold: true, color: rgb(1, 1, 1) });

  page.drawRectangle({ x: 48, y: 742, width: 34, height: 34, color: gold });
  text("ZON", 92, 760, { size: 22, bold: true });
  text("Internet e Televisão · Luanda, Angola", 92, 746, { size: 9, color: grey });

  right(TYPES[doc.type]?.label ?? doc.type.toUpperCase(), 547, 768, { size: 10, color: grey });
  right(doc.documentnumber, 547, 750, { size: 16, bold: true });
  right("Original", 547, 736, { size: 9, color: grey });

  let y = 690;
  text("Cliente", 48, y, { size: 8.5, color: grey });
  text("Data", 330, y, { size: 8.5, color: grey });
  text("N.º de cliente", 440, y, { size: 8.5, color: grey });
  y -= 15;
  text(c.name, 48, y, { size: 11, bold: true });
  text(doc.date.slice(8, 10) + "/" + doc.date.slice(5, 7) + "/" + doc.date.slice(0, 4), 330, y, { size: 11, bold: true });
  text(String(doc.idcustomer), 440, y, { size: 11, bold: true });
  y -= 14;
  text(`NIF: ${c.customertaxid || "consumidor final"}`, 48, y, { size: 9.5, color: grey });
  if (c.address) text(c.address, 48, y - 13, { size: 9.5, color: grey });

  y = 600;
  page.drawLine({ start: { x: 48, y: y + 14 }, end: { x: 547, y: y + 14 }, thickness: 0.6, color: grey });
  text("Descrição", 48, y, { size: 8.5, bold: true, color: grey });
  right("Qtd.", 380, y, { size: 8.5, bold: true, color: grey });
  right("Preço", 465, y, { size: 8.5, bold: true, color: grey });
  right("Total", 547, y, { size: 8.5, bold: true, color: grey });
  y -= 8;
  page.drawLine({ start: { x: 48, y }, end: { x: 547, y }, thickness: 0.6, color: grey });
  for (const l of doc.lines) {
    y -= 18;
    const desc = winAnsi(l.extradescription || "Serviço");
    text(desc.length > 62 ? desc.slice(0, 61) + "…" : desc, 48, y, { size: 10 });
    right(String(l.quantity), 380, y);
    right(kz(l.sellingprice), 465, y);
    right(kz(l.quantity * l.sellingprice), 547, y);
  }
  y -= 14;
  page.drawLine({ start: { x: 48, y }, end: { x: 547, y }, thickness: 0.6, color: grey });
  y -= 28;
  text("Total", 360, y, { size: 11, color: grey });
  right(kz(doc.total), 547, y, { size: 16, bold: true });

  const stamp = doc.state === "ANU" ? ["ANULADO", rgb(0.82, 0.23, 0.23)] : doc.type === "fr" ? ["PAGO", rgb(0.05, 0.6, 0.05)] : null;
  if (stamp) {
    page.drawText(stamp[0], { x: 70, y: y - 30, size: 34, font: bold, color: stamp[1], rotate: degrees(-12), opacity: 0.85 });
  }
  text("Processado por programa de teste. Este PDF imita o que o OfficeGest devolve; não é uma fatura.", 48, 60, { size: 8, color: grey });
  return Buffer.from(await pdf.save());
}

/* ---------- HTTP ---------- */
function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, { "content-type": isBuf ? "application/pdf" : "application/json; charset=utf-8", ...headers });
  res.end(isBuf ? body : JSON.stringify(body));
}

const authorized = (req) => req.headers.authorization === "Basic " + Buffer.from(`${USER}:${KEY}`).toString("base64");

async function readForm(req) {
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  const body = Buffer.concat(chunks);
  const ct = req.headers["content-type"] ?? "";
  if (ct.includes("application/json")) return JSON.parse(body.toString() || "{}");
  const fd = await new Request("http://x/", { method: "POST", headers: { "content-type": ct }, body }).formData();
  return Object.fromEntries(fd.entries());
}

function parseLines(form) {
  const lines = [];
  for (const [k, v] of Object.entries(form)) {
    const m = k.match(/^lines\[(\d+)\]\[(\w+)\]$/);
    if (!m) continue;
    lines[+m[1]] ??= {};
    lines[+m[1]][m[2]] = v;
  }
  return lines.filter(Boolean).map((l) => ({
    idarticle: l.idarticle, quantity: Number(l.quantity ?? 1), sellingprice: Number(l.sellingprice ?? 0), extradescription: l.extradescription ?? "", vatid: l.vatid ?? null,
  }));
}

function compare(a, op, b) {
  switch (op) {
    case ">=": case "greater_than_or_equal": return a >= b;
    case "<=": return a <= b;
    case ">": case "greater_than": return a > b;
    case "<": case "lesser_than": return a < b;
    case "!=": return a !== b;
    case "like": case "contains": return String(a).includes(String(b));
    default: return String(a) === String(b);
  }
}

function filterDocs(type, q) {
  const op = q.get("operator") ?? "=";
  let docs = Object.values(state.documents).filter((d) => d.type === type);
  for (const [k, v] of q.entries()) {
    const m = k.match(/^filter\[(\w+)\]$/);
    if (m) docs = docs.filter((d) => compare(String(d[m[1]] ?? ""), op, v));
  }
  const order = q.get("order") ?? "number";
  const dir = (q.get("sorder") ?? "ASC").toUpperCase() === "DESC" ? -1 : 1;
  docs.sort((a, b) => (a[order] > b[order] ? 1 : a[order] < b[order] ? -1 : 0) * dir);
  const total = docs.length;
  const offset = Number(q.get("offset") ?? 0) || 0;
  const limit = Number(q.get("limit") ?? 50) || 50;
  return { total, docs: docs.slice(offset, offset + limit) };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  try {
    if (p === "/health") return send(res, 200, { ok: true });

    // PDF público e temporário, como o link que o OfficeGest devolve em `pdf`
    let m = p.match(/^\/pdf\/(\w+)\.pdf$/);
    if (m && req.method === "GET") {
      const key = state.pdfTokens[m[1]];
      const doc = key && state.documents[key];
      if (!doc) return send(res, 404, { result: "error", message: "Link expirado" });
      return send(res, 200, await renderPdf(doc), { "content-disposition": `inline; filename="${doc.documentnumber.replace(/\W+/g, "_")}.pdf"` });
    }

    // Só para desenvolvimento: dados iniciais e falhas simuladas
    if (p === "/__dev/seed" && req.method === "POST") {
      const body = await readForm(req);
      for (const c of body.customers ?? []) {
        let cust = Object.values(state.customers).find((x) => x.customertaxid === c.nif);
        if (!cust) cust = createCustomer({ name: c.name, customertaxid: c.nif, mobilephone: c.phone });
        for (const d of c.docs ?? []) {
          createDocument(d.type, { idcustomer: cust.id, date: d.date, state: d.state, lines: [{ idarticle: "SERV", quantity: 1, sellingprice: d.total, extradescription: d.description }] });
        }
      }
      for (const f of body.fail ?? []) state.fail[f.nif] = f.times ?? 1;
      save();
      return send(res, 200, { result: "ok" });
    }
    if (p === "/__dev/state") return send(res, 200, { customers: Object.keys(state.customers).length, documents: Object.keys(state.documents).length, fail: state.fail });

    if (!p.startsWith("/api/")) return send(res, 404, { result: "error", message: "Not found" });
    if (!authorized(req)) return send(res, 401, { result: "error", code: 401, message: "Unauthorized" });
    const api = p.slice(4);

    if (api === "/entities/customers" && req.method === "GET") {
      const tax = url.searchParams.get("filter[customertaxid]");
      const id = url.searchParams.get("filter[id]");
      const list = Object.values(state.customers).filter((c) => (!tax || c.customertaxid === tax) && (!id || c.id === id));
      // Como o OfficeGest: sem resultados devolve um array vazio, com resultados um objeto indexado
      return send(res, 200, { result: "ok", customers: list.length ? Object.fromEntries(list.map((c) => [c.id, c])) : [], total: String(list.length) });
    }
    if (api === "/entities/customers" && req.method === "POST") {
      const f = await readForm(req);
      if (!f.name) return send(res, 400, { result: "error", code: 400, message: "name is required" });
      const c = createCustomer(f);
      return send(res, 200, { result: "ok", customer_id: Number(c.id), customer: { id: Number(c.id), name: c.name } });
    }

    if (api === "/sales/documents" && req.method === "GET") {
      return send(res, 200, { result: "ok", documents: Object.fromEntries(Object.entries(TYPES).map(([code, t]) => [code, { code, description: t.label }])) });
    }

    m = api.match(/^\/sales\/documents\/(\w+)$/);
    if (m && req.method === "GET") {
      const type = m[1].toLowerCase();
      if (!TYPES[type]) return send(res, 404, { result: "error", code: 404, message: "Document type not found" });
      const { total, docs } = filterDocs(type, url.searchParams);
      return send(res, 200, { documents: Object.fromEntries(docs.map((d) => [d.number, summary(d)])), order: url.searchParams.get("order") ?? "number", sorder: url.searchParams.get("sorder") ?? "ASC", total });
    }
    if (m && req.method === "POST") {
      const type = m[1].toLowerCase();
      if (!TYPES[type]) return send(res, 404, { result: "error", code: 404, message: "Document type not found" });
      const f = await readForm(req);
      const cust = state.customers[f.idcustomer];
      if (!cust) return send(res, 400, { result: "error", code: 400, message: "Customer not found" });
      const lines = parseLines(f);
      if (!lines.length || lines.some((l) => !l.idarticle)) return send(res, 400, { result: "error", code: 400, message: "Lines with idarticle are required" });
      if (state.fail[cust.customertaxid] > 0) {
        state.fail[cust.customertaxid] -= 1;
        save();
        return send(res, 503, { result: "error", code: 503, message: "Serviço temporariamente indisponível" });
      }
      const doc = createDocument(type, { idcustomer: cust.id, lines });
      return send(res, 200, { result: "ok", document: summary(doc), document_number: doc.documentnumber });
    }

    m = api.match(/^\/sales\/documents\/(\w+)\/(\w+)$/);
    if (m && req.method === "GET") {
      const doc = state.documents[docKey(m[1].toLowerCase(), m[2])];
      if (!doc) return send(res, 404, { result: "error", code: 404, message: "Document not found" });
      const out = {
        result: "ok",
        document: { ...summary(doc), typedescription: TYPES[doc.type]?.label, generaltype: doc.type.toUpperCase(), anulado: doc.state === "ANU" ? "T" : "F", nomefact: state.customers[doc.idcustomer]?.name },
        lines: Object.fromEntries(doc.lines.map((l, i) => [i + 1, { linenumber: i + 1, ...l, description: l.extradescription }])),
      };
      if (url.searchParams.get("print")) {
        const token = randomBytes(12).toString("hex");
        state.pdfTokens[token] = docKey(doc.type, doc.number);
        save();
        out.pdf = `${PUBLIC_URL}/pdf/${token}.pdf`;
      }
      return send(res, 200, out);
    }

    return send(res, 404, { result: "error", code: 404, message: "Not found" });
  } catch (err) {
    console.error(err);
    return send(res, 500, { result: "error", code: 500, message: "Internal error" });
  }
});

server.listen(PORT, () => console.log(`OfficeGest simulado em ${PUBLIC_URL} (utilizador ${USER})`));
