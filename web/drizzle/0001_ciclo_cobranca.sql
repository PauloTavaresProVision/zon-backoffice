CREATE TABLE "contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"ixc_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"plan_id" integer,
	"ixc_plan_id" text,
	"status" text NOT NULL,
	"internet_status" text,
	"amount_kz" integer,
	"paid_until" date,
	"activated_at" date,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_ixc_id_unique" UNIQUE("ixc_id")
);
--> statement-breakpoint
CREATE TABLE "cycle_preview" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"customer_id" integer,
	"contract_ixc_id" integer,
	"receivable_ixc_id" text,
	"amount_kz" integer,
	"due_date" date,
	"detail" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receivables" (
	"id" serial PRIMARY KEY NOT NULL,
	"ixc_id" text NOT NULL,
	"contract_id" integer,
	"customer_id" integer,
	"amount_kz" integer NOT NULL,
	"due_date" date NOT NULL,
	"status" text NOT NULL,
	"nparcela" integer,
	"raw" jsonb NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receivables_ixc_id_unique" UNIQUE("ixc_id")
);
--> statement-breakpoint
CREATE TABLE "sms_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"payment_id" integer,
	"kind" text NOT NULL,
	"phone" text NOT NULL,
	"body" text NOT NULL,
	"status" text NOT NULL,
	"provider_id" text,
	"error" text,
	"test" boolean DEFAULT false NOT NULL,
	"user_id" integer,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "ixc_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "contract_id" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "ixc_receivable_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "appypay_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "appypay_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "paid_amount_kz" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "ixc_settled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "ixc_settle_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "ixc_settle_error" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "ixc_settle_next_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "ixc_settle_claimed_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "ixc_plan_id" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycle_preview" ADD CONSTRAINT "cycle_preview_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contracts_customer_idx" ON "contracts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "receivables_contract_idx" ON "receivables" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "receivables_due_idx" ON "receivables" USING btree ("due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "sms_payment_kind_key" ON "sms_messages" USING btree ("payment_id","kind") WHERE "sms_messages"."kind" <> 'manual' and "sms_messages"."status" = 'sent';--> statement-breakpoint
CREATE INDEX "sms_customer_idx" ON "sms_messages" USING btree ("customer_id","at");--> statement-breakpoint
CREATE INDEX "sms_at_idx" ON "sms_messages" USING btree ("at");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_receivable_open_key" ON "payments" USING btree ("ixc_receivable_id") WHERE "payments"."status" = 'pending' and "payments"."ixc_receivable_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_appypay_key" ON "payments" USING btree ("appypay_id");--> statement-breakpoint
CREATE INDEX "payments_contract_idx" ON "payments" USING btree ("contract_id");--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_ixc_plan_id_unique" UNIQUE("ixc_plan_id");