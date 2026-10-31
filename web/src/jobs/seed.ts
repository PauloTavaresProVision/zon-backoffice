// Dados de demonstração para desenvolvimento. Só corre com SEED_DEMO=true: preenche a base de dados se estiver
// vazia e o IXC/AppyPay simulados se estiverem vazios. Todos os nomes, contactos e NIF são fictícios.
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, pool, schema } from "@/lib/db";
import type { Payment } from "@/lib/db/schema";
import { addDays, isoDay, kz, monthLabel, refFmt } from "@/lib/format";

const log = (msg: string) => console.log(`[seed] ${msg}`);

// Gerador determinístico: a mesma semente dá sempre os mesmos dados
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261031);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));

// ixcPlanId: o modelo de contrato correspondente no IXC simulado
const PLANS = [
  { code: "f20", name: "ZON Fibra 20", kind: "internet", priceKz: 7500, speedMbps: 20, channels: null, ixcPlanId: "21" },
  { code: "f50e", name: "ZON Fibra 50 + TV Essencial", kind: "internet_tv", priceKz: 9900, speedMbps: 50, channels: 64, ixcPlanId: "22" },
  { code: "f50t", name: "ZON Fibra 50 + TV Total", kind: "internet_tv", priceKz: 12500, speedMbps: 50, channels: 112, ixcPlanId: "23" },
  { code: "f100p", name: "ZON Fibra 100 + TV Premium", kind: "internet_tv", priceKz: 19900, speedMbps: 100, channels: 185, ixcPlanId: "24" },
  { code: "tvt", name: "ZON TV Total", kind: "tv", priceKz: 5500, speedMbps: null, channels: 112, ixcPlanId: "25" },
] as const;
const PLAN_WEIGHTS = ["f20", "f20", "f50e", "f50e", "f50e", "f50t", "f50t", "f50t", "f100p", "tvt"] as const;

type Status = "active" | "late" | "inactive";
type SeedCustomer = { ixcId: number; name: string; phone: string; email: string | null; nif: string | null; zone: string; plan: string; status: Status; since: string };

const KNOWN: SeedCustomer[] = [
  { ixcId: 10432, name: "Ana Paula Domingos", phone: "923418552", email: "ana.domingos@correio.ao", nif: "004512873LA041", zone: "Talatona", plan: "f50t", status: "active", since: "2024-03-12" },
  { ixcId: 10418, name: "Mário Kiala", phone: "912774019", email: "mkiala@correio.ao", nif: "003318902LA036", zone: "Kilamba", plan: "f100p", status: "active", since: "2023-11-04" },
  { ixcId: 10377, name: "Esperança Neto", phone: "934220871", email: "esperanca.neto@correio.ao", nif: "006129774LA048", zone: "Maianga", plan: "f50e", status: "late", since: "2025-01-19" },
  { ixcId: 10361, name: "Joaquim Mbala", phone: "926501338", email: null, nif: null, zone: "Viana", plan: "f20", status: "active", since: "2022-08-30" },
  { ixcId: 10355, name: "Teresa Lukeny", phone: "917662405", email: "teresa.lukeny@correio.ao", nif: "005501239LA044", zone: "Ingombota", plan: "tvt", status: "inactive", since: "2024-06-02" },
  { ixcId: 10349, name: "Adilson Cassoma", phone: "929113760", email: "adilson.c@correio.ao", nif: "007734120LA051", zone: "Talatona", plan: "f50t", status: "active", since: "2025-04-11" },
  { ixcId: 10333, name: "Helena Bumba", phone: "931870224", email: "helena.bumba@correio.ao", nif: null, zone: "Camama", plan: "f50e", status: "late", since: "2024-12-07" },
  { ixcId: 10321, name: "Nelson Tchipa", phone: "914335908", email: "ntchipa@correio.ao", nif: "001982337LA033", zone: "Benfica", plan: "f100p", status: "active", since: "2023-02-15" },
  { ixcId: 10308, name: "Rosa Kalunga", phone: "925640117", email: "rosa.kalunga@correio.ao", nif: "006670418LA047", zone: "Cazenga", plan: "f50e", status: "active", since: "2025-07-22" },
  { ixcId: 10296, name: "Domingos Sebastião", phone: "918207663", email: null, nif: null, zone: "Kilamba", plan: "f20", status: "inactive", since: "2022-03-09" },
  { ixcId: 10284, name: "Luzia Cambuta", phone: "933498052", email: "luzia.cambuta@correio.ao", nif: "005218760LA043", zone: "Morro Bento", plan: "f50t", status: "active", since: "2024-09-18" },
  { ixcId: 10271, name: "Edson Mavinga", phone: "927715390", email: "edson.mavinga@correio.ao", nif: null, zone: "Viana", plan: "tvt", status: "active", since: "2025-09-03" },
  { ixcId: 10265, name: "Filomena Kapinga", phone: "916052744", email: "filomena.k@correio.ao", nif: "002594431LA038", zone: "Talatona", plan: "f50e", status: "active", since: "2023-06-27" },
  { ixcId: 10250, name: "Bruno Ngola", phone: "935381670", email: "bruno.ngola@correio.ao", nif: "004407652LA042", zone: "Maianga", plan: "f100p", status: "late", since: "2024-02-10" },
  { ixcId: 10243, name: "Celestina Paím", phone: "921994263", email: "celestina.paim@correio.ao", nif: "006831095LA049", zone: "Benfica", plan: "f50t", status: "active", since: "2025-05-14" },
  { ixcId: 10231, name: "Victor Quissanga", phone: "913586471", email: null, nif: "001556380LA032", zone: "Cazenga", plan: "f20", status: "active", since: "2022-10-21" },
];

