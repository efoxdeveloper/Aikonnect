CREATE TYPE "WalletEntryDirection" AS ENUM ('CREDIT', 'DEBIT');

CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "balance_minor_units" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wallet_ledger_entries" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "direction" "WalletEntryDirection" NOT NULL,
    "amount_minor_units" BIGINT NOT NULL,
    "balance_after_minor_units" BIGINT NOT NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "reason" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_ledger_entries_pkey" PRIMARY KEY ("id")
);

INSERT INTO "wallets" ("id", "workspace_id", "currency")
SELECT gen_random_uuid(), "id", 'INR'
FROM "workspaces";

CREATE UNIQUE INDEX "wallets_workspace_id_key" ON "wallets"("workspace_id");
CREATE UNIQUE INDEX "wallet_ledger_entries_wallet_id_idempotency_key_key" ON "wallet_ledger_entries"("wallet_id", "idempotency_key");
CREATE INDEX "wallet_ledger_entries_workspace_id_created_at_idx" ON "wallet_ledger_entries"("workspace_id", "created_at");
CREATE INDEX "wallet_ledger_entries_wallet_id_created_at_idx" ON "wallet_ledger_entries"("wallet_id", "created_at");

ALTER TABLE "wallets"
ADD CONSTRAINT "wallets_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wallet_ledger_entries"
ADD CONSTRAINT "wallet_ledger_entries_wallet_id_fkey"
FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "wallet_ledger_entries_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "wallet_ledger_entries_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "wallets"
ADD CONSTRAINT "wallets_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
ADD CONSTRAINT "wallets_balance_nonnegative_check" CHECK ("balance_minor_units" >= 0);

ALTER TABLE "wallet_ledger_entries"
ADD CONSTRAINT "wallet_ledger_entries_amount_positive_check" CHECK ("amount_minor_units" > 0),
ADD CONSTRAINT "wallet_ledger_entries_balance_nonnegative_check" CHECK ("balance_after_minor_units" >= 0);
