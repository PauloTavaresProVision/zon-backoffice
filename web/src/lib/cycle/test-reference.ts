// Referência de teste da AppyPay: um valor pequeno, sem cliente, para pagar no Multicaixa e ver se a
// notificação chega e se a verificação periódica a encontra. Não depende do CYCLE_MODE: não toca em clientes,
// no IXC, em SMS nem em faturas.
import { desc, eq, sql } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { isPaidStatus, requireAppypay } from "@/lib/appypay";
import { db, schema } from "@/lib/db";
import { dateTime, int, kz, refFmt } from "@/lib/format";
import { NO_ID, applyTestCharge, findChargesByReference } from "./confirm";
import { newReferenceNumber, nowUtc } from "./rules";

export const TEST_AMOUNT_KZ = 100;
/** Validade da referência de teste, em dias (até às 23:59:59 UTC do último dia, como o gerador que funciona). */
export const TEST_DAYS = 7;
const MAX_OPEN = 3;

export type AppyPayTest = typeof schema.appypayTests.$inferSelect;

export async function createTestReference(userId: number): Promise<AppyPayTest> {
  const { client, cfg } = requireAppypay();
  const T = schema.appypayTests;
  const [count] = await db().select({ open: sql<number>`count(*)::int` }).from(T).where(eq(T.status, "pending"));
  if ((count?.open ?? 0) >= MAX_OPEN) throw new Error(`Já há ${MAX_OPEN} referências de teste por pagar. Pague uma ou espere que expire.`);

  const issuedAt = new Date();
  // A AppyPay respondeu HTTP 500 a uma validade de 24 horas com hora qualquer; com o fim do dia aceita
  const expiresAt = new Date(`${new Date(issuedAt.getTime() + TEST_DAYS * 86_400_000).toISOString().slice(0, 10)}T23:59:59Z`);
  let row: AppyPayTest | undefined;
  for (let i = 0; i < 5 && !row; i++) {
    const reference = newReferenceNumber();
    // Também não pode coincidir com a referência de um cliente
    const [clash] = await db().select({ id: schema.payments.id }).from(schema.payments).where(eq(schema.payments.reference, reference)).limit(1);
    if (clash) continue;
    [row] = await db().insert(T).values({ entity: cfg.entity, reference, amountKz: TEST_AMOUNT_KZ, issuedAt, expiresAt, createdBy: userId })
      .onConflictDoNothing().returning();
  }
  if (!row) throw new Error("Não foi possível reservar um número de referência livre.");

  try {
    const created = await client.createReference({
      referenceNumber: row.reference,
      amount: TEST_AMOUNT_KZ,
      // As mesmas descrições do gerador que funciona
      descriptionLine1: "Pagamento de teste",
      descriptionLine2: `Entidade ${cfg.entity}`,
      startDate: nowUtc(issuedAt),
      expirationDate: nowUtc(expiresAt),
    });
    const [t] = await db().update(T).set({
      appypayId: created.paymentId ?? `${NO_ID}${row.reference}`,
      reference: created.referenceNumber.replace(/\D/g, "") || row.reference,
      entity: created.entity ?? cfg.entity,
    }).where(eq(T.id, row.id)).returning();
    await logActivity({
      kind: "appypay.test",
      userId,
      message: `Teste da AppyPay: referência **${refFmt(t!.reference)}** de **${kz(TEST_AMOUNT_KZ)}** criada (válida ${TEST_DAYS} dias)`,
      meta: { testId: t!.id },
    });
    return t!;
  } catch (err) {
    await db().delete(T).where(eq(T.id, row.id));
    throw err;
  }
}

export async function recentTestReferences(limit = 5): Promise<AppyPayTest[]> {
  const T = schema.appypayTests;
  return db().select().from(T).orderBy(desc(T.issuedAt)).limit(limit);
}

/**
 * Pergunta à AppyPay por uma referência de teste: se já está ativa e o que mostra a lista de pagamentos.
 * Se a lista a der como paga e cá ainda não estiver, fica paga (confirmada pela verificação).
 */
export async function lookupTestReference(testId: number): Promise<string> {
  const { client } = requireAppypay();
  const T = schema.appypayTests;
  const [t] = await db().select().from(T).where(eq(T.id, testId)).limit(1);
  if (!t) throw new Error("Referência de teste não encontrada.");
  const parts: string[] = [];

  const reg = await client.getReference(t.reference).catch((err: unknown) => (err instanceof Error ? err : new Error(String(err))));
  if (reg instanceof Error) parts.push(`Referência: sem resposta (${reg.message})`);
  else if (!reg) parts.push("Referência: a AppyPay não a encontra");
  else parts.push(`Referência: ${reg.isActive === false ? "inativa" : reg.isActive ? "ativa" : "registada"} na AppyPay`);

  const look = await findChargesByReference(client, [t]);
  const c = look.found.get(t.reference);
  if (!c) parts.push(`Lista de pagamentos: não aparece (${int(look.scanned)} vistos${look.truncated ? ", lista cortada" : ""})`);
  else {
    parts.push(`Lista de pagamentos: ${c.status || "sem estado"}, ${kz(c.amount)}${c.providerPaidAt ? `, paga ${c.providerPaidAt}` : ""}`);
    if (isPaidStatus(c.status) && t.status !== "paid") {
      const outcome = await applyTestCharge(t.id, c, "verificacao");
      if (outcome === "paid") parts.push("Ficou paga");
    }
  }
  await db().update(T).set({ checkedAt: new Date() }).where(eq(T.id, t.id));
  return parts.join(" · ");
}

/** Texto curto do estado, para a lista nas Definições. */
export function testStatusLabel(t: AppyPayTest, now = Date.now()): string {
  if (t.status === "paid") return `Paga ${t.paidAt ? dateTime(t.paidAt) : ""}`.trim();
  if (t.status === "expired" || t.expiresAt.getTime() < now) return "Expirada";
  return `Por pagar até ${dateTime(t.expiresAt)}`;
}
