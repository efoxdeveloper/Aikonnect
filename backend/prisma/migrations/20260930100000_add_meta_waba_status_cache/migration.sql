ALTER TABLE "whatsapp_business_accounts"
  ADD COLUMN "meta_account_status" VARCHAR(50),
  ADD COLUMN "meta_account_review_status" VARCHAR(50),
  ADD COLUMN "meta_business_verification_status" VARCHAR(50),
  ADD COLUMN "meta_status_checked_at" TIMESTAMPTZ(3);
