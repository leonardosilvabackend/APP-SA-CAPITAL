CREATE TABLE "email_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_name" varchar(160) NOT NULL,
	"recipient_email" varchar(320) NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "email_jobs_pending_idx" ON "email_jobs" USING btree ("sent_at","next_attempt_at");