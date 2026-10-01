CREATE TABLE "webhook_deliveries" (
  "id" UUID NOT NULL,
  "endpoint_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "message_id" UUID,
  "event_id" VARCHAR(180) NOT NULL,
  "event_type" VARCHAR(80) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processing_token" UUID,
  "processing_at" TIMESTAMPTZ(3),
  "last_error" TEXT,
  "delivered_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webhook_deliveries_endpoint_id_event_id_key"
  ON "webhook_deliveries"("endpoint_id", "event_id");

CREATE INDEX "webhook_deliveries_queue_idx"
  ON "webhook_deliveries"("status", "next_attempt_at", "processing_at", "created_at");

CREATE INDEX "webhook_deliveries_workspace_id_message_id_created_at_idx"
  ON "webhook_deliveries"("workspace_id", "message_id", "created_at");

ALTER TABLE "webhook_deliveries"
  ADD CONSTRAINT "webhook_deliveries_endpoint_id_fkey"
  FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "webhook_deliveries"
  ADD CONSTRAINT "webhook_deliveries_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
