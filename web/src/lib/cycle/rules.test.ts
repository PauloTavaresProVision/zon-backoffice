import assert from "node:assert/strict";
import { test } from "node:test";
import {
  amountToCharge, endOfDayUtc, inCycleWindow, newReferenceNumber, nextPeriod, paidSms, parseProviderDate,
  referenceLastDay, referenceSms, smsHours, smsStage,
} from "./rules";

const TODAY = "2026-10-31";

test("valor a cobrar: o que falta pagar, senão o valor do título", () => {
  assert.equal(amountToCharge({ valor: "12500.00", valor_aberto: "12500.00" }), 12500);
  assert.equal(amountToCharge({ valor: "12500.00", valor_aberto: "2500.00" }), 2500, "pagamento parcial no IXC");
  assert.equal(amountToCharge({ valor: "9900.00", valor_aberto: "" }), 9900);
  assert.equal(amountToCharge({ valor: "9900,00" }), 9900);
});

test("janela do ciclo: 7 dias antes até 30 dias de atraso", () => {
  assert.equal(inCycleWindow("2026-11-07", TODAY), true);
  assert.equal(inCycleWindow("2026-11-08", TODAY), false);
  assert.equal(inCycleWindow("2026-10-20", TODAY), true);
  assert.equal(inCycleWindow("2026-09-30", TODAY), false);
});

test("validade da referência: vencimento + 3 dias; em atraso, uma semana", () => {
  assert.equal(referenceLastDay("2026-11-07", TODAY), "2026-11-10");
  assert.equal(referenceLastDay(TODAY, TODAY), "2026-11-03", "vence hoje");
  assert.equal(referenceLastDay("2026-10-20", TODAY), "2026-11-07", "título em atraso");
  assert.equal(endOfDayUtc("2026-11-10"), "2026-11-10T22:59:59Z", "23:59:59 em Luanda");
});

test("fases das SMS", () => {
  assert.deepEqual([8, 7, 4, 3, 2, 1, 0, -5].map(smsStage), [7, 7, 7, 3, 3, 1, 1, 1]);
});

test("número de referência: 9 dígitos", () => {
  for (let i = 0; i < 50; i++) assert.match(newReferenceNumber(), /^[1-9]\d{8}$/);
});

test("período seguinte: pagar cedo não faz perder dias", () => {
  assert.deepEqual(nextPeriod("2026-10-31", "2026-11-05"), { start: "2026-10-31", end: "2026-12-05" });
  assert.deepEqual(nextPeriod("2026-10-31", "2026-10-31"), { start: "2026-10-31", end: "2026-11-30" });
  assert.deepEqual(nextPeriod("2026-10-31", "2026-10-20"), { start: "2026-10-31", end: "2026-11-30" }, "em atraso recomeça no pagamento");
});

test("data de pagamento da rede Multicaixa, na hora de Luanda", () => {
  assert.equal(parseProviderDate("2026-10-31 14:05:00")?.toISOString(), "2026-10-31T13:05:00.000Z");
  assert.equal(parseProviderDate("31/10/2026 14:05:00")?.toISOString(), "2026-10-31T13:05:00.000Z");
  assert.equal(parseProviderDate("2026-10-31T13:05:00Z")?.toISOString(), "2026-10-31T13:05:00.000Z");
  assert.equal(parseProviderDate("ontem"), null);
  assert.equal(parseProviderDate(""), null);
});

test("texto da SMS com a referência", () => {
  const text = referenceSms({
    name: "Ana Paula Domingos", service: "Fibra 50 + TV Total", dueDate: "2026-11-07", today: TODAY,
    entity: "11700", reference: "932100049", amount: 12500, support: "923 000 000",
  });
  assert.match(text, /^Estimado\(a\) Ana,/);
  assert.match(text, /termina em 7 dias \(07\/11\)/);
  assert.match(text, /Referência: 932 100 049/);
  assert.match(text, /Valor: 12 500 Kz/);
  assert.match(text, /Dúvidas: 923 000 000$/);
  assert.match(referenceSms({ name: "Rui", service: "Fibra 20", dueDate: "2026-11-01", today: TODAY, entity: "11700", reference: "932100049", amount: 7500 }), /termina amanhã/);
  assert.match(referenceSms({ name: "Rui", service: "Fibra 20", dueDate: "2026-10-28", today: TODAY, entity: "11700", reference: "932100049", amount: 7500 }), /terminou a 28\/10/);
  assert.match(paidSms({ name: "Rui Gonga", amount: 7500, reference: "932100049" }), /^Rui, recebemos o seu pagamento de 7 500 Kz/);
});

test("horário das SMS: 8h às 20h em Luanda", () => {
  assert.equal(smsHours(new Date("2026-10-31T06:59:00Z")), false, "7h59");
  assert.equal(smsHours(new Date("2026-10-31T07:00:00Z")), true, "8h");
  assert.equal(smsHours(new Date("2026-10-31T18:59:00Z")), true, "19h59");
  assert.equal(smsHours(new Date("2026-10-31T19:00:00Z")), false, "20h");
});
