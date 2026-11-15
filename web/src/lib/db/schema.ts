import { sql } from "drizzle-orm";
import {
  boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, serial, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("role", ["admin", "operador", "consulta"]);
export const customerStatusEnum = pgEnum("customer_status", ["active", "late", "inactive"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "paid", "expired"]);
export const smsStatusEnum = pgEnum("sms_status", ["none", "sent", "failed"]);
export const invoiceOriginEnum = pgEnum("invoice_origin", ["backoffice", "officegest"]);

/* ---------- Acesso ---------- */

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull().default("operador"),
  passwordHash: text("password_hash").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
}, (t) => [uniqueIndex("users_email_key").on(sql`lower(${t.email})`)]);

// O id é o SHA-256 do token do cookie: uma fuga da base de dados não dá sessões válidas.
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  ip: text("ip"),
  userAgent: text("user_agent"),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

/* ---------- Serviço ---------- */

export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // internet | tv | internet_tv
  priceKz: integer("price_kz").notNull(),
  speedMbps: integer("speed_mbps"),
  channels: integer("channels"),
  active: boolean("active").notNull().default(true),
  // Plano (modelo de contrato) correspondente no IXC
  ixcPlanId: text("ixc_plan_id").unique(),
  // Grelha de canais que as boxes dos clientes deste plano recebem; sem grelha, recebem a predefinida
  gridId: integer("grid_id").references(() => grids.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  ixcId: integer("ixc_id").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  nif: text("nif"),
  zone: text("zone"),
  city: text("city").notNull().default("Luanda"),
  planId: integer("plan_id").references(() => plans.id),
  status: customerStatusEnum("status").notNull().default("active"),
  dueDate: date("due_date", { mode: "string" }),
  since: date("since", { mode: "string" }),
  lastPaymentAt: timestamp("last_payment_at", { withTimezone: true }),
  // Id do cliente no OfficeGest. Pode repetir-se se o IXC tiver dois clientes com o mesmo NIF.
  officegestId: integer("officegest_id"),
  officegestCheckedAt: timestamp("officegest_checked_at", { withTimezone: true }),
  // Desativado à mão no backoffice: sem referências nem SMS, e a sincronização do IXC não o reativa
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  ixcSyncedAt: timestamp("ixc_synced_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("customers_status_idx").on(t.status),
  index("customers_due_idx").on(t.dueDate),
  index("customers_nif_idx").on(t.nif),
  index("customers_officegest_idx").on(t.officegestId),
]);

/* ---------- Contratos (IXC) ---------- */

