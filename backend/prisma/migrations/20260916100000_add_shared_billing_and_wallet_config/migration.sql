ALTER TABLE "whatsapp_business_accounts"
  ADD COLUMN "shared_billing_status" VARCHAR(30) NOT NULL DEFAULT 'NOT_CONFIGURED',
  ADD COLUMN "shared_billing_allocation_id" VARCHAR(100),
  ADD COLUMN "shared_billing_error" TEXT;
