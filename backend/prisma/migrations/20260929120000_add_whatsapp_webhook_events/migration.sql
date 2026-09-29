CREATE TABLE "whatsapp_webhook_events" (
    "id" UUID NOT NULL,
    "request_id" VARCHAR(255),
    "waba_id" VARCHAR(200),
    "phone_number_id" VARCHAR(200),
    "webhook_field" VARCHAR(100),
    "payload" JSONB NOT NULL DEFAULT '{}',
    "response_status" INTEGER NOT NULL,
    "response_body" TEXT,
    "processing_error" TEXT,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "whatsapp_webhook_events_waba_id_created_at_idx" ON "whatsapp_webhook_events"("waba_id", "created_at");
CREATE INDEX "whatsapp_webhook_events_response_status_created_at_idx" ON "whatsapp_webhook_events"("response_status", "created_at");
CREATE INDEX "whatsapp_webhook_events_request_id_idx" ON "whatsapp_webhook_events"("request_id");