const FIRST = ["Abel", "Albertina", "Amélia", "António", "Augusto", "Beatriz", "Carlos", "Catarina", "Cláudio", "Delfina", "Djamila", "Eduardo", "Elsa", "Evaristo", "Fátima", "Feliciano", "Gaspar", "Graciete", "Hélder", "Inês", "Isabel", "Jacinto", "Jéssica", "Josefa", "Leonel", "Lurdes", "Manuel", "Marcelina", "Miguel", "Nádia", "Osvaldo", "Paulina", "Pedro", "Quintino", "Rui", "Sandra", "Sílvio", "Tânia", "Valter", "Yolanda", "Zacarias"];
const LAST = ["Cassule", "Chipenda", "Dala", "Fortunato", "Gonga", "Jamba", "Kanda", "Kiluanje", "Lussati", "Mabiala", "Manuel", "Muondo", "Ndala", "Nzinga", "Pascoal", "Samuel", "Sapalo", "Tavares", "Tchissola", "Uanga", "Vunge", "Zua"];
const ZONES = ["Talatona", "Kilamba", "Viana", "Maianga", "Cazenga", "Benfica", "Camama", "Ingombota", "Morro Bento", "Rangel", "Alvalade", "Patriota"];

function generated(n: number): SeedCustomer[] {
  const out: SeedCustomer[] = [];
  const used = new Set(KNOWN.map((c) => c.name));
  let ixc = 10229;
  while (out.length < n) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    if (used.has(name)) continue;
    used.add(name);
    ixc -= between(3, 17);
    const r = rand();
    const status: Status = r < 0.8 ? "active" : r < 0.9 ? "late" : "inactive";
    const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/, ".").replace(/\s+/g, "");
    out.push({
      ixcId: ixc,
      name,
      phone: `9${pick(["1", "2", "3"])}${between(1000000, 9999999)}`,
      email: rand() < 0.7 ? `${slug}@correio.ao` : null,
      nif: rand() < 0.6 ? `00${between(1000000, 9999999)}LA0${between(30, 52)}` : null,
      zone: pick(ZONES),
      plan: pick(PLAN_WEIGHTS),
      status,
      since: `${between(2022, 2026)}-${String(between(1, 12)).padStart(2, "0")}-${String(between(1, 28)).padStart(2, "0")}`,
    });
  }
  return out.map((c) => (c.since > isoDay() ? { ...c, since: "2025-12-01" } : c));
}

