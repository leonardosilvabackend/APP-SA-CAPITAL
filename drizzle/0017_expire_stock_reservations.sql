ALTER TABLE "quotas" ADD COLUMN "reserved_at" timestamp with time zone;
UPDATE "quotas" SET "reserved_at" = "updated_at" WHERE "status" = 'reserved' AND "reserved_at" IS NULL;
CREATE INDEX "quotas_reserved_at_idx" ON "quotas" ("reserved_at") WHERE "status" = 'reserved';
CREATE TABLE "retired_quota_codes" (
  "code" varchar(80) PRIMARY KEY NOT NULL,
  "retired_at" timestamp with time zone DEFAULT now() NOT NULL
);
