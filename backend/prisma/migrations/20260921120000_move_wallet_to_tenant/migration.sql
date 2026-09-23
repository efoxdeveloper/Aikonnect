CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "workspaces" ADD COLUMN "tenant_id" UUID;

-- Existing workspaces are intentionally isolated into one tenant each. This avoids
-- merging unrelated customers before a reliable organization identity exists.
INSERT INTO "tenants" ("id", "name", "slug", "owner_id")
SELECT "id", COALESCE(NULLIF("company_name", ''), "name"), 'legacy-' || "id"::text, "owner_id"
FROM "workspaces";

UPDATE "workspaces" SET "tenant_id" = "id";
ALTER TABLE "workspaces" ALTER COLUMN "tenant_id" SET NOT NULL;

ALTER TABLE "wallets" ADD COLUMN "tenant_id" UUID;
UPDATE "wallets" AS wallet
SET "tenant_id" = workspace."tenant_id"
FROM "workspaces" AS workspace
WHERE workspace."id" = wallet."workspace_id";
ALTER TABLE "wallets" ALTER COLUMN "tenant_id" SET NOT NULL;

ALTER TABLE "wallet_ledger_entries" ADD COLUMN "tenant_id" UUID;
UPDATE "wallet_ledger_entries" AS entry
SET "tenant_id" = wallet."tenant_id"
FROM "wallets" AS wallet
WHERE wallet."id" = entry."wallet_id";
ALTER TABLE "wallet_ledger_entries" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "wallet_ledger_entries" ALTER COLUMN "workspace_id" DROP NOT NULL;

ALTER TABLE "wallets" DROP CONSTRAINT "wallets_workspace_id_fkey";
DROP INDEX "wallets_workspace_id_key";
ALTER TABLE "wallets" DROP COLUMN "workspace_id";

ALTER TABLE "wallet_ledger_entries" DROP CONSTRAINT "wallet_ledger_entries_workspace_id_fkey";

CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");
CREATE INDEX "tenants_owner_id_idx" ON "tenants"("owner_id");
CREATE UNIQUE INDEX "wallets_tenant_id_key" ON "wallets"("tenant_id");

ALTER TABLE "workspaces"
ADD CONSTRAINT "workspaces_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wallets"
ADD CONSTRAINT "wallets_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wallet_ledger_entries"
ADD CONSTRAINT "wallet_ledger_entries_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "wallet_ledger_entries_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tenants"
ADD CONSTRAINT "tenants_owner_id_fkey"
FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
