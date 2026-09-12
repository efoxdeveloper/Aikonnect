ALTER TABLE "campaigns"
  ADD COLUMN "meta_template_name" VARCHAR(512),
  ADD COLUMN "template_language_code" VARCHAR(50),
  ADD COLUMN "template_variables" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "retry_failed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "campaign_recipients"
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "campaign_recipients_campaign_id_status_updated_at_idx"
  ON "campaign_recipients"("campaign_id", "status", "updated_at");
