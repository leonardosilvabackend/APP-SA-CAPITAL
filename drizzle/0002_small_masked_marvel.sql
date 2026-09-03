CREATE TABLE "saved_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_name" varchar(180) NOT NULL,
	"creator_id" uuid NOT NULL,
	"selected_quotas" jsonb NOT NULL,
	"commission_rate" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_quotes" ADD CONSTRAINT "saved_quotes_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_quotes_creator_id_idx" ON "saved_quotes" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "saved_quotes_created_at_idx" ON "saved_quotes" USING btree ("created_at");