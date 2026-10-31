CREATE TYPE "public"."customer_status" AS ENUM('active', 'late', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."invoice_origin" AS ENUM('backoffice', 'officegest');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'expired');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'operador', 'consulta');--> statement-breakpoint
CREATE TYPE "public"."sms_status" AS ENUM('none', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer,
	"customer_id" integer,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"ixc_id" integer NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"nif" text,
	"zone" text,
	"city" text DEFAULT 'Luanda' NOT NULL,
	"plan_id" integer,
	"status" "customer_status" DEFAULT 'active' NOT NULL,
	"due_date" date,
	"since" date,
	"last_payment_at" timestamp with time zone,
	"officegest_id" integer,
	"officegest_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_ixc_id_unique" UNIQUE("ixc_id")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"payment_id" integer,
	"og_type" text NOT NULL,
	"og_number" text NOT NULL,
	"document_number" text NOT NULL,
	"date" date NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"paid_value" numeric(14, 2),
	"state" text,
	"cancelled" boolean DEFAULT false NOT NULL,
	"description" text,
	"origin" "invoice_origin" NOT NULL,
	"pdf_path" text,
	"pdf_fetched_at" timestamp with time zone,
	"og_altered_at" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_payment_id_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"summary" text
);
--> statement-breakpoint
CREATE TABLE "kv" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"entity" text DEFAULT '11700' NOT NULL,
	"reference" text NOT NULL,
	"amount_kz" integer NOT NULL,
	"period" date NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"due_date" date NOT NULL,
	"paid_at" timestamp with time zone,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"sms" "sms_status" DEFAULT 'none' NOT NULL,
	"invoice_attempts" integer DEFAULT 0 NOT NULL,
	"invoice_error" text,
	"invoice_next_attempt_at" timestamp with time zone,
	"invoice_claimed_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"price_kz" integer NOT NULL,
	"speed_mbps" integer,
	"channels" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" DEFAULT 'operador' NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_customer_idx" ON "activity" USING btree ("customer_id","at");--> statement-breakpoint
CREATE INDEX "activity_at_idx" ON "activity" USING btree ("at");--> statement-breakpoint
CREATE INDEX "customers_status_idx" ON "customers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "customers_due_idx" ON "customers" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "customers_nif_idx" ON "customers" USING btree ("nif");--> statement-breakpoint
CREATE INDEX "customers_officegest_idx" ON "customers" USING btree ("officegest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_og_key" ON "invoices" USING btree ("og_type","og_number");--> statement-breakpoint
CREATE INDEX "invoices_customer_idx" ON "invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "invoices_date_idx" ON "invoices" USING btree ("date");--> statement-breakpoint
CREATE INDEX "job_runs_job_idx" ON "job_runs" USING btree ("job","started_at");--> statement-breakpoint
CREATE INDEX "payments_customer_idx" ON "payments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_paid_idx" ON "payments" USING btree ("paid_at");--> statement-breakpoint
CREATE INDEX "payments_issued_idx" ON "payments" USING btree ("issued_at");--> statement-breakpoint
CREATE INDEX "payments_period_idx" ON "payments" USING btree ("period");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree (lower("email"));