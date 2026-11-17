CREATE TABLE "crm_deals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(180) NOT NULL,
  "phone" varchar(32), "instagram" varchar(100),
  "credit_amount" numeric(14,2), "category" varchar(80), "administrator" varchar(160),
  "stage" varchar(30) DEFAULT 'new' NOT NULL,
  "source" varchar(20) DEFAULT 'manual' NOT NULL,
  "negotiation_id" uuid REFERENCES "negotiations"("id") ON DELETE SET NULL,
  "version" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "crm_deals_stage_check" CHECK ("stage" IN ('new','reservation','lost')),
  CONSTRAINT "crm_deals_source_check" CHECK ("source" IN ('manual','reservation'))
);
CREATE INDEX "crm_deals_owner_stage_idx" ON "crm_deals" ("owner_id", "stage");
CREATE UNIQUE INDEX "crm_deals_negotiation_uidx" ON "crm_deals" ("negotiation_id") WHERE "negotiation_id" IS NOT NULL;
CREATE TABLE "crm_deal_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deal_id" uuid NOT NULL REFERENCES "crm_deals"("id") ON DELETE CASCADE,
  "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "action" varchar(60) NOT NULL,
  "previous_stage" varchar(30), "next_stage" varchar(30),
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "crm_deal_history_deal_idx" ON "crm_deal_history" ("deal_id", "created_at");
