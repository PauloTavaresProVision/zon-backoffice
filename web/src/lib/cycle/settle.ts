// Depois do pagamento: baixa do título no IXC e criação do título do período seguinte.
import { and, eq, isNull, sql } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { db, schema } from "@/lib/db";
import { cycleMode } from "@/lib/env";
import { date, isoDay, kz } from "@/lib/format";
import { fromIxcDate, ixcDate, requireIxc, type IxcClient } from "@/lib/ixc";
import type { IxcRecord } from "@/lib/ixc/client";
import { amountToCharge, nextPeriod } from "./rules";

const LEASE_MINUTES = 15;
const MAX_BACKOFF_MINUTES = 120;

/** Reserva pagamentos confirmados cujo título ainda não teve baixa no IXC. */
async function claim(limit: number, onlyIds?: number[]): Promise<number[]> {
  const ids = onlyIds?.length ? sql`and p.id in (${sql.join(onlyIds.map((i) => sql`${i}`), sql`, `)})` : sql``;
  const res = await db().execute<{ id: number }>(sql`
    update payments set ixc_settle_claimed_until = now() + make_interval(mins => ${LEASE_MINUTES})
    where id in (
      select p.id from payments p
      where p.status = 'paid' and p.ixc_receivable_id is not null and p.ixc_settled_at is null
        and (p.ixc_settle_next_at is null or p.ixc_settle_next_at <= now())
        and (p.ixc_settle_claimed_until is null or p.ixc_settle_claimed_until < now())
        ${ids}
      order by p.paid_at
      limit ${limit}
      for update skip locked
    )
    returning id`);
  return res.rows.map((r) => Number(r.id));
}

async function openOfContract(client: IxcClient, contractIxcId: string): Promise<IxcRecord[]> {
  const rows = await client.listAll("fn_areceber", { qtype: "fn_areceber.id_contrato", query: contractIxcId, oper: "=" }, true);
  return rows.filter((r) => r.status === "A");
}

/** Baixa de um título, como o IXC a espera (formato do sistema anterior, já testado com a conta da Zon). */
function settlePayload(r: IxcRecord, amount: number, paidDay: string, customerName: string): Record<string, string> {
  const value = amount.toFixed(2);
  return {
    filial_id: r.filial_id ?? "",
    id_receber: r.id ?? "",
    conta_: r.id_carteira_cobranca ?? "",
    id_conta: r.id_conta ?? "",
    data: ixcDate(paidDay),
    documento: r.id ?? "",
    credito: value,
    valor_total_recebido: value,
    historico: `Rec. ${customerName} - Multicaixa (Zon Backoffice) - título ${r.id}`,
    tipo_lanc: "R",
    tipo_recebimento: "D",
    tipo_r: "T",
  };
}

type SettleResult = { settled: boolean; next: string | null; note?: string };

async function settleOne(paymentId: number, client: IxcClient): Promise<SettleResult> {
  const [row] = await db().select().from(schema.payments)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.payments.customerId))
    .where(eq(schema.payments.id, paymentId)).limit(1);
  if (!row) throw new Error(`Pagamento ${paymentId} não existe.`);
  const { payments: p, customers: c } = row;
  const paidDay = isoDay(p.paidAt ?? new Date());

  const r = await client.getById("fn_areceber", p.ixcReceivableId!, true);
  if (!r) throw new Error(`O título ${p.ixcReceivableId} não existe no IXC.`);
  let note: string | undefined;
  if (r.status === "A") {
    const owed = amountToCharge(r);
    const paid = p.paidAmountKz ?? p.amountKz;
    if (Math.abs(owed - paid) > 1) throw new Error(`O título ${r.id} está em aberto por ${kz(owed)} e foram pagos ${kz(paid)}: verificar à mão.`);
    await client.postJson("fn_areceber_recebimentos_baixas_novo", settlePayload(r, paid, paidDay, c.name));
    // Confirma que ficou mesmo liquidado: o IXC às vezes responde 200 sem aplicar
    const after = await client.getById("fn_areceber", r.id!, true);
    if (after?.status === "A") throw new Error(`O IXC aceitou a baixa do título ${r.id} mas ele continua em aberto.`);
  } else {
    // Já liquidado: uma tentativa anterior que caiu a meio, ou pago por outra via
    note = `o título ${r.id} já estava liquidado no IXC (estado ${r.status || "?"})`;
  }
  await db().update(schema.receivables).set({ status: "R", closedAt: new Date() }).where(eq(schema.receivables.ixcId, r.id!));

  const next = await ensureNextReceivable(client, r, paidDay, p.contractId);
  if (next) await db().update(schema.customers).set({ dueDate: next.due, updatedAt: new Date() }).where(eq(schema.customers.id, c.id));

  await db().update(schema.payments)
    .set({ ixcSettledAt: new Date(), ixcSettleError: null, ixcSettleNextAt: null, ixcSettleClaimedUntil: null })
    .where(eq(schema.payments.id, p.id));
  await logActivity({
    // Pago aqui e já liquidado no IXC: pode ser um pagamento a dobrar (ex.: referência do sistema antigo)
    kind: note ? "ixc.already_settled" : "ixc.settled",
    customerId: c.id,
    message: [
      note ? `Pagamento confirmado, mas ${note}: confirmar se o cliente pagou duas vezes` : `Baixa do título **${r.id}** feita no IXC`,
      next ? `próximo vencimento a **${date(next.due)}**` : null,
    ].filter(Boolean).join(" · "),
    meta: { paymentId: p.id, receivable: r.id, next: next?.id ?? null },
  });
  return { settled: !note, next: next?.id ?? null, note };
}

