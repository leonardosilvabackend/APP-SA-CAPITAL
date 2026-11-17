ALTER TABLE "stock_alert_preferences" ADD COLUMN "outstanding_balance_relation" varchar(20);
ALTER TABLE "stock_alert_preferences" ADD CONSTRAINT "stock_alert_preferences_balance_relation_check"
  CHECK ("outstanding_balance_relation" IS NULL OR "outstanding_balance_relation" IN ('below_credit', 'above_credit'));
