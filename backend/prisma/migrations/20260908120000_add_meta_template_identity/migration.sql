ALTER TABLE "templates" ADD COLUMN "meta_template_id" VARCHAR(100);
ALTER TABLE "templates" ADD COLUMN "meta_waba_id" VARCHAR(100);
ALTER TABLE "templates" ADD COLUMN "meta_template_name" VARCHAR(512);
ALTER TABLE "templates" ADD COLUMN "meta_language_code" VARCHAR(50);
ALTER TABLE "templates" ADD COLUMN "meta_status" VARCHAR(50);
ALTER TABLE "templates" ADD COLUMN "meta_rejection_reason" TEXT;

CREATE UNIQUE INDEX "templates_workspace_id_meta_template_id_key"
ON "templates"("workspace_id", "meta_template_id");

CREATE INDEX "templates_workspace_id_meta_waba_id_status_idx"
ON "templates"("workspace_id", "meta_waba_id", "status");
