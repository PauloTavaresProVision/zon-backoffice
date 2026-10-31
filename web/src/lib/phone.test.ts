import assert from "node:assert/strict";
import { test } from "node:test";
import { angolaMobile, firstMobile } from "./phone";

test("telemóveis de Angola", () => {
  assert.equal(angolaMobile("923418552"), "923418552");
  assert.equal(angolaMobile("+244 923 418 552"), "923418552");
  assert.equal(angolaMobile("00244923418552"), "923418552");
  assert.equal(angolaMobile("923-418-552"), "923418552");
  assert.equal(angolaMobile("222 334 455"), null, "fixo");
  assert.equal(angolaMobile("92341855"), null, "curto");
  assert.equal(angolaMobile(""), null);
  assert.equal(angolaMobile(null), null);
});

test("primeiro telemóvel válido entre vários campos", () => {
  assert.equal(firstMobile("", "222334455", "934 220 871"), "934220871");
  assert.equal(firstMobile("222334455 / 912774019"), "912774019");
  assert.equal(firstMobile(undefined, ""), null);
});
