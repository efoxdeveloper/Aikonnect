ALTER TABLE "whatsapp_phone_numbers"
  ADD COLUMN "is_on_business_app" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "platform_type" VARCHAR(30);
