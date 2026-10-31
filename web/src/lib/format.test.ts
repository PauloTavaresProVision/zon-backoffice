import assert from "node:assert/strict";
import { test } from "node:test";
import { clientState } from "./client-state";
import { addDays, compactKz, daysFrom, isoDay, millions, monthLabel, ogDateTime, rel, shiftMonth } from "./format";

test("datas em Luanda (UTC+1)", () => {
  // 23:30 UTC já é o dia seguinte em Luanda
  assert.equal(isoDay(new Date("2026-10-31T23:30:00Z")), "2026-11-01");
  assert.equal(ogDateTime(new Date("2026-10-31T09:05:07Z")), "2026-10-31 10:05:07");
  assert.equal(addDays("2026-02-27", 2), "2026-03-01");
  assert.equal(daysFrom("2026-11-03", "2026-10-31"), 3);
  assert.equal(rel("2026-11-01", "2026-10-31"), "amanhã");
  assert.equal(rel("2026-10-28", "2026-10-31"), "há 3 dias");
});

test("meses", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-10", 3), "2027-01");
  assert.equal(monthLabel("2026-10"), "outubro 2026");
});

test("valores compactos", () => {
  assert.equal(compactKz(250_000), "250 mil");
  assert.equal(compactKz(1_500_000), "1,5 M");
  assert.equal(compactKz(2_000_000), "2 M");
  assert.equal(millions(480_000), "0,48");
  assert.equal(millions(12_540_000), "12,5");
});

test("estado do cliente", () => {
  const today = "2026-10-31";
  assert.equal(clientState({ status: "active", dueDate: "2026-11-20" }, today), "active");
  assert.equal(clientState({ status: "active", dueDate: "2026-11-05" }, today), "expiring");
  assert.equal(clientState({ status: "active", dueDate: "2026-10-30" }, today), "late");
  assert.equal(clientState({ status: "active", dueDate: null }, today), "active");
  assert.equal(clientState({ status: "late", dueDate: "2026-12-01" }, today), "late");
  assert.equal(clientState({ status: "inactive", dueDate: "2026-11-02" }, today), "inactive");
});
