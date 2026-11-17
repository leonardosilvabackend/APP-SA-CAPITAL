ALTER TABLE "quotas" ADD COLUMN "bid_collateral" boolean DEFAULT false NOT NULL;
ALTER TABLE "quotas" ADD COLUMN "bid_fgts" boolean DEFAULT false NOT NULL;
ALTER TABLE "app_settings" ADD COLUMN "fb_api_online" boolean DEFAULT true NOT NULL;
