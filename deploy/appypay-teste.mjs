// Prova da AppyPay a partir do servidor, com as chaves do .env, dentro do contentor web:
//   docker compose exec -T web node --input-type=module - < deploy/appypay-teste.mjs
// Cria 2 referências de 100 Kz (A igual ao gerador, B igual ao backoffice) que expiram sozinhas se não forem pagas.
// Não mostra segredos: só o estado de cada pedido e a resposta da AppyPay.
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";

const e = process.env;

function send(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : Buffer.from(body, "utf8");
    const req = (url.startsWith("http:") ? http : https).request(url, {
      method,
      headers: data ? { ...headers, "Content-Length": String(data.length) } : headers,
      timeout: 30000,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("timeout", () => req.destroy(new Error("sem resposta em 30 s")));
    req.on("error", reject);
    req.end(data);
  });
}

function contains(dir, needle) {
  try {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory() ? contains(p, needle) : p.endsWith(".js") && fs.readFileSync(p, "utf8").includes(needle)) return true;
    }
  } catch {}
  return false;
}

const pm = (e.APPYPAY_PAYMENT_METHOD ?? "").trim();
const key = pm.replace(/^REF_/i, "");
console.log("Versão no contentor:", contains("/app/.next/server", "API_Integration") ? "nova (pedido igual ao gerador)" : "ANTIGA");
console.log("Chave no .env:", pm.startsWith("REF_") ? "com REF_" : "SEM REF_", "·", /[A-Z]/.test(key) ? "tem MAIÚSCULAS" : "em minúsculas", "·", key.length, "caracteres");
console.log("URL:", e.APPYPAY_URL);

const tok = await send("POST", e.APPYPAY_TOKEN_URL, { "Content-Type": "application/x-www-form-urlencoded" }, new URLSearchParams({
  grant_type: "client_credentials",
  client_id: (e.APPYPAY_CLIENT_ID ?? "").trim(),
  client_secret: (e.APPYPAY_CLIENT_SECRET ?? "").trim(),
  resource: (e.APPYPAY_RESOURCE || "bee57785-7a19-4f1c-9c8d-aa03f2f0e333").trim(),
}).toString());
let token = null;
try { token = JSON.parse(tok.text).access_token ?? null; } catch {}
console.log("Token:", `HTTP ${tok.status}`, token ? "ok" : "FALHOU");
if (!token) process.exit(1);

const base = e.APPYPAY_URL.endsWith("/") ? e.APPYPAY_URL : `${e.APPYPAY_URL}/`;
const iso = (d) => `${d.toISOString().slice(0, 19)}Z`;
const now = new Date();
const casos = [
  ["A igual ao gerador", "Pagamento de teste", "Entidade 11700", `${new Date(now.getTime() + 7 * 864e5).toISOString().slice(0, 10)}T23:59:59Z`],
  ["B igual ao backoffice", "ZON teste do backoffice", "Pagamento de teste", iso(new Date(now.getTime() + 24 * 36e5))],
];
for (const [nome, d1, d2, exp] of casos) {
  const ref = String(100000000 + Math.floor(Math.random() * 900000000));
  const body = {
    paymentMethod: `REF_${key.toLowerCase()}`,
    references: [{
      referenceNumber: ref,
      currency: "AOA",
      amounts: [{ amount: 100, descriptionLine1: d1, descriptionLine2: d2 }],
      minAmount: 100,
      maxAmount: 100,
      startDate: iso(now),
      expirationDate: exp,
    }],
    createdBy: "API_Integration",
  };
  const r = await send("POST", `${base}references`, {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  }, JSON.stringify(body));
  console.log(`${nome}: HTTP ${r.status} · referência ${ref} · ${r.text.trim().slice(0, 300)}`);
}
