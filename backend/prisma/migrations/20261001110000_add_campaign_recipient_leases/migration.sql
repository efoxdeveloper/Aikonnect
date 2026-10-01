ALTER TABLE "campaign_recipients"
  ADD COLUMN "processing_token" UUID,
  ADD COLUMN "processing_expires_at" TIMESTAMPTZ(3);

CREATE INDEX "campaign_recipients_campaign_id_status_processing_expires_at_idx"
  ON "campaign_recipients"("campaign_id", "status", "processing_expires_at");
