CREATE TABLE "wallet_topups" (
  "id" UUID NOT NULL,
  "wallet_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(255) NOT NULL,
  "payment_id" VARCHAR(64) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'CREATED',
  "transaction_date" VARCHAR(10),
  "gateway_request_id" VARCHAR(100),
  "provider_payment_id" VARCHAR(100),
  "provider_transaction_id" VARCHAR(100),
  "checkout" JSONB,
  "failure_code" VARCHAR(100),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "completed_at" TIMESTAMPTZ(3),
  CONSTRAINT "wallet_topups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wallet_topups_amount_positive_check" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "wallet_topups_payment_id_key" ON "wallet_topups"("payment_id");
CREATE UNIQUE INDEX "wallet_topups_wallet_id_idempotency_key_key" ON "wallet_topups"("wallet_id", "idempotency_key");
CREATE INDEX "wallet_topups_workspace_id_created_at_idx" ON "wallet_topups"("workspace_id", "created_at");
CREATE INDEX "wallet_topups_status_updated_at_idx" ON "wallet_topups"("status", "updated_at");

ALTER TABLE "wallet_topups"
  ADD CONSTRAINT "wallet_topups_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "wallet_topups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "wallet_topups_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "wallet_topups_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
