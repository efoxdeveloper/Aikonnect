ALTER TYPE "WalletEntryDirection" ADD VALUE IF NOT EXISTS 'HOLD';
ALTER TYPE "WalletEntryDirection" ADD VALUE IF NOT EXISTS 'RELEASE';

ALTER TABLE "wallets"
  ADD COLUMN "total_balance" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN "reserved_balance" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "low_balance_threshold" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN "auto_recharge_enabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "wallets"
SET "total_balance" = "balance_minor_units"::numeric / 100,
    "reserved_balance" = 0;

ALTER TABLE "wallets"
  ADD CONSTRAINT "wallets_total_balance_nonnegative_check" CHECK ("total_balance" >= 0),
  ADD CONSTRAINT "wallets_reserved_balance_nonnegative_check" CHECK ("reserved_balance" >= 0),
  ADD CONSTRAINT "wallets_reserved_balance_lte_total_check" CHECK ("reserved_balance" <= "total_balance");

ALTER TABLE "wallet_ledger_entries"
  ALTER COLUMN "amount_minor_units" DROP NOT NULL,
  ALTER COLUMN "balance_after_minor_units" DROP NOT NULL,
  ADD COLUMN "transaction_reference" VARCHAR(100) NOT NULL DEFAULT gen_random_uuid()::text,
  ADD COLUMN "transaction_type" VARCHAR(40) NOT NULL DEFAULT 'ADJUSTMENT',
  ADD COLUMN "amount" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN "currency" CHAR(3) NOT NULL DEFAULT 'INR',
  ADD COLUMN "opening_total_balance" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN "closing_total_balance" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN "opening_reserved_balance" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN "closing_reserved_balance" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN "opening_available_balance" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN "closing_available_balance" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN "message_id" UUID,
  ADD COLUMN "reservation_id" UUID,
  ADD COLUMN "external_reference" VARCHAR(255),
  ADD COLUMN "client_reference" VARCHAR(255),
  ADD COLUMN "status" VARCHAR(30) NOT NULL DEFAULT 'COMPLETED';

UPDATE "wallet_ledger_entries" AS entry
SET "amount" = COALESCE(entry."amount_minor_units"::numeric / 100, 0),
    "currency" = wallet."currency",
    "closing_total_balance" = COALESCE(wallet."total_balance", 0),
    "closing_reserved_balance" = COALESCE(wallet."reserved_balance", 0),
    "closing_available_balance" = COALESCE(wallet."total_balance", 0) - COALESCE(wallet."reserved_balance", 0)
FROM "wallets" AS wallet
WHERE wallet."id" = entry."wallet_id";

CREATE UNIQUE INDEX "wallet_ledger_entries_transaction_reference_key" ON "wallet_ledger_entries"("transaction_reference");
CREATE INDEX "wallet_ledger_entries_message_id_idx" ON "wallet_ledger_entries"("message_id");
CREATE INDEX "wallet_ledger_entries_reservation_id_idx" ON "wallet_ledger_entries"("reservation_id");
CREATE INDEX "wallet_ledger_entries_transaction_type_created_at_idx" ON "wallet_ledger_entries"("transaction_type", "created_at");

ALTER TABLE "messages"
  ADD COLUMN "billing_mode" VARCHAR(40),
  ADD COLUMN "wallet_charge_amount" DECIMAL(18,6),
  ADD COLUMN "billing_currency" CHAR(3),
  ADD COLUMN "billing_error" TEXT,
  ADD COLUMN "estimated_meta_cost" DECIMAL(18,6),
  ADD COLUMN "actual_meta_cost" DECIMAL(18,6),
  ADD COLUMN "cost_difference" DECIMAL(18,6),
  ADD COLUMN "reconciled_at" TIMESTAMPTZ(3);

CREATE TABLE "workspace_billing_settings" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "billing_mode" VARCHAR(40) NOT NULL DEFAULT 'CUSTOMER_META_BILLING',
  "billing_type" VARCHAR(30) NOT NULL DEFAULT 'PREPAID',
  "currency" CHAR(3) NOT NULL DEFAULT 'INR',
  "wallet_required" BOOLEAN NOT NULL DEFAULT true,
  "allow_negative_balance" BOOLEAN NOT NULL DEFAULT false,
  "credit_limit" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_billing_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wallet_reservations" (
  "id" UUID NOT NULL,
  "wallet_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "message_id" UUID NOT NULL,
  "rate_card_id" UUID,
  "meta_amount" DECIMAL(18,6) NOT NULL,
  "platform_fee" DECIMAL(18,6) NOT NULL,
  "customer_amount" DECIMAL(18,6) NOT NULL,
  "wallet_charge_amount" DECIMAL(18,6) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "idempotency_key" VARCHAR(255) NOT NULL,
  "client_reference" VARCHAR(255),
  "expires_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(3),
  "released_at" TIMESTAMPTZ(3),
  CONSTRAINT "wallet_reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_billing_settings_workspace_id_key" ON "workspace_billing_settings"("workspace_id");
CREATE UNIQUE INDEX "wallet_reservations_message_id_key" ON "wallet_reservations"("message_id");
CREATE UNIQUE INDEX "wallet_reservations_idempotency_key_key" ON "wallet_reservations"("idempotency_key");
CREATE INDEX "wallet_reservations_wallet_id_status_idx" ON "wallet_reservations"("wallet_id", "status");
CREATE INDEX "wallet_reservations_workspace_id_status_created_at_idx" ON "wallet_reservations"("workspace_id", "status", "created_at");
CREATE INDEX "wallet_reservations_status_expires_at_idx" ON "wallet_reservations"("status", "expires_at");

INSERT INTO "workspace_billing_settings" ("id", "workspace_id", "currency")
SELECT gen_random_uuid(), workspace."id", wallet."currency"
FROM "workspaces" AS workspace
JOIN "wallets" AS wallet ON wallet."tenant_id" = workspace."tenant_id"
ON CONFLICT ("workspace_id") DO NOTHING;

ALTER TABLE "workspace_billing_settings"
  ADD CONSTRAINT "workspace_billing_settings_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wallet_reservations"
  ADD CONSTRAINT "wallet_reservations_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "wallet_reservations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "wallet_reservations_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "wallet_reservations_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "wallet_reservations_rate_card_id_fkey"
  FOREIGN KEY ("rate_card_id") REFERENCES "whatsapp_rate_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "wallet_ledger_entries"
  ADD CONSTRAINT "wallet_ledger_entries_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "wallet_ledger_entries_reservation_id_fkey"
  FOREIGN KEY ("reservation_id") REFERENCES "wallet_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "wallet_reservations"
  ADD CONSTRAINT "wallet_reservations_amounts_nonnegative_check" CHECK ("meta_amount" >= 0 AND "platform_fee" >= 0 AND "customer_amount" >= 0 AND "wallet_charge_amount" >= 0),
  ADD CONSTRAINT "wallet_reservations_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "workspace_billing_settings"
  ADD CONSTRAINT "workspace_billing_settings_credit_limit_nonnegative_check" CHECK ("credit_limit" >= 0),
  ADD CONSTRAINT "workspace_billing_settings_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');
