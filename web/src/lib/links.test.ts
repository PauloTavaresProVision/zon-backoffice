import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgres://teste";
process.env.APP_SECRET = "a".repeat(64);
process.env.APP_URL = "https://backoffice.exemplo.ao/";

// Importado depois de definir as variáveis, porque links.ts lê o ambiente
const load = () => import("./links");
const NOW = Date.UTC(2026, 9, 31);

test("link da fatura: assinado e com prazo", async () => {
  const { signInvoiceToken, verifyInvoiceToken } = await load();
  const token = signInvoiceToken(42, 30, NOW);
  assert.equal(verifyInvoiceToken(token, NOW), 42);
  assert.equal(verifyInvoiceToken(token, NOW + 29 * 86_400_000), 42);
  assert.equal(verifyInvoiceToken(token, NOW + 31 * 86_400_000), null, "expirado");
});

test("link da fatura: não se pode trocar o número", async () => {
  const { signInvoiceToken, verifyInvoiceToken } = await load();
  const [, sig] = signInvoiceToken(42, 30, NOW).split(".");
  const forged = `${Buffer.from(`43.${Math.floor(NOW / 1000) + 30 * 86_400}`).toString("base64url")}.${sig}`;
  assert.equal(verifyInvoiceToken(forged, NOW), null);
  assert.equal(verifyInvoiceToken("lixo", NOW), null);
  assert.equal(verifyInvoiceToken("", NOW), null);
});

test("URL público sem barra a dobrar", async () => {
  const { publicInvoiceUrl } = await load();
  assert.match(publicInvoiceUrl(7), /^https:\/\/backoffice\.exemplo\.ao\/f\/[\w-]+\.[\w-]+$/);
});
