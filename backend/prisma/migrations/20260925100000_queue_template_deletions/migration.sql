ALTER TYPE "TemplateStatus" ADD VALUE 'DELETING' BEFORE 'DELETED';
ALTER TYPE "TemplateStatus" ADD VALUE 'DELETE_FAILED' BEFORE 'DELETED';

ALTER TABLE "templates"
  ADD COLUMN "deletion_attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deletion_next_attempt_at" TIMESTAMPTZ(3),
  ADD COLUMN "deletion_processing_at" TIMESTAMPTZ(3),
  ADD COLUMN "deletion_error" TEXT;

CREATE INDEX "templates_status_deletion_next_attempt_at_deletion_processing_at_idx"
  ON "templates"("status", "deletion_next_attempt_at", "deletion_processing_at");
