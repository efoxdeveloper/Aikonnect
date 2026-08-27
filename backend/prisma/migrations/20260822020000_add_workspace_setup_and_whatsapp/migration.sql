-- CreateEnum
CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "WhatsAppPhoneNumberStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISCONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "workspace_setup_progress" (
    "workspace_id" UUID NOT NULL,
    "whatsapp_connected_at" TIMESTAMPTZ(3),
    "phone_number_connected_at" TIMESTAMPTZ(3),
    "teammate_invited_at" TIMESTAMPTZ(3),
    "test_message_sent_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workspace_setup_progress_pkey" PRIMARY KEY ("workspace_id")
);

-- CreateTable
CREATE TABLE "whatsapp_business_accounts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "meta_business_id" VARCHAR(100),
    "meta_waba_id" VARCHAR(100),
    "display_name" VARCHAR(160),
    "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "encrypted_access_token" TEXT,
    "token_expires_at" TIMESTAMPTZ(3),
    "connected_at" TIMESTAMPTZ(3),
    "last_synced_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "whatsapp_business_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_phone_numbers" (
    "id" UUID NOT NULL,
    "business_account_id" UUID NOT NULL,
    "meta_phone_number_id" VARCHAR(100) NOT NULL,
    "display_phone_number" VARCHAR(30) NOT NULL,
    "verified_name" VARCHAR(160),
    "status" "WhatsAppPhoneNumberStatus" NOT NULL DEFAULT 'PENDING',
    "quality_rating" VARCHAR(30),
    "messaging_limit" VARCHAR(50),
    "connected_at" TIMESTAMPTZ(3),
    "last_synced_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "whatsapp_phone_numbers_pkey" PRIMARY KEY ("id")
);

-- Backfill setup progress for existing workspaces
INSERT INTO "workspace_setup_progress" ("workspace_id", "created_at", "updated_at")
SELECT "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "workspaces";

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_business_accounts_workspace_id_meta_waba_id_key" ON "whatsapp_business_accounts"("workspace_id", "meta_waba_id");
CREATE INDEX "whatsapp_business_accounts_workspace_id_status_idx" ON "whatsapp_business_accounts"("workspace_id", "status");
CREATE UNIQUE INDEX "whatsapp_phone_numbers_business_account_id_meta_phone_number_id_key" ON "whatsapp_phone_numbers"("business_account_id", "meta_phone_number_id");
CREATE INDEX "whatsapp_phone_numbers_business_account_id_status_idx" ON "whatsapp_phone_numbers"("business_account_id", "status");

-- AddForeignKey
ALTER TABLE "workspace_setup_progress" ADD CONSTRAINT "workspace_setup_progress_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_business_accounts" ADD CONSTRAINT "whatsapp_business_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_phone_numbers" ADD CONSTRAINT "whatsapp_phone_numbers_business_account_id_fkey" FOREIGN KEY ("business_account_id") REFERENCES "whatsapp_business_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
