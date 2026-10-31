CREATE TABLE "box_challenges" (
	"nonce" text PRIMARY KEY NOT NULL,
	"serial" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "box_enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"serial" text NOT NULL,
	"public_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"model" text,
	"serial_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boxes" (
	"id" serial PRIMARY KEY NOT NULL,
	"serial" text NOT NULL,
	"customer_id" integer,
	"public_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"model" text,
	"serial_source" text,
	"blocked_at" timestamp with time zone,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" integer,
	"app_version" text,
	"os_version" text,
	"grid_version" integer,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boxes_serial_unique" UNIQUE("serial"),
	CONSTRAINT "boxes_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE "grid_releases" (
	"version" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"channels" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "boxes" ADD CONSTRAINT "boxes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boxes" ADD CONSTRAINT "boxes_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "box_challenges_expires_idx" ON "box_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "box_enrollments_key" ON "box_enrollments" USING btree ("serial","fingerprint");--> statement-breakpoint
CREATE INDEX "box_enrollments_seen_idx" ON "box_enrollments" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "boxes_customer_idx" ON "boxes" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "boxes_seen_idx" ON "boxes" USING btree ("last_seen_at");