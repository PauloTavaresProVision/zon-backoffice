// IXC, AppyPay e WeSender simulados, só para desenvolvimento e testes. Imitam a parte das APIs que o
// ciclo de cobrança usa. Nada daqui fala com os serviços verdadeiros.
//
//   /ixc/webservice/v1/<tabela>   cliente, cliente_contrato, fn_areceber, fn_areceber_recebimentos_baixas_novo
//   /appypay/token                OAuth2 (client credentials)
//   /appypay/v2.0/...             references, charges/<id>
//   /wesender/envio/apikey        envio de SMS (ficam numa caixa de saída)
//   /__dev/...                    dados iniciais, pagar uma referência, ver SMS, simular falhas
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? 4640);
const STATE_FILE = process.env.STATE_FILE ?? "./data/state.json";
const IXC_TOKEN = process.env.MOCK_IXC_TOKEN ?? "1:demo";
const APPYPAY_CLIENT_ID = process.env.MOCK_APPYPAY_CLIENT_ID ?? "demo-client";
const APPYPAY_CLIENT_SECRET = process.env.MOCK_APPYPAY_CLIENT_SECRET ?? "demo-secret";
const APPYPAY_ENTITY = process.env.MOCK_APPYPAY_ENTITY ?? "11700";
const WESENDER_KEY = process.env.MOCK_WESENDER_KEY ?? "demo-key";
// Para onde a AppyPay simulada manda a notificação de pagamento (o webhook do backoffice)
const WEBHOOK_URL = process.env.MOCK_WEBHOOK_URL ?? "";

/* ---------- estado ---------- */
const empty = () => ({
  ixc: { cliente: {}, cliente_contrato: {}, fn_areceber: {}, baixas: [], nextId: 900000 },
  appypay: { charges: {}, tokens: {} },
  sms: [],
  fail: {},
});
let state = empty();
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

/** Falha simulada: `/__dev/fail` com {target, times}. */
function shouldFail(target) {
  if (!(state.fail[target] > 0)) return false;
  state.fail[target] -= 1;
  save();
  return true;
}

const pad = (n) => String(n).padStart(2, "0");
/** Hora de Luanda (UTC+1, sem hora de verão), "AAAA-MM-DD HH:MM:SS". */
function luanda(d = new Date()) {
  const t = new Date(d.getTime() + 3600_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
}
/** O IXC escreve "dd/mm/aaaa" e devolve "aaaa-mm-dd". */
const isoFromBr = (s) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(s ?? "");
};

/* ---------- HTTP ---------- */
function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  const body = Buffer.concat(chunks);
  const ct = req.headers["content-type"] ?? "";
  if (!body.length) return {};
  if (ct.includes("application/json")) return JSON.parse(body.toString());
  return Object.fromEntries(new URLSearchParams(body.toString()));
}

/* ---------- IXC ---------- */
const IXC_TABLES = ["cliente", "cliente_contrato", "fn_areceber"];
const asText = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)]));

function ixcCompare(a, op, b) {
  const na = Number(a);
  const nb = Number(b);
  const num = a !== "" && b !== "" && Number.isFinite(na) && Number.isFinite(nb);
  const [x, y] = num ? [na, nb] : [a, b];
  switch (op) {
    case ">": return x > y;
    case "<": return x < y;
    case ">=": return x >= y;
    case "<=": return x <= y;
    case "!=": return x !== y;
    case "L": return String(a).toLowerCase().includes(String(b).toLowerCase());
    default: return String(a) === String(b);
  }
}

function ixcList(table, q) {
  const field = String(q.qtype ?? `${table}.id`).replace(`${table}.`, "");
  let rows = Object.values(state.ixc[table]).filter((r) => ixcCompare(String(r[field] ?? ""), q.oper ?? "=", String(q.query ?? "")));
  const sortField = String(q.sortname ?? `${table}.id`).replace(`${table}.`, "");
  const dir = String(q.sortorder ?? "asc").toLowerCase() === "desc" ? -1 : 1;
  rows.sort((a, b) => (ixcCompare(a[sortField] ?? "", ">", b[sortField] ?? "") ? 1 : ixcCompare(a[sortField] ?? "", "<", b[sortField] ?? "") ? -1 : 0) * dir);
  const page = Math.max(1, Number(q.page ?? 1) || 1);
  const rp = Math.max(1, Math.min(1000, Number(q.rp ?? 20) || 20));
  const total = rows.length;
  rows = rows.slice((page - 1) * rp, page * rp);
  // Como o IXC: sem resultados não vem "registros"
  return total ? { page: String(page), total: String(total), registros: rows } : { page: String(page), total: 0 };
}

function ixcBaixa(body) {
  const r = state.ixc.fn_areceber[body.id_receber];
  if (!r) return { type: "error", message: `Título ${body.id_receber} não encontrado` };
  if (r.status !== "A") return { type: "error", message: "Este título já foi recebido ou cancelado" };
  const valor = Number(body.valor_total_recebido ?? body.credito ?? 0);
  const aberto = Number(r.valor_aberto || r.valor);
  if (Math.abs(valor - aberto) > 1) return { type: "error", message: `Valor recebido (${valor}) diferente do valor em aberto (${aberto})` };
  if (shouldFail("ixc.baixa")) return { type: "error", message: "Falha simulada ao gravar o recebimento" };
  r.status = "R";
  r.valor_aberto = "0.00";
  r.valor_recebido = valor.toFixed(2);
  r.pagamento_data = isoFromBr(body.data);
  state.ixc.baixas.push({ id_receber: r.id, valor: valor.toFixed(2), data: r.pagamento_data, historico: body.historico ?? "", at: luanda() });
  save();
  return { type: "success", message: "Recebimento gravado com sucesso!" };
}

function ixcCreateReceivable(f) {
  if (!f.id_contrato || !f.data_vencimento || !f.valor) return { type: "error", message: "Campos obrigatórios: id_contrato, data_vencimento, valor" };
  const id = String(state.ixc.nextId++);
  state.ixc.fn_areceber[id] = asText({
    ...f, id, data_vencimento: isoFromBr(f.data_vencimento), data_emissao: isoFromBr(f.data_emissao),
    data_inicial: isoFromBr(f.data_inicial), data_final: isoFromBr(f.data_final), valor_aberto: Number(f.valor).toFixed(2),
  });
  save();
  return { type: "success", message: "Registro inserido com sucesso!", id };
}

async function ixc(req, res, table) {
  if (req.headers.authorization !== "Basic " + Buffer.from(IXC_TOKEN).toString("base64")) {
    return send(res, 401, { type: "error", message: "Token inválido" });
  }
  const body = await readBody(req);
  if (req.method === "POST" && req.headers.ixcsoft === "listar") {
    if (!IXC_TABLES.includes(table)) return send(res, 200, { type: "error", message: `Tabela ${table} desconhecida` });
    return send(res, 200, ixcList(table, body));
  }
  if (req.method === "POST" && table === "fn_areceber_recebimentos_baixas_novo") return send(res, 200, ixcBaixa(body));
  if (req.method === "POST" && table === "fn_areceber") return send(res, 200, ixcCreateReceivable(body));
  const m = /^(\w+)\/(\d+)$/.exec(table);
  if (req.method === "PUT" && m && state.ixc[m[1]]?.[m[2]]) {
    Object.assign(state.ixc[m[1]][m[2]], asText(body));
    save();
    return send(res, 200, { type: "success", message: "Registro atualizado com sucesso!" });
  }
  return send(res, 200, { type: "error", message: "Operação não suportada pelo simulador" });
}

/* ---------- AppyPay ---------- */
function bearer(req) {
  const t = /^Bearer (\S+)$/.exec(req.headers.authorization ?? "")?.[1];
  return t && state.appypay.tokens[t] > Date.now();
}

function chargeJson(c) {
  return {
    id: c.id, merchantTransactionId: c.merchantTransactionId, status: c.status, amount: c.amount, currency: "AOA",
    paymentMethod: c.paymentMethod, createdDate: c.createdDate, updatedDate: c.updatedDate,
    reference: { referenceNumber: c.referenceNumber, entity: c.entity, dueDate: c.expirationDate, providerPaymentDateTime: c.paidAt ?? null },
  };
}

async function appypay(req, res, path) {
  if (path === "/token" && req.method === "POST") {
    const f = await readBody(req);
    if (f.grant_type !== "client_credentials" || f.client_id !== APPYPAY_CLIENT_ID || f.client_secret !== APPYPAY_CLIENT_SECRET) {
      return send(res, 401, { error: "invalid_client", error_description: "Credenciais inválidas" });
    }
    const token = randomBytes(24).toString("hex");
    state.appypay.tokens[token] = Date.now() + 3600_000;
    save();
    return send(res, 200, { token_type: "Bearer", expires_in: "3599", access_token: token });
  }
  if (!bearer(req)) return send(res, 401, { message: "Unauthorized" });

  if (path === "/v2.0/references" && req.method === "POST") {
    const b = await readBody(req);
    const r = b.references?.[0];
    const amount = Number(r?.amounts?.[0]?.amount);
    if (!b.paymentMethod || !r || !/^\d{9}$/.test(String(r.referenceNumber ?? "")) || !(amount > 0)) {
      return send(res, 400, { responseStatus: { successful: false, message: "Pedido inválido: paymentMethod, referenceNumber (9 dígitos) e amount" } });
    }
    if (shouldFail("appypay.references")) return send(res, 503, { responseStatus: { successful: false, message: "Serviço temporariamente indisponível (simulado)" } });
    if (Object.values(state.appypay.charges).some((c) => c.referenceNumber === String(r.referenceNumber))) {
      return send(res, 409, { responseStatus: { successful: false, message: "Referência já existe" } });
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    state.appypay.charges[id] = {
      id, merchantTransactionId: randomBytes(6).toString("hex").toUpperCase(), status: "Pending", amount, paymentMethod: b.paymentMethod,
      referenceNumber: String(r.referenceNumber), entity: APPYPAY_ENTITY, startDate: r.startDate, expirationDate: r.expirationDate,
      description: r.amounts[0].descriptionLine1 ?? "", createdDate: now, updatedDate: now, paidAt: null,
    };
    save();
    return send(res, 200, {
      id,
      references: [{ id, referenceNumber: String(r.referenceNumber), entity: APPYPAY_ENTITY, expirationDate: r.expirationDate, responseStatus: { successful: true, status: "Pending" } }],
      responseStatus: { successful: true, message: "Referência criada" },
    });
  }
  const m = /^\/v2\.0\/charges\/([\w-]+)$/.exec(path);
  if (m && req.method === "GET") {
    const c = state.appypay.charges[m[1]];
    return c ? send(res, 200, { payment: chargeJson(c) }) : send(res, 404, { message: "Pagamento não encontrado" });
  }
  return send(res, 404, { message: "Not found" });
}

/** Paga uma referência como o Multicaixa faria e notifica o webhook do backoffice. */
async function pay(b) {
  const ref = String(b.reference ?? "").replace(/\D/g, "");
  const c = Object.values(state.appypay.charges).find((x) => x.referenceNumber === ref);
  if (!c) return [404, { message: "Referência desconhecida na AppyPay simulada" }];
  if (c.status === "Success") return [409, { message: "Esta referência já foi paga" }];
  if (c.expirationDate && new Date(c.expirationDate) < new Date()) return [409, { message: "A referência expirou: o Multicaixa recusa o pagamento" }];
  c.status = "Success";
  c.paidAt = luanda();
  c.updatedDate = new Date().toISOString();
  if (b.amount) c.amount = Number(b.amount); // para testar valores errados
  save();
  let webhook = "sem MOCK_WEBHOOK_URL";
  if (WEBHOOK_URL) {
    try {
      const r = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(chargeJson(c)),
        signal: AbortSignal.timeout(15_000),
      });
      const j = await r.json().catch(() => ({}));
      webhook = `${r.status} ${j.message ?? ""}`.trim();
    } catch (err) {
      webhook = `falhou (${err instanceof Error ? err.message : err})`;
    }
  }
  return [200, { message: "Pago", id: c.id, webhook }];
}

