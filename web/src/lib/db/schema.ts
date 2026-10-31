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
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("customers_status_idx").on(t.status),
  index("customers_due_idx").on(t.dueDate),
  index("customers_nif_idx").on(t.nif),
  index("customers_officegest_idx").on(t.officegestId),
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
  createdAt: createdAt(),
}, (t) => [
  index("payments_customer_idx").on(t.customerId),
  index("payments_status_idx").on(t.status),
  index("payments_paid_idx").on(t.paidAt),
  index("payments_issued_idx").on(t.issuedAt),
  index("payments_period_idx").on(t.period),
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
