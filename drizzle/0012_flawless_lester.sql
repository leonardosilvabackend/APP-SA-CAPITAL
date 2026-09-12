CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid,
	"audience_role" varchar(30),
	"title" varchar(180) NOT NULL,
	"message" text NOT NULL,
	"link" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_quotes" ADD COLUMN "opportunity_reason" text;--> statement-breakpoint
ALTER TABLE "saved_quotes" ADD COLUMN "opportunity_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_recipient_expiry_idx" ON "notifications" USING btree ("recipient_id","expires_at");--> statement-breakpoint
CREATE INDEX "notifications_role_expiry_idx" ON "notifications" USING btree ("audience_role","expires_at");