CREATE SEQUENCE "public"."negotiation_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 5092026 CACHE 1;--> statement-breakpoint
CREATE TABLE "negotiation_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"negotiation_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"recorded_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "negotiation_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payment_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "negotiations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) DEFAULT 'SA' || lpad(nextval('negotiation_code_seq')::text, 8, '0') NOT NULL,
	"reservation_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"client_name" varchar(180) NOT NULL,
	"selected_quotas" jsonb NOT NULL,
	"status" varchar(40) DEFAULT 'awaiting_data' NOT NULL,
	"entry_amount" numeric(14, 2) NOT NULL,
	"transfer_fee" numeric(14, 2) NOT NULL,
	"registration_fee" numeric(14, 2) DEFAULT '0' NOT NULL,
	"commission_amount" numeric(14, 2) NOT NULL,
	"credit_amount" numeric(14, 2) NOT NULL,
	"insurance_amount" numeric(14, 2) NOT NULL,
	"outstanding_balance" numeric(14, 2) NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "negotiations_code_unique" UNIQUE("code"),
	CONSTRAINT "negotiations_reservation_id_unique" UNIQUE("reservation_id")
);
--> statement-breakpoint
ALTER TABLE "negotiation_payments" ADD CONSTRAINT "negotiation_payments_negotiation_id_negotiations_id_fk" FOREIGN KEY ("negotiation_id") REFERENCES "public"."negotiations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation_payments" ADD CONSTRAINT "negotiation_payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation_payments" ADD CONSTRAINT "negotiation_payments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation_receipts" ADD CONSTRAINT "negotiation_receipts_payment_id_negotiation_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."negotiation_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiation_receipts" ADD CONSTRAINT "negotiation_receipts_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "negotiation_payments_negotiation_idx" ON "negotiation_payments" USING btree ("negotiation_id");--> statement-breakpoint
CREATE INDEX "negotiation_receipts_payment_idx" ON "negotiation_receipts" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "negotiations_owner_idx" ON "negotiations" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "negotiations_status_idx" ON "negotiations" USING btree ("status");