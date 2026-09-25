ALTER TABLE "messages"
  ADD COLUMN "api_idempotency_key" VARCHAR(255);

CREATE UNIQUE INDEX "messages_workspace_id_api_idempotency_key_key"
  ON "messages"("workspace_id", "api_idempotency_key");
