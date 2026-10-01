ALTER TABLE "messages"
  ADD COLUMN "queue_attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "queue_processing_token" UUID,
  ADD COLUMN "queue_processing_at" TIMESTAMPTZ(3),
  ADD COLUMN "queue_next_attempt_at" TIMESTAMPTZ(3);

CREATE INDEX "messages_delivery_queue_idx"
  ON "messages"("status", "queue_next_attempt_at", "queue_processing_at", "created_at");
