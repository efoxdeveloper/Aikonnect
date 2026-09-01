ALTER TABLE "contacts"
  ADD COLUMN "status" VARCHAR(50) NOT NULL DEFAULT 'New Lead',
  ADD COLUMN "user_id" VARCHAR(160),
  ADD COLUMN "account_owner_id" UUID,
  ADD COLUMN "deal_value" DECIMAL(14,2);

CREATE INDEX "contacts_workspace_id_status_created_at_id_idx" ON "contacts"("workspace_id", "status", "created_at", "id");
CREATE INDEX "contacts_account_owner_id_idx" ON "contacts"("account_owner_id");

ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_account_owner_id_fkey"
  FOREIGN KEY ("account_owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
