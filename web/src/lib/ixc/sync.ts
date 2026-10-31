// Sincronização do IXC (só leitura): clientes, contratos e títulos em aberto.
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { amountToCharge } from "@/lib/cycle/rules";
import { isoDay, refFmt } from "@/lib/format";
import { firstMobile } from "@/lib/phone";
import { logActivity } from "@/lib/activity";
import type { IxcRecord } from "./client";
import { fromIxcDate } from "./client";
import { BLOCKED_INTERNET, requireIxc } from "./index";

const CHUNK = 500;

function chunks<T>(xs: T[], n = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

const intOrNull = (v: string | undefined) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const textOrNull = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
const emailOrNull = (v: string | undefined) => (v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? v.trim().toLowerCase() : null);

/** Tipo e velocidade do plano a partir do nome que vem do IXC. */
export function guessPlan(name: string): { kind: string; speedMbps: number | null } {
  const tv = /\btv\b/i.test(name);
  const net = /fibra|net|mbps|mega|\d+\s*m\b/i.test(name);
  const speed = /(\d+)\s*(?:mbps|mb|megas?|m)\b/i.exec(name);
  return { kind: tv && net ? "internet_tv" : tv ? "tv" : "internet", speedMbps: speed ? Number(speed[1]) : null };
}

function mostCommon(xs: number[]): number | null {
  const count = new Map<number, number>();
  for (const x of xs) count.set(x, (count.get(x) ?? 0) + 1);
  let best: number | null = null;
  let n = 0;
  for (const [x, c] of count) if (c > n) { best = x; n = c; }
  return best;
}

export async function syncIxc(): Promise<string> {
  const { client } = requireIxc();
  const startedAt = new Date();
  const today = isoDay();

  // Três varrimentos em vez de um pedido por cliente
  const [rawCustomers, rawContracts, rawReceivables] = await Promise.all([
    client.listAll("cliente", { qtype: "cliente.id", query: "0", oper: ">" }),
    client.listAll("cliente_contrato", { qtype: "cliente_contrato.id", query: "0", oper: ">" }),
    client.listAll("fn_areceber", { qtype: "fn_areceber.status", query: "A", oper: "=" }, true),
  ]);

  // Só entram clientes com pelo menos um contrato (o IXC também guarda contactos e potenciais clientes)
  const withContract = new Set(rawContracts.map((k) => k.id_cliente));
  const customersIn = rawCustomers.filter((c) => intOrNull(c.id) && withContract.has(c.id));

  /* ---------- Planos ---------- */
  const amountsByPlan = new Map<string, number[]>();
  const contractPlan = new Map(rawContracts.map((k) => [k.id, k.id_vd_contrato]));
  for (const r of rawReceivables) {
    const plan = contractPlan.get(r.id_contrato);
    if (plan) amountsByPlan.set(plan, [...(amountsByPlan.get(plan) ?? []), amountToCharge(r)]);
  }
  const planNames = new Map<string, string>();
  for (const k of rawContracts) if (k.id_vd_contrato && k.contrato && !planNames.has(k.id_vd_contrato)) planNames.set(k.id_vd_contrato, k.contrato);
  const existingPlans = await db().select().from(schema.plans).where(sql`${schema.plans.ixcPlanId} is not null`);
  const planByIxc = new Map(existingPlans.map((p) => [p.ixcPlanId!, p]));
  for (const [ixcPlanId, name] of planNames) {
    const price = mostCommon(amountsByPlan.get(ixcPlanId) ?? []) ?? 0;
    const known = planByIxc.get(ixcPlanId);
    if (!known) {
      const [p] = await db().insert(schema.plans).values({ code: `ixc-${ixcPlanId}`, name, priceKz: price, ixcPlanId, ...guessPlan(name) })
        .onConflictDoNothing().returning();
      if (p) planByIxc.set(ixcPlanId, p);
    } else if (known.code.startsWith("ixc-") && (known.name !== name || (price && known.priceKz !== price))) {
      // Os planos criados pela sincronização seguem o IXC; os definidos à mão não se tocam
      await db().update(schema.plans).set({ name, ...(price ? { priceKz: price } : {}) }).where(eq(schema.plans.id, known.id));
    }
  }

  /* ---------- Clientes ---------- */
  const before = new Set((await db().select({ ixcId: schema.customers.ixcId }).from(schema.customers)).map((c) => c.ixcId));
  for (const part of chunks(customersIn)) {
    await db().insert(schema.customers).values(part.map((c) => ({
      ixcId: Number(c.id),
      name: c.razao || c.fantasia || `Cliente ${c.id}`,
      phone: firstMobile(c.telefone_celular, c.whatsapp, c.fone),
      email: emailOrNull(c.email),
      nif: textOrNull(c.cnpj_cpf),
      zone: textOrNull(c.bairro),
      since: fromIxcDate(c.data_cadastro),
      ixcSyncedAt: startedAt,
    }))).onConflictDoUpdate({
      target: schema.customers.ixcId,
      set: {
        name: sql`excluded.name`, phone: sql`excluded.phone`, email: sql`excluded.email`, nif: sql`excluded.nif`,
        zone: sql`excluded.zone`, since: sql`coalesce(excluded.since, ${schema.customers.since})`,
        ixcSyncedAt: startedAt, updatedAt: startedAt,
      },
    });
  }
  const custRows = await db().select({ id: schema.customers.id, ixcId: schema.customers.ixcId }).from(schema.customers);
  const custByIxc = new Map(custRows.map((c) => [String(c.ixcId), c.id]));
  const created = customersIn.filter((c) => !before.has(Number(c.id)));
  for (const part of chunks(created)) {
    const ids = part.map((c) => custByIxc.get(c.id)).filter((x): x is number => !!x);
    if (ids.length) await db().insert(schema.activity).values(ids.map((customerId) => ({ customerId, kind: "ixc.import", message: "Cliente integrado do IXC" })));
  }

  /* ---------- Contratos ---------- */
  const openAmountByContract = new Map<string, number>();
  for (const r of rawReceivables) if (!openAmountByContract.has(r.id_contrato)) openAmountByContract.set(r.id_contrato, amountToCharge(r));
  const contractsIn = rawContracts.filter((k) => intOrNull(k.id) && custByIxc.has(k.id_cliente));
  for (const part of chunks(contractsIn)) {
    await db().insert(schema.contracts).values(part.map((k) => ({
      ixcId: Number(k.id),
      customerId: custByIxc.get(k.id_cliente)!,
      planId: planByIxc.get(k.id_vd_contrato)?.id ?? null,
      ixcPlanId: textOrNull(k.id_vd_contrato),
      status: k.status || "?",
      internetStatus: textOrNull(k.status_internet),
      amountKz: openAmountByContract.get(k.id) ?? planByIxc.get(k.id_vd_contrato)?.priceKz ?? null,
      paidUntil: fromIxcDate(k.pago_ate_data),
      activatedAt: fromIxcDate(k.data_ativacao),
      syncedAt: startedAt,
    }))).onConflictDoUpdate({
      target: schema.contracts.ixcId,
      set: {
        customerId: sql`excluded.customer_id`, planId: sql`excluded.plan_id`, ixcPlanId: sql`excluded.ixc_plan_id`,
        status: sql`excluded.status`, internetStatus: sql`excluded.internet_status`, amountKz: sql`excluded.amount_kz`,
        paidUntil: sql`excluded.paid_until`, activatedAt: sql`excluded.activated_at`, syncedAt: startedAt,
      },
    });
  }
  const contractRows = await db().select({ id: schema.contracts.id, ixcId: schema.contracts.ixcId }).from(schema.contracts);
  const contractByIxc = new Map(contractRows.map((k) => [String(k.ixcId), k.id]));

  /* ---------- Títulos em aberto ---------- */
  const open = rawReceivables.filter((r) => r.id && fromIxcDate(r.data_vencimento) && contractByIxc.has(r.id_contrato));
  for (const part of chunks(open)) {
    await db().insert(schema.receivables).values(part.map((r: IxcRecord) => ({
      ixcId: r.id,
      contractId: contractByIxc.get(r.id_contrato)!,
      customerId: custByIxc.get(r.id_cliente) ?? null,
      amountKz: amountToCharge(r),
      dueDate: fromIxcDate(r.data_vencimento)!,
      status: "A",
      nparcela: intOrNull(r.nparcela),
      raw: r,
      seenAt: startedAt,
    }))).onConflictDoUpdate({
      target: schema.receivables.ixcId,
      set: {
        contractId: sql`excluded.contract_id`, customerId: sql`excluded.customer_id`, amountKz: sql`excluded.amount_kz`,
        dueDate: sql`excluded.due_date`, status: "A", nparcela: sql`excluded.nparcela`, raw: sql`excluded.raw`,
        seenAt: startedAt, closedAt: null,
      },
    });
  }
  // Os que deixaram de vir em aberto foram pagos ou anulados no IXC
  const closed = await db().update(schema.receivables).set({ status: "F", closedAt: startedAt })
    .where(and(isNull(schema.receivables.closedAt), lt(schema.receivables.seenAt, startedAt)))
    .returning({ ixcId: schema.receivables.ixcId });
  const cancelled = await cancelReferencesOfClosed(closed.map((r) => r.ixcId));

  /* ---------- Estado de cada cliente ---------- */
  await db().execute(sql`
    with k as (
      select customer_id,
        (array_agg(plan_id order by ixc_id) filter (where status = 'A' and plan_id is not null))[1] as plan_id,
        bool_or(status = 'A') as active,
        bool_or(status = 'A' and internet_status in (${sql.join(BLOCKED_INTERNET.map((s) => sql`${s}`), sql`, `)})) as blocked,
        max(paid_until) filter (where status = 'A') as paid_until
      from contracts group by customer_id
    ), r as (
      select r.customer_id, min(r.due_date) as due
      from receivables r join contracts c on c.id = r.contract_id
      where r.closed_at is null and c.status = 'A'
      group by r.customer_id
    )
    update customers cu set
      plan_id = coalesce(k.plan_id, cu.plan_id),
      due_date = coalesce(r.due, k.paid_until, cu.due_date),
      status = (case
        when cu.disabled_at is not null or not k.active then 'inactive'
        when k.blocked or r.due < ${today} then 'late'
        else 'active' end)::customer_status
    from k left join r on r.customer_id = k.customer_id
    where k.customer_id = cu.id and cu.ixc_synced_at = ${startedAt}`);

  return [
    `${customersIn.length} clientes`,
    `${contractsIn.length} contratos`,
    `${open.length} títulos em aberto`,
    ...(created.length ? [`${created.length} clientes novos`] : []),
    ...(cancelled ? [`${cancelled} referências anuladas (título fechado no IXC)`] : []),
  ].join(" · ");
}

/**
 * Se um título foi liquidado no IXC por outra via (balcão, sistema antigo), a nossa referência
 * deixa de valer, para o cliente não pagar duas vezes.
 */
async function cancelReferencesOfClosed(ixcIds: string[]): Promise<number> {
  if (!ixcIds.length) return 0;
  let n = 0;
  for (const part of chunks(ixcIds)) {
    const rows = await db().update(schema.payments).set({ status: "expired" })
      .where(and(eq(schema.payments.status, "pending"), inArray(schema.payments.ixcReceivableId, part)))
      .returning({ id: schema.payments.id, customerId: schema.payments.customerId, reference: schema.payments.reference });
    for (const p of rows) {
      await logActivity({
        kind: "payment.cancelled",
        customerId: p.customerId,
        message: `Referência **${refFmt(p.reference)}** anulada: o título foi fechado no IXC`,
        meta: { paymentId: p.id },
      });
    }
    n += rows.length;
  }
  return n;
}
