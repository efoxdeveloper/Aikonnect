ALTER TABLE "messages"
  ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

CREATE INDEX "messages_workspace_id_conversation_id_deleted_at_idx"
  ON "messages"("workspace_id", "conversation_id", "deleted_at");
