ALTER TABLE "stock_alert_preferences"
  ADD COLUMN IF NOT EXISTS "max_installment" numeric(14,2);
