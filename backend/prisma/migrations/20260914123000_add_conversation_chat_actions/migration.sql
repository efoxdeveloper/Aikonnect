ALTER TABLE "conversations"
  ADD COLUMN "is_pinned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cleared_at" TIMESTAMPTZ(3),
  ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

CREATE INDEX "conversations_workspace_id_deleted_at_is_pinned_last_message_at_id_idx"
  ON "conversations"("workspace_id", "deleted_at", "is_pinned", "last_message_at", "id");
