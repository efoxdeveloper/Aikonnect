ALTER TABLE "campaigns"
  ADD COLUMN "template_body" TEXT,
  ADD COLUMN "button_tracking" JSONB NOT NULL DEFAULT '[]';
