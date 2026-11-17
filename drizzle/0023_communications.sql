CREATE TABLE IF NOT EXISTS "communications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE,
  "image_url" text,
  "body" text NOT NULL,
  "link_url" text,
  "active" boolean NOT NULL DEFAULT true,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "communications_org_active_idx" ON "communications" ("organization_id", "active", "created_at");
CREATE TABLE IF NOT EXISTS "communication_reads" (
  "communication_id" uuid NOT NULL REFERENCES "communications"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "read_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "communication_reads_uidx" ON "communication_reads" ("communication_id", "user_id");
