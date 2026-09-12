CREATE TABLE "public_api_keys" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "created_by_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "key_prefix" VARCHAR(32) NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "last_used_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "public_api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "public_api_keys_key_hash_key" ON "public_api_keys"("key_hash");
CREATE INDEX "public_api_keys_workspace_id_revoked_at_created_at_idx" ON "public_api_keys"("workspace_id", "revoked_at", "created_at");
CREATE INDEX "public_api_keys_created_by_id_idx" ON "public_api_keys"("created_by_id");

ALTER TABLE "public_api_keys" ADD CONSTRAINT "public_api_keys_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public_api_keys" ADD CONSTRAINT "public_api_keys_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