const firstOfMonth = (iso: string, back: number) => {
  const y = +iso.slice(0, 4);
  const m = +iso.slice(5, 7) - 1 - back;
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 10);
};
const at = (iso: string, hour: number) => new Date(`${iso}T${String(hour).padStart(2, "0")}:${String(between(0, 59)).padStart(2, "0")}:00+01:00`);

type MockDoc = { type: string; date: string; total: number; description: string; state?: string };

async function seedOfficegestMock(rows: { name: string; nif: string; phone: string; since: string }[], failNifs: string[]): Promise<void> {
  const base = process.env.OFFICEGEST_URL?.replace(/\/api\/?$/, "");
  if (!base) return;
  const customers = rows.map((c, i) => {
    const docs: MockDoc[] = [{ type: "ft", date: c.since, total: 15000, description: "Instalação e ativação do serviço" }];
    if (i === 2) docs.push({ type: "nc", date: addDays(isoDay(), -12), total: 2500, description: "Acerto de mensalidade (dias sem serviço)" });
    if (i === 5) docs.push({ type: "ft", date: addDays(c.since, 30), total: 8000, description: "Mudança de equipamento", state: "ANU" });
    return { name: c.name, nif: c.nif, phone: c.phone, docs };
  });
  await callMock(`${base}/__dev/seed`, { customers, fail: failNifs.map((nif) => ({ nif, times: 3 })) }, "OfficeGest simulado");
  log(`OfficeGest simulado: ${customers.length} clientes com faturas de instalação`);
}

type IxcRow = Record<string, string>;
type AppyPaySeed = { id: string; reference: string; amount: number; startDate: string; expirationDate: string };

const nextMonth = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
};

/** Pedido a um simulador, que pode ainda estar a arrancar. */
async function callMock(url: string, body: unknown, what: string): Promise<unknown> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`respondeu ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i >= 30) throw new Error(`${what} indisponível: ${err instanceof Error ? err.message : err}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

