ALTER TYPE "public"."user_role" ADD VALUE 'administrative';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'advisor';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'user';--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" varchar(30) PRIMARY KEY DEFAULT 'default' NOT NULL,
	"company_name" varchar(160) DEFAULT 'SA Capital' NOT NULL,
	"company_email" varchar(320),
	"company_phone" varchar(40),
	"legal_notice" text DEFAULT 'A SA CAPITAL se isenta de qualquer responsabilidade sobre alteração de valores, fica a responsabilidade do parceiro verificar junto ao seu assessor os valores atualizados antes de qualquer negociação.' NOT NULL,
	"max_file_size_mb" integer DEFAULT 10 NOT NULL,
	"allowed_file_types" jsonb DEFAULT '["application/pdf","image/jpeg","image/png"]'::jsonb NOT NULL,
	"income_documents" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pre_analysis_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pre_analysis_id" uuid NOT NULL,
	"document_type" varchar(100) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size" integer NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pre_analyses" ALTER COLUMN "status" SET DEFAULT 'received';--> statement-breakpoint
ALTER TABLE "pre_analyses" ADD COLUMN "income_type" varchar(60) DEFAULT 'Autônomo' NOT NULL;--> statement-breakpoint
ALTER TABLE "pre_analyses" ADD COLUMN "observations" text;--> statement-breakpoint
ALTER TABLE "pre_analyses" ADD COLUMN "administrator_id" uuid;--> statement-breakpoint
ALTER TABLE "pre_analyses" ADD COLUMN "consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pre_analyses" ADD COLUMN "returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "saved_quotes" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "saved_quotes" SET "expires_at" = "created_at" + interval '5 days';--> statement-breakpoint
ALTER TABLE "saved_quotes" ALTER COLUMN "expires_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "manager_id" uuid;--> statement-breakpoint
ALTER TABLE "pre_analysis_documents" ADD CONSTRAINT "pre_analysis_documents_pre_analysis_id_pre_analyses_id_fk" FOREIGN KEY ("pre_analysis_id") REFERENCES "public"."pre_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_requests" ADD CONSTRAINT "reservation_requests_quote_id_saved_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."saved_quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_requests" ADD CONSTRAINT "reservation_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_requests" ADD CONSTRAINT "reservation_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pre_analysis_documents_analysis_idx" ON "pre_analysis_documents" USING btree ("pre_analysis_id");--> statement-breakpoint
CREATE INDEX "pre_analysis_documents_expires_idx" ON "pre_analysis_documents" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "reservation_quote_idx" ON "reservation_requests" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "reservation_status_idx" ON "reservation_requests" USING btree ("status");--> statement-breakpoint
ALTER TABLE "pre_analyses" ADD CONSTRAINT "pre_analyses_administrator_id_users_id_fk" FOREIGN KEY ("administrator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_quotes_expires_at_idx" ON "saved_quotes" USING btree ("expires_at");
