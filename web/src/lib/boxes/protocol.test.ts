import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import { billing, boxState, codeMatches, installCode, normalizeSerial, parsePayload, parsePublicKey, verifySignature, type BillingInput } from "./protocol";
import { boxView, ONLINE_MS } from "./view";

const TODAY = "2026-10-31";

/** Uma box de teste: chave RSA 2048 como a do AndroidKeyStore, em SPKI base64 (Base64.NO_WRAP). */
function fakeBox() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pub = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const signFor = (serial: string, nonce: string, payload: string) =>
    sign("sha256", Buffer.from(`ZON1\n${serial}\n${nonce}\n${payload}`, "utf8"), privateKey).toString("base64");
  return { pub, signFor };
}

const box = fakeBox();

test("serial: maiúsculas, sem valores vazios do Android", () => {
  assert.equal(normalizeSerial("  zx-2024-a1 "), "ZX-2024-A1");
  assert.equal(normalizeSerial("unknown"), null);
  assert.equal(normalizeSerial("abc"), null, "curto demais");
  assert.equal(normalizeSerial("SN 123 456"), null, "espaços não");
  assert.equal(normalizeSerial(12345678), null);
});

test("chave pública: só RSA 2048; fingerprint SHA-256 do DER", () => {
  const k = parsePublicKey(box.pub);
  assert.ok(k);
  assert.match(k.fingerprint, /^[0-9A-F]{64}$/);
  assert.equal(installCode(k.fingerprint), k.fingerprint.slice(0, 12));
  const small = generateKeyPairSync("rsa", { modulusLength: 1024 }).publicKey.export({ format: "der", type: "spki" }).toString("base64");
  assert.equal(parsePublicKey(small), null, "RSA 1024");
  const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).publicKey.export({ format: "der", type: "spki" }).toString("base64");
  assert.equal(parsePublicKey(ec), null, "chave EC");
  assert.equal(parsePublicKey("não é base64"), null);
});

test("código da TV: 12+ caracteres do início do fingerprint, espaços e hífenes à parte", () => {
  const fp = parsePublicKey(box.pub)!.fingerprint;
  const code = installCode(fp);
  assert.equal(codeMatches(fp, code), true);
  assert.equal(codeMatches(fp, `${code.slice(0, 4)} ${code.slice(4, 8)}-${code.slice(8)}`.toLowerCase()), true);
  assert.equal(codeMatches(fp, code.slice(0, 11)), false, "curto");
  assert.equal(codeMatches(fp, `${code.slice(0, 11)}${code[11] === "0" ? "1" : "0"}`), false, "um carácter errado");
});

test("assinatura: válida só para o mesmo serial, desafio e conteúdo", () => {
  const payload = Buffer.from(JSON.stringify({ appVersion: "0.9", osVersion: "11", catalogVersion: 1 })).toString("base64");
  const sig = box.signFor("ZX-2024-A1", "nonce-1", payload);
  assert.equal(verifySignature(box.pub, "ZX-2024-A1", "nonce-1", payload, sig), true);
  assert.equal(verifySignature(box.pub, "ZX-2024-A1", "nonce-2", payload, sig), false, "outro desafio");
  assert.equal(verifySignature(box.pub, "ZX-2024-A2", "nonce-1", payload, sig), false, "outro serial");
  assert.equal(verifySignature(fakeBox().pub, "ZX-2024-A1", "nonce-1", payload, sig), false, "outra box");
  assert.equal(verifySignature(box.pub, "ZX-2024-A1", "nonce-1", payload, "!!"), false);
  assert.deepEqual(parsePayload(payload), { appVersion: "0.9", osVersion: "11", gridVersion: 1 });
  assert.equal(parsePayload("e30=")?.gridVersion, 0, "payload vazio");
  assert.equal(parsePayload("{}"), null);
});

test("estado da box: segue o cliente; em atraso continua a ver TV", () => {
  const active = { status: "active", disabledAt: null };
  assert.equal(boxState({ blockedAt: null }, active), "active");
  assert.equal(boxState({ blockedAt: null }, { status: "late", disabledAt: null }), "active");
  assert.equal(boxState({ blockedAt: null }, { status: "inactive", disabledAt: null }), "expired");
  assert.equal(boxState({ blockedAt: null }, { status: "active", disabledAt: new Date() }), "blocked");
  assert.equal(boxState({ blockedAt: new Date() }, active), "blocked");
  assert.equal(boxState({ blockedAt: null }, null), "pending");
});

test("vista no backoffice: ligada até 3 min sem contacto", () => {
  const now = Date.parse("2026-10-31T12:00:00Z");
  const active = { status: "active", disabledAt: null };
  assert.equal(boxView({ blockedAt: null, lastSeenAt: new Date(now - ONLINE_MS) }, active, now), "online");
  assert.equal(boxView({ blockedAt: null, lastSeenAt: new Date(now - ONLINE_MS - 1) }, active, now), "offline");
  assert.equal(boxView({ blockedAt: null, lastSeenAt: null }, active, now), "waiting");
  assert.equal(boxView({ blockedAt: null, lastSeenAt: null }, null, now), "orphan");
});

const BASE: BillingInput = {
  name: "Maria Dias", planName: "ZON TV Família", planPriceKz: 9900, dueDate: "2026-11-10",
  lastPaymentAt: new Date("2026-10-09T10:00:00Z"), pending: null, nextOpen: null,
};

test("conta na TV: referência por pagar e o próximo pagamento é o dela", () => {
  const b = billing({ ...BASE, pending: { entity: "01055", reference: "399942328", amountKz: 9900, validUntil: "2026-11-13", dueDate: "2026-11-10" } }, TODAY);
  assert.deepEqual(b.pending, { entity: "01055", reference: "399942328", amountKz: 9900, dueDate: "2026-11-10", validUntil: "2026-11-13" });
  assert.deepEqual(b.nextPayment, { date: "2026-11-10", amountKz: 9900 });
  assert.equal(b.overdue, false);
  assert.equal(b.customer, "Maria Dias");
  assert.equal(b.lastPaymentDate, "2026-10-09");
});

test("conta na TV: sem referência, o próximo título em aberto; senão o vencimento do plano", () => {
  assert.deepEqual(billing({ ...BASE, nextOpen: { dueDate: "2026-10-25", amountKz: 12500 } }, TODAY).nextPayment, { date: "2026-10-25", amountKz: 12500 });
  assert.equal(billing({ ...BASE, nextOpen: { dueDate: "2026-10-25", amountKz: 12500 } }, TODAY).overdue, true, "título vencido");
  assert.deepEqual(billing(BASE, TODAY).nextPayment, { date: "2026-11-10", amountKz: 9900 });
  const none = billing({ ...BASE, dueDate: null, lastPaymentAt: null }, TODAY);
  assert.equal(none.nextPayment, null);
  assert.equal(none.overdue, false);
  assert.equal(none.lastPaymentDate, null);
});
