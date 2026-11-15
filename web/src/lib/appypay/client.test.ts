import assert from "node:assert/strict";
import { test } from "node:test";
import { paymentMethodKey } from "./client";

test("a chave da aplicação vai em minúsculas, com o prefixo em maiúsculas", () => {
  assert.equal(paymentMethodKey("REF_7E2143AB-CA4D-47CD-89F1-E88F1F2DDFB6"), "REF_7e2143ab-ca4d-47cd-89f1-e88f1f2ddfb6");
  assert.equal(paymentMethodKey(" 7E2143AB-CA4D-47CD-89F1-E88F1F2DDFB6 "), "REF_7e2143ab-ca4d-47cd-89f1-e88f1f2ddfb6");
  assert.equal(paymentMethodKey("ref_abc"), "REF_abc");
});