// Um cliente do IXC pode ter vários contratos; cada um é cobrado à parte.
export const contracts = pgTable("contracts", {
  id: serial("id").primaryKey(),
  ixcId: integer("ixc_id").notNull().unique(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  planId: integer("plan_id").references(() => plans.id),
  ixcPlanId: text("ixc_plan_id"),
  // Estados tal como vêm do IXC (ex.: A ativo, I inativo; internet A, CA/CM bloqueado, FA atraso)
  status: text("status").notNull(),
  internetStatus: text("internet_status"),
  amountKz: integer("amount_kz"),
  paidUntil: date("paid_until", { mode: "string" }),
  activatedAt: date("activated_at", { mode: "string" }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
}, (t) => [index("contracts_customer_idx").on(t.customerId)]);

// Títulos (fn_areceber) do IXC por pagar. Guarda-se o registo original, preciso para dar baixa.
export const receivables = pgTable("receivables", {
  id: serial("id").primaryKey(),
  ixcId: text("ixc_id").notNull().unique(),
  contractId: integer("contract_id").references(() => contracts.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  amountKz: integer("amount_kz").notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  // A = em aberto; quando deixa de vir aberto na sincronização fica com closedAt
  status: text("status").notNull(),
  nparcela: integer("nparcela"),
  raw: jsonb("raw").$type<Record<string, string>>().notNull(),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index("receivables_contract_idx").on(t.contractId),
  index("receivables_due_idx").on(t.dueDate),
]);

/* ---------- Pagamentos (referências Multicaixa) ---------- */

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  entity: text("entity").notNull().default("11700"),
  reference: text("reference").notNull().unique(),
  amountKz: integer("amount_kz").notNull(),
  period: date("period", { mode: "string" }).notNull(), // 1.º dia do mês a que respeita
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  status: paymentStatusEnum("status").notNull().default("pending"),
  sms: smsStatusEnum("sms").notNull().default("none"),
  // Emissão da fatura-recibo no OfficeGest: tentativas e reserva contra duplicados
  invoiceAttempts: integer("invoice_attempts").notNull().default(0),
  invoiceError: text("invoice_error"),
  invoiceNextAttemptAt: timestamp("invoice_next_attempt_at", { withTimezone: true }),
  invoiceClaimedUntil: timestamp("invoice_claimed_until", { withTimezone: true }),
  // Ligação ao ciclo de cobrança: contrato e título (fn_areceber) do IXC, pagamento na AppyPay
  contractId: integer("contract_id").references(() => contracts.id),
  ixcReceivableId: text("ixc_receivable_id"),
  appypayId: text("appypay_id"),
  appypayCheckedAt: timestamp("appypay_checked_at", { withTimezone: true }),
  paidAmountKz: integer("paid_amount_kz"),
  // Baixa do título no IXC depois do pagamento: tentativas e reserva, como na emissão de faturas
  ixcSettledAt: timestamp("ixc_settled_at", { withTimezone: true }),
  ixcSettleAttempts: integer("ixc_settle_attempts").notNull().default(0),
  ixcSettleError: text("ixc_settle_error"),
  ixcSettleNextAt: timestamp("ixc_settle_next_at", { withTimezone: true }),
  ixcSettleClaimedUntil: timestamp("ixc_settle_claimed_until", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  // Um título do IXC só pode ter uma referência por pagar (uma expirada ainda pode ser paga: ver cycle/confirm.ts)
  uniqueIndex("payments_receivable_open_key").on(t.ixcReceivableId).where(sql`${t.status} = 'pending' and ${t.ixcReceivableId} is not null`),
  uniqueIndex("payments_appypay_key").on(t.appypayId),
  index("payments_contract_idx").on(t.contractId),
  index("payments_customer_idx").on(t.customerId),
  index("payments_status_idx").on(t.status),
  index("payments_paid_idx").on(t.paidAt),
  index("payments_issued_idx").on(t.issuedAt),
  index("payments_period_idx").on(t.period),
]);

/* ---------- Referências de teste da AppyPay ---------- */

// Valor pequeno, sem cliente: serve para pagar no Multicaixa e ver chegar a notificação da AppyPay.
// Fora de `payments` de propósito: não conta na cobrança, não dá baixas no IXC nem emite faturas.
export const appypayTests = pgTable("appypay_tests", {
  id: serial("id").primaryKey(),
  entity: text("entity").notNull(),
  reference: text("reference").notNull().unique(),
  amountKz: integer("amount_kz").notNull(),
  appypayId: text("appypay_id"),
  status: paymentStatusEnum("status").notNull().default("pending"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  // Notificações da AppyPay recebidas para esta referência (o webhook)
  noticeCount: integer("notice_count").notNull().default(0),
  lastNoticeAt: timestamp("last_notice_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  paidAmountKz: integer("paid_amount_kz"),
  // "webhook" ou "verificacao" (a verificação periódica)
  confirmedBy: text("confirmed_by"),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("appypay_tests_appypay_key").on(t.appypayId),
  index("appypay_tests_status_idx").on(t.status),
]);

/* ---------- Faturas (documentos do OfficeGest) ---------- */

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  paymentId: integer("payment_id").unique().references(() => payments.id),
  ogType: text("og_type").notNull(), // tipo usado na API (fr, ft, nc…)
  ogNumber: text("og_number").notNull(), // número interno do documento
  documentNumber: text("document_number").notNull(), // como aparece no documento
  date: date("date", { mode: "string" }).notNull(),
  total: numeric("total", { precision: 14, scale: 2, mode: "number" }).notNull(),
  paidValue: numeric("paid_value", { precision: 14, scale: 2, mode: "number" }),
  state: text("state"),
  cancelled: boolean("cancelled").notNull().default(false),
  description: text("description"),
  origin: invoiceOriginEnum("origin").notNull(),
  pdfPath: text("pdf_path"),
  pdfFetchedAt: timestamp("pdf_fetched_at", { withTimezone: true }),
  ogAlteredAt: text("og_altered_at"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("invoices_og_key").on(t.ogType, t.ogNumber),
  index("invoices_customer_idx").on(t.customerId),
  index("invoices_date_idx").on(t.date),
]);

/* ---------- SMS ---------- */

export const smsMessages = pgTable("sms_messages", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  paymentId: integer("payment_id").references(() => payments.id),
  kind: text("kind").notNull(), // stage_7 | stage_3 | stage_1 | paid | manual
  phone: text("phone").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull(), // sent | failed
  providerId: text("provider_id"),
  error: text("error"),
  // Enviado para o número de testes em vez do cliente
  test: boolean("test").notNull().default(false),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Cada aviso automático sai uma só vez por referência
  uniqueIndex("sms_payment_kind_key").on(t.paymentId, t.kind).where(sql`${t.kind} <> 'manual' and ${t.status} = 'sent'`),
  index("sms_customer_idx").on(t.customerId, t.at),
  index("sms_at_idx").on(t.at),
]);

/* ---------- Boxes (app ZON TV) ---------- */

// Box aprovada. O serial é só a etiqueta; quem prova a identidade é a chave RSA gerada na box (fingerprint = SHA-256 da chave).
export const boxes = pgTable("boxes", {
  id: serial("id").primaryKey(),
  serial: text("serial").notNull().unique(),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  publicKey: text("public_key").notNull(),
  fingerprint: text("fingerprint").notNull().unique(),
  model: text("model"),
  serialSource: text("serial_source"), // android | label
  blockedAt: timestamp("blocked_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
  approvedBy: integer("approved_by").references(() => users.id, { onDelete: "set null" }),
  // O que a box diz de si em cada sincronização
  appVersion: text("app_version"),
  osVersion: text("os_version"),
  gridVersion: integer("grid_version"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("boxes_customer_idx").on(t.customerId), index("boxes_seen_idx").on(t.lastSeenAt)]);

// Pedidos de ativação feitos pela box, à espera de aprovação no backoffice.
export const boxEnrollments = pgTable("box_enrollments", {
  id: serial("id").primaryKey(),
  serial: text("serial").notNull(),
  publicKey: text("public_key").notNull(),
  fingerprint: text("fingerprint").notNull(),
  model: text("model"),
  serialSource: text("serial_source"),
  createdAt: createdAt(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("box_enrollments_key").on(t.serial, t.fingerprint), index("box_enrollments_seen_idx").on(t.lastSeenAt)]);

// Desafios de uma só utilização (60 s) para a box assinar na sincronização.
export const boxChallenges = pgTable("box_challenges", {
  nonce: text("nonce").primaryKey(),
  serial: text("serial").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [index("box_challenges_expires_idx").on(t.expiresAt)]);

/* ---------- Canais e grelhas ---------- */

// Catálogo de canais do headend. A box sintoniza pelo endereço multicast e porta; o número vem da grelha.
export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ip: text("ip").notNull(),
  port: integer("port").notNull(),
  category: text("category").notNull(),
  // Inativo: deixa de aparecer na biblioteca do editor. Só se desativa fora de todas as grelhas.
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("channels_address_key").on(t.ip, t.port)]);

// Grelha de canais (lineup). O rascunho só existe enquanto houver alterações por publicar.
export const grids = pgTable("grids", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // A grelha das boxes cujo plano não tem grelha escolhida
  isDefault: boolean("is_default").notNull().default(false),
  // Ids do catálogo pela ordem da TV: o canal na posição 1 é o canal 1 na box
  draft: jsonb("draft").$type<number[]>(),
  // Sobe a cada gravação, para duas pessoas não gravarem por cima uma da outra
  rev: integer("rev").notNull().default(0),
  draftUpdatedAt: timestamp("draft_updated_at", { withTimezone: true }),
  draftUpdatedBy: integer("draft_updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("grids_name_key").on(sql`lower(${t.name})`),
  uniqueIndex("grids_default_key").on(t.isDefault).where(sql`${t.isDefault}`),
]);

// Versões publicadas. São fotografias: editar o catálogo depois não muda o que já foi publicado.
export const gridReleases = pgTable("grid_releases", {
  // Número global que a box guarda e devolve na sincronização
  version: serial("version").primaryKey(),
  gridId: integer("grid_id").references(() => grids.id, { onDelete: "cascade" }),
  // Versão dentro da grelha (v1, v2…), a que se mostra no backoffice
  number: integer("number").notNull().default(1),
  name: text("name").notNull(),
  channels: jsonb("channels").$type<GridChannel[]>().notNull(),
  // Ids do catálogo, alinhados com channels, para comparar com o rascunho
  channelIds: jsonb("channel_ids").$type<number[]>(),
  publishedBy: integer("published_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("grid_releases_number_key").on(t.gridId, t.number)]);

export type GridChannel = { number: number; name: string; ip: string; port: number; category: string };

/* ---------- Simulação do ciclo ---------- */

// O que o ciclo faria, em modo simulação. Cada execução substitui a anterior.
export const cyclePreview = pgTable("cycle_preview", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // reference | sms | settle | skip
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  contractIxcId: integer("contract_ixc_id"),
  receivableIxcId: text("receivable_ixc_id"),
  amountKz: integer("amount_kz"),
  dueDate: date("due_date", { mode: "string" }),
  detail: text("detail").notNull(),
  createdAt: createdAt(),
});

/* ---------- Histórico, agendamentos e estado ---------- */

export const activity = pgTable("activity", {
  id: serial("id").primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  message: text("message").notNull(), // **texto** fica a negrito
  meta: jsonb("meta"),
}, (t) => [
  index("activity_customer_idx").on(t.customerId, t.at),
  index("activity_at_idx").on(t.at),
]);

export const jobRuns = pgTable("job_runs", {
  id: serial("id").primaryKey(),
  job: text("job").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ok: boolean("ok"),
  summary: text("summary"),
}, (t) => [index("job_runs_job_idx").on(t.job, t.startedAt)]);

export const kv = pgTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Role = User["role"];
export type Customer = typeof customers.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Contract = typeof contracts.$inferSelect;
export type Receivable = typeof receivables.$inferSelect;
export type SmsMessage = typeof smsMessages.$inferSelect;
export type Box = typeof boxes.$inferSelect;
export type BoxEnrollment = typeof boxEnrollments.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type GridRow = typeof grids.$inferSelect;
export type GridRelease = typeof gridReleases.$inferSelect;