/** Planos, clientes e seis meses de referências. */
async function seedDatabase(): Promise<void> {
  const today = isoDay();
  const people = [...KNOWN, ...generated(64)];
  // Primeiro o OfficeGest simulado: se falhar, a base de dados fica vazia e o próximo arranque tenta outra vez
  if (process.env.SEED_OFFICEGEST_MOCK === "true") {
    const withNif = people.filter((c): c is SeedCustomer & { nif: string } => !!c.nif)
      .map((c) => ({ name: c.name, nif: c.nif, phone: c.phone, since: c.since }));
    await seedOfficegestMock(withNif, ["006831095LA049", "005218760LA043"]);
  }
  const plans = await db().insert(schema.plans).values(PLANS.map((p) => ({ ...p }))).returning();
  const planByCode = new Map(plans.map((p) => [p.code, p]));
  let seq = 0;
  let paymentCount = 0;

  for (const c of people) {
    const plan = planByCode.get(c.plan)!;
    const dueDay = 1 + (c.ixcId % 27);
    type P = typeof schema.payments.$inferInsert;
    const pays: P[] = [];
    for (let back = 6; back >= 0; back--) {
      const period = firstOfMonth(today, back);
      const due = `${period.slice(0, 8)}${String(dueDay).padStart(2, "0")}`;
      const issued = addDays(due, -7);
      if (issued > today || due < c.since) continue;
      seq += 1;
      pays.push({
        customerId: 0,
        reference: String(932_100_000 + seq * 7),
        amountKz: plan.priceKz,
        period,
        issuedAt: at(issued, 8),
        dueDate: due,
        status: "pending",
        sms: rand() < 0.96 ? "sent" : "failed",
      });
    }
    // Estado de cada referência conforme o estado do cliente
    const past = pays.filter((p) => p.dueDate < today);
    const current = pays.filter((p) => p.dueDate >= today);
    const unpaidPast = c.status === "late" ? 1 : c.status === "inactive" ? 2 : 0;
    past.forEach((p, i) => {
      if (i >= past.length - unpaidPast) { p.status = "expired"; return; }
      const paid = addDays(p.dueDate, -between(0, 6));
      p.status = "paid";
      p.paidAt = at(paid < today ? paid : today, between(8, 20));
    });
    for (const p of current) {
      if (c.status === "inactive") { p.status = "expired"; continue; }
      if (c.status === "active" && rand() < 0.35) {
        p.status = "paid";
        p.paidAt = at(addDays(today, -between(0, 1)), between(8, 11));
      }
    }
    const firstUnpaid = pays.find((p) => p.status !== "paid");
    const lastPaid = [...pays].reverse().find((p) => p.status === "paid");
    const validity = firstUnpaid?.dueDate ?? (lastPaid ? addDays(lastPaid.dueDate, 30) : addDays(today, 10));

    const [cust] = await db().insert(schema.customers).values({
      ixcId: c.ixcId, name: c.name, phone: c.phone, email: c.email, nif: c.nif, zone: c.zone,
      planId: plan.id, status: c.status, dueDate: validity, since: c.since,
      lastPaymentAt: lastPaid?.paidAt ?? null,
    }).returning({ id: schema.customers.id });
    const customerId = cust!.id;
    if (pays.length) await db().insert(schema.payments).values(pays.map((p) => ({ ...p, customerId })));
    paymentCount += pays.length;

    const acts: (typeof schema.activity.$inferInsert)[] = [
      { at: at(c.since, 10), customerId, kind: "ixc.import", message: "Cliente integrado do IXC" },
    ];
    for (const p of pays.slice(-3)) {
      if (p.sms === "sent") acts.push({ at: new Date(p.issuedAt.getTime() + 60_000), customerId, kind: "sms.sent", message: `SMS com a referência **${refFmt(p.reference)}** entregue` });
      if (p.paidAt) acts.push({ at: p.paidAt, customerId, kind: "payment.paid", message: `Pagamento de **${kz(p.amountKz)}** confirmado (${monthLabel(p.period.slice(0, 7))})` });
    }
    await db().insert(schema.activity).values(acts);
  }
  log(`${plans.length} planos, ${people.length} clientes e ${paymentCount} referências criados`);
}

/**
 * Os mesmos clientes no IXC simulado: um contrato cada e os títulos ainda por pagar (até 30 dias em atraso),
 * ou o do mês seguinte para quem tem tudo pago. As referências por pagar ficam também na AppyPay simulada.
 * Só corre com o simulador vazio; os ids dos títulos são fixos, por isso repetir dá o mesmo resultado.
 */
