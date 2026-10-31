CREATE TABLE "channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ip" text NOT NULL,
	"port" integer NOT NULL,
	"category" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grids" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"draft" jsonb,
	"rev" integer DEFAULT 0 NOT NULL,
	"draft_updated_at" timestamp with time zone,
	"draft_updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "grid_releases" ADD COLUMN "grid_id" integer;--> statement-breakpoint
ALTER TABLE "grid_releases" ADD COLUMN "number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "grid_releases" ADD COLUMN "channel_ids" jsonb;--> statement-breakpoint
ALTER TABLE "grid_releases" ADD COLUMN "published_by" integer;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "grid_id" integer;--> statement-breakpoint
ALTER TABLE "grids" ADD CONSTRAINT "grids_draft_updated_by_users_id_fk" FOREIGN KEY ("draft_updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channels_address_key" ON "channels" USING btree ("ip","port");--> statement-breakpoint
CREATE UNIQUE INDEX "grids_name_key" ON "grids" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "grids_default_key" ON "grids" USING btree ("is_default") WHERE "grids"."is_default";--> statement-breakpoint
ALTER TABLE "grid_releases" ADD CONSTRAINT "grid_releases_grid_id_grids_id_fk" FOREIGN KEY ("grid_id") REFERENCES "public"."grids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grid_releases" ADD CONSTRAINT "grid_releases_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_grid_id_grids_id_fk" FOREIGN KEY ("grid_id") REFERENCES "public"."grids"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "grid_releases_number_key" ON "grid_releases" USING btree ("grid_id","number");