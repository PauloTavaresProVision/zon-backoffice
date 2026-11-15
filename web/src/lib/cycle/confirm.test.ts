import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppyPayCharge, AppyPayClient } from "@/lib/appypay";
import { findChargesByReference } from "./confirm";

const charge = (referenceNumber: string, status: string, amount = 100, id = `id-${referenceNumber}-${status}`): AppyPayCharge => ({
  id, status, amount, merchantTransactionId: null, referenceNumber, entity: "11700", providerPaidAt: null, updatedAt: null,
});

/** Cliente falso: devolve a lista por páginas e guarda os filtros pedidos. */
function fakeClient(all: AppyPayCharge[]) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    async listCharges(f: Record<string, unknown> & { skip: number; limit: number }) {
      calls.push(f);
      return all.slice(f.skip, f.skip + f.limit);
    },
  } as unknown as AppyPayClient;
  return { client, calls };
}

test("findChargesByReference: encontra pelo número e prefere a cobrança paga", async () => {
  const { client, calls } = fakeClient([
    charge("111222333", "Pending"),
    charge("999888777", "Success", 5000),
    charge("111222333", "Success"),
  ]);
  const issuedAt = new Date("2026-11-10T10:00:00Z");
  const r = await findChargesByReference(client, [
    { reference: "111222333", amountKz: 100, issuedAt },
    { reference: "444555666", amountKz: 300, issuedAt: new Date("2026-11-12T10:00:00Z") },
  ]);
  assert.equal(r.found.get("111222333")?.status, "Success");
  assert.equal(r.found.has("999888777"), false);
  assert.equal(r.found.has("444555666"), false);
  assert.equal(r.truncated, false);
  assert.equal(r.scanned, 3);
  // Filtros: desde a mais antiga com um dia de folga, e entre o valor mais baixo e o mais alto
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.dateFrom, "2026-11-09T10:00:00Z");
  assert.equal(calls[0]!.amountFrom, 99);
  assert.equal(calls[0]!.amountTo, 301);
});

test("findChargesByReference: percorre as páginas e para quando já as tem todas pagas", async () => {
  const many = Array.from({ length: 250 }, (_, i) => charge(String(500_000_000 + i), "Success", 100, `x${i}`));
  many[120] = charge("123123123", "Success");
  const { client, calls } = fakeClient(many);
  const r = await findChargesByReference(client, [{ reference: "123123123", amountKz: 100, issuedAt: new Date() }]);
  assert.equal(r.found.get("123123123")?.status, "Success");
  assert.equal(calls.length, 2);
  assert.equal(r.truncated, false);
});

test("findChargesByReference: lista sem fim fica marcada como cortada", async () => {
  const client = { listCharges: async () => Array.from({ length: 100 }, (_, i) => charge(String(600_000_000 + i), "Pending", 100, `y${i}`)) } as unknown as AppyPayClient;
  const r = await findChargesByReference(client, [{ reference: "777777777", amountKz: 100, issuedAt: new Date() }]);
  assert.equal(r.truncated, true);
  assert.equal(r.scanned, 2000);
});

test("findChargesByReference: sem referências não chama a AppyPay", async () => {
  const { client, calls } = fakeClient([]);
  const r = await findChargesByReference(client, []);
  assert.equal(calls.length, 0);
  assert.equal(r.found.size, 0);
});