/**
 * Cria o título do período seguinte, se o IXC ainda não o tiver.
 * Idempotente: se já houver um em aberto com vencimento posterior, usa esse.
 */
async function ensureNextReceivable(client: IxcClient, paid: IxcRecord, paidDay: string, contractId: number | null): Promise<{ id: string; due: string } | null> {
  const previousDue = fromIxcDate(paid.data_vencimento) ?? paidDay;
  const open = await openOfContract(client, paid.id_contrato!);
  const later = open
    .map((r) => ({ r, due: fromIxcDate(r.data_vencimento) }))
    .filter((x): x is { r: IxcRecord; due: string } => !!x.due && x.due > previousDue)
    .sort((a, b) => a.due.localeCompare(b.due))[0];
  if (later) return { id: later.r.id!, due: later.due };

  const { start, end } = nextPeriod(paidDay, previousDue);
  const nparcela = Math.max(Number(paid.nparcela) || 0, ...open.map((r) => Number(r.nparcela) || 0)) + 1;
  const id = await client.create("fn_areceber", {
    id_cliente: paid.id_cliente ?? "",
    id_contrato: paid.id_contrato ?? "",
    id_conta: paid.id_conta ?? "",
    filial_id: paid.filial_id ?? "",
    valor: paid.valor ?? "",
    previsao: paid.previsao || "N",
    tipo_recebimento: paid.tipo_recebimento || "Pix",
    id_carteira_cobranca: paid.id_carteira_cobranca || "1",
    liberado: "S",
    status: "A",
    data_emissao: ixcDate(paidDay),
    data_vencimento: ixcDate(end),
    data_inicial: ixcDate(start),
    data_final: ixcDate(end),
    nparcela: String(nparcela),
    obs: `de ${ixcDate(start)} até ${ixcDate(end)}`,
  });
  // Fica já no backoffice, sem esperar pela próxima sincronização
  const fresh = (await client.getById("fn_areceber", id, true)) ?? { ...paid, id, data_vencimento: end, nparcela: String(nparcela), status: "A" };
  if (contractId) {
    const [k] = await db().select({ customerId: schema.contracts.customerId }).from(schema.contracts).where(eq(schema.contracts.id, contractId)).limit(1);
    await db().insert(schema.receivables).values({
      ixcId: id, contractId, customerId: k?.customerId ?? null, amountKz: amountToCharge(fresh), dueDate: end,
      status: "A", nparcela, raw: fresh,
    }).onConflictDoNothing();
  }
  return { id, due: end };
}

async function recordFailure(paymentId: number, err: unknown): Promise<void> {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
  await db().update(schema.payments).set({
    ixcSettleAttempts: sql`${schema.payments.ixcSettleAttempts} + 1`,
    ixcSettleError: message,
    ixcSettleClaimedUntil: null,
    // 2, 4, 8… minutos, no máximo duas horas
    ixcSettleNextAt: sql`now() + make_interval(mins => least(${MAX_BACKOFF_MINUTES}, power(2, ${schema.payments.ixcSettleAttempts} + 1)::int))`,
  }).where(eq(schema.payments.id, paymentId));
}

/** Dá baixa no IXC dos pagamentos confirmados. Só no modo ativo. */
export async function settlePaidInIxc(opts: { limit?: number; onlyIds?: number[] } = {}): Promise<string> {
  if (cycleMode() !== "ativo") return "Baixas desligadas (só no modo ativo)";
  const { client } = requireIxc();
  const ids = await claim(opts.limit ?? 25, opts.onlyIds);
  let done = 0;
  let failed = 0;
  let skipped = 0;
  for (const id of ids) {
    try {
      const r = await settleOne(id, client);
      if (r.settled) done += 1;
      else skipped += 1;
    } catch (err) {
      failed += 1;
      await recordFailure(id, err);
    }
  }
  if (failed && !done && !skipped) throw new Error(`${failed} baixas falharam; nova tentativa automática`);
  return `${done} baixas no IXC` + (skipped ? ` · ${skipped} já estavam liquidados` : "") + (failed ? ` · ${failed} falharam` : "");
}

/** Para o botão "Repetir agora". */
export async function retrySettleNow(): Promise<number[]> {
  const rows = await db().update(schema.payments).set({ ixcSettleNextAt: null })
    .where(and(eq(schema.payments.status, "paid"), isNull(schema.payments.ixcSettledAt), sql`${schema.payments.ixcSettleAttempts} > 0`,
      isNull(schema.payments.ixcSettleClaimedUntil)))
    .returning({ id: schema.payments.id });
  return rows.map((r) => r.id);
}
