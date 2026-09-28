ALTER TABLE "users"
  ADD COLUMN "language" VARCHAR(20) NOT NULL DEFAULT 'en-IN',
  ADD COLUMN "timezone" VARCHAR(100) NOT NULL DEFAULT 'Asia/Kolkata',
  ADD COLUMN "date_format" VARCHAR(30) NOT NULL DEFAULT 'DD/MM/YYYY',
  ADD COLUMN "default_landing_page" VARCHAR(100) NOT NULL DEFAULT '/dashboard',
  ADD COLUMN "notify_product_updates" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notify_billing_alerts" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notify_campaign_alerts" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notify_whatsapp_alerts" BOOLEAN NOT NULL DEFAULT true;
