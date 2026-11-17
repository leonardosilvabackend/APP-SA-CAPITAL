ALTER TABLE "notifications" ADD COLUMN "dedupe_key" varchar(180);
ALTER TABLE "notifications" ADD COLUMN "read_at" timestamp with time zone;
CREATE UNIQUE INDEX "notifications_recipient_dedupe_idx" ON "notifications" ("recipient_id", "dedupe_key") WHERE "dedupe_key" IS NOT NULL;

CREATE TABLE "user_profiles" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "first_name" varchar(100), "last_name" varchar(100), "gender" varchar(30), "phone" varchar(32),
  "email" varchar(320), "tax_document" varchar(30), "company_name" varchar(180), "address" text,
  "interested_administrators" jsonb NOT NULL DEFAULT '[]'::jsonb, "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE "stock_alert_preferences" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "administrator" varchar(160), "category" varchar(80), "max_entry_percent" numeric(5,2), "average_term" integer,
  "min_outstanding_balance" numeric(14,2), "max_outstanding_balance" numeric(14,2), "active" boolean NOT NULL DEFAULT true,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE TABLE "partner_api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL UNIQUE, "prefix" varchar(24) NOT NULL, "commission_rate" integer NOT NULL DEFAULT 0,
  "last_used_at" timestamp with time zone, "revoked_at" timestamp with time zone, "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "partner_api_keys_commission_check" CHECK ("commission_rate" BETWEEN 0 AND 8)
);
CREATE INDEX "partner_api_keys_user_idx" ON "partner_api_keys" ("user_id");
CREATE TABLE "partner_api_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "api_key_id" uuid NOT NULL REFERENCES "partner_api_keys"("id") ON DELETE CASCADE,
  "path" varchar(200) NOT NULL, "status_code" integer NOT NULL, "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX "partner_api_logs_key_created_idx" ON "partner_api_logs" ("api_key_id", "created_at");
