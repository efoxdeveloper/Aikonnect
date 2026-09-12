-- Supports recent-first inbox pagination and filtered workspace conversation lists.
CREATE INDEX "conversations_workspace_recent_idx"
ON "conversations" ("workspace_id", "last_message_at" DESC, "id" DESC);

CREATE INDEX "conversations_workspace_channel_status_recent_idx"
ON "conversations" ("workspace_id", "channel_key", "status", "last_message_at" DESC, "id" DESC);