/* ---------- WeSender ---------- */
async function wesender(req, res) {
  const b = await readBody(req);
  if (b.ApiKey !== WESENDER_KEY) return send(res, 200, { succeeded: false, message: "ApiKey inválida", data: null });
  const to = Array.isArray(b.Destino) ? b.Destino.map(String) : [];
  if (!to.length || to.some((n) => !/^9\d{8}$/.test(n))) return send(res, 200, { succeeded: false, message: "Destino inválido", data: null });
  if (shouldFail("wesender")) return send(res, 200, { succeeded: false, message: "Saldo insuficiente (simulado)", data: null });
  const id = state.sms.length + 1;
  state.sms.push({ id, to, text: String(b.Mensagem ?? ""), at: luanda() });
  if (state.sms.length > 2000) state.sms = state.sms.slice(-2000);
  save();
  return send(res, 200, { succeeded: true, message: "Mensagem enviada com sucesso", data: { id } });
}

/* ---------- dev ---------- */
async function dev(req, res, path) {
  if (path === "/seed" && req.method === "POST") {
    // Substitui os dados do IXC e regista na AppyPay as referências que já existiam
    const b = await readBody(req);
    state.ixc = { ...empty().ixc, nextId: state.ixc.nextId };
    for (const t of IXC_TABLES) for (const r of b.ixc?.[t] ?? []) state.ixc[t][String(r.id)] = asText(r);
    state.appypay.charges = {};
    for (const p of b.appypay ?? []) {
      state.appypay.charges[p.id] = {
        id: p.id, merchantTransactionId: randomBytes(6).toString("hex").toUpperCase(), status: "Pending", amount: p.amount, paymentMethod: "REF",
        referenceNumber: p.reference, entity: APPYPAY_ENTITY, startDate: p.startDate, expirationDate: p.expirationDate,
        description: "", createdDate: new Date().toISOString(), updatedDate: new Date().toISOString(), paidAt: null,
      };
    }
    state.sms = [];
    save();
    return send(res, 200, { ok: true, clientes: Object.keys(state.ixc.cliente).length, titulos: Object.keys(state.ixc.fn_areceber).length });
  }
  if (path === "/appypay/pay" && req.method === "POST") {
    const [status, body] = await pay(await readBody(req));
    return send(res, status, body);
  }
  if (path === "/fail" && req.method === "POST") {
    const b = await readBody(req);
    state.fail[b.target] = Number(b.times ?? 1);
    save();
    return send(res, 200, { ok: true, fail: state.fail });
  }
  if (path === "/sms") return send(res, 200, { total: state.sms.length, sms: state.sms.slice(-100).reverse() });
  if (path === "/state") {
    const open = Object.values(state.ixc.fn_areceber).filter((r) => r.status === "A").length;
    return send(res, 200, {
      ixc: { clientes: Object.keys(state.ixc.cliente).length, contratos: Object.keys(state.ixc.cliente_contrato).length, titulosEmAberto: open, baixas: state.ixc.baixas.slice(-20) },
      appypay: { referencias: Object.keys(state.appypay.charges).length, pagas: Object.values(state.appypay.charges).filter((c) => c.status === "Success").length },
      sms: state.sms.length,
      fail: state.fail,
    });
  }
  return send(res, 404, { message: "Not found" });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  try {
    if (p === "/health") return send(res, 200, { ok: true });
    if (p.startsWith("/ixc/webservice/v1/")) return await ixc(req, res, p.slice("/ixc/webservice/v1/".length));
    if (p.startsWith("/appypay/")) return await appypay(req, res, p.slice("/appypay".length));
    if (p === "/wesender/envio/apikey" && req.method === "POST") return await wesender(req, res);
    if (p.startsWith("/__dev/")) return await dev(req, res, p.slice("/__dev".length));
    return send(res, 404, { message: "Not found" });
  } catch (err) {
    console.error(err);
    return send(res, 500, { type: "error", message: "Erro interno do simulador" });
  }
});

server.listen(PORT, () => console.log(`IXC, AppyPay e WeSender simulados na porta ${PORT}${WEBHOOK_URL ? "; webhook configurado" : ""}`));
