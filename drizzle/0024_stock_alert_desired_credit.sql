ALTER TABLE "stock_alert_preferences"
  ADD COLUMN IF NOT EXISTS "desired_credit" numeric(14,2);
