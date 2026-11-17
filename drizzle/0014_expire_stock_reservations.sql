ALTER TABLE "quotas" ADD COLUMN "reserved_at" timestamp with time zone;
UPDATE "quotas" SET "reserved_at" = "updated_at" WHERE "status" = 'reserved' AND "reserved_at" IS NULL;
CREATE INDEX "quotas_reserved_at_idx" ON "quotas" ("reserved_at") WHERE "status" = 'reserved';
CREATE TABLE "retired_quota_codes" (
  "code" varchar(80) PRIMARY KEY NOT NULL,
  "supplier" varchar(160),
  "external_id" varchar(120),
  "retired_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "retired_quota_identity_idx" ON "retired_quota_codes" ("supplier", "external_id");