async function seedIntegrationsMock(): Promise<void> {
  const mocks = process.env.DEV_MOCKS_URL?.replace(/\/+$/, "");
  if (process.env.SEED_INTEGRATIONS_MOCK !== "true" || !mocks) return;
  const state = (await callMock(`${mocks}/__dev/state`, undefined, "IXC simulado")) as { ixc?: { clientes?: number } };
  if ((state.ixc?.clientes ?? 0) > 0) {
    log("IXC simulado já tem dados; nada a fazer");
    return;
  }
  const today = isoDay();
  for (const p of PLANS) {
    await db().update(schema.plans).set({ ixcPlanId: p.ixcPlanId }).where(and(eq(schema.plans.code, p.code), isNull(schema.plans.ixcPlanId)));
  }
  const plans = new Map((await db().select().from(schema.plans)).map((p) => [p.id, p]));
  const customers = await db().select().from(schema.customers).orderBy(schema.customers.id);
  const byCustomer = new Map<number, Payment[]>();
  for (const p of await db().select().from(schema.payments).orderBy(schema.payments.dueDate, schema.payments.id)) {
    byCustomer.set(p.customerId, [...(byCustomer.get(p.customerId) ?? []), p]);
  }

  const ixc: Record<"cliente" | "cliente_contrato" | "fn_areceber", IxcRow[]> = { cliente: [], cliente_contrato: [], fn_areceber: [] };
  const appypay: AppyPaySeed[] = [];
  for (const c of customers) {
    const plan = c.planId ? plans.get(c.planId) : undefined;
    if (!plan?.ixcPlanId) continue;
    const mine = byCustomer.get(c.id) ?? [];
    const inactive = c.status === "inactive" || !!c.disabledAt;
    const lastPaid = [...mine].reverse().find((p) => p.status === "paid");
    const contractId = String(c.ixcId + 60_000);
    ixc.cliente.push({
      id: String(c.ixcId), razao: c.name, telefone_celular: c.phone ?? "", email: c.email ?? "", cnpj_cpf: c.nif ?? "",
      bairro: c.zone ?? "", data_cadastro: c.since ?? "", ativo: "S",
    });
    ixc.cliente_contrato.push({
      id: contractId, id_cliente: String(c.ixcId), id_vd_contrato: plan.ixcPlanId, contrato: plan.name,
      status: inactive ? "I" : "A", status_internet: c.status === "late" ? "FA" : inactive ? "D" : "A",
      pago_ate_data: lastPaid ? addDays(lastPaid.dueDate, 30) : "", data_ativacao: c.since ?? "",
    });
    if (inactive) continue;

    const receivable = (id: string, due: string, n: number) => {
      const valor = plan.priceKz.toFixed(2);
      ixc.fn_areceber.push({
        id, id_cliente: String(c.ixcId), id_contrato: contractId, data_vencimento: due, valor, valor_aberto: valor, status: "A",
        nparcela: String(n), filial_id: "1", id_carteira_cobranca: "1", id_conta: "1", previsao: "N", tipo_recebimento: "Boleto",
      });
    };
    for (const [i, p] of mine.entries()) {
      if (p.status === "paid" || p.dueDate < addDays(today, -30)) continue;
      const id = p.ixcReceivableId ?? String(500_000 + p.id);
      receivable(id, p.dueDate, i + 1);
      if (p.status !== "pending") continue;
      // Referência já emitida: fica ligada ao título e registada na AppyPay simulada
      const appypayId = p.appypayId ?? randomUUID();
      if (!p.ixcReceivableId || !p.appypayId) {
        await db().update(schema.payments).set({ ixcReceivableId: id, appypayId }).where(eq(schema.payments.id, p.id));
      }
      appypay.push({ id: appypayId, reference: p.reference, amount: p.amountKz, startDate: p.issuedAt.toISOString(), expirationDate: `${addDays(p.dueDate, 3)}T22:59:59Z` });
    }
    const last = mine.at(-1);
    if (!last || last.status === "paid") receivable(String(800_000 + c.id), last ? nextMonth(last.dueDate) : addDays(today, 5), mine.length + 1);
  }
  await callMock(`${mocks}/__dev/seed`, { ixc, appypay }, "IXC/AppyPay simulados");
  log(`IXC simulado: ${ixc.cliente.length} clientes, ${ixc.fn_areceber.length} títulos em aberto · AppyPay: ${appypay.length} referências`);
}

async function main(): Promise<void> {
  if (process.env.SEED_DEMO !== "true") return;
  const [{ n } = { n: 0 }] = await db().select({ n: sql<number>`count(*)::int` }).from(schema.customers);
  if (n > 0) log("já há clientes na base de dados");
  else await seedDatabase();
  await seedIntegrationsMock();
}

main()
  .then(() => pool().end())
  .catch(async (err) => {
    console.error("[seed] falhou:", err);
    await pool().end().catch(() => undefined);
    process.exit(1);
  });
