CREATE TABLE "appypay_tests" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"reference" text NOT NULL,
	"amount_kz" integer NOT NULL,
	"appypay_id" text,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"notice_count" integer DEFAULT 0 NOT NULL,
	"last_notice_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"paid_amount_kz" integer,
	"confirmed_by" text,
	"checked_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appypay_tests_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "appypay_tests" ADD CONSTRAINT "appypay_tests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appypay_tests_appypay_key" ON "appypay_tests" USING btree ("appypay_id");--> statement-breakpoint
CREATE INDEX "appypay_tests_status_idx" ON "appypay_tests" USING btree ("status");