ALTER TABLE "quotas" ADD COLUMN "reservation_origin" varchar(20);
--> statement-breakpoint
UPDATE quotas SET reservation_origin = 'manual' WHERE status = 'reserved';
