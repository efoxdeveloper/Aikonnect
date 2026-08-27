CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'DELETED');

CREATE TABLE "templates" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "template_key" VARCHAR(180) NOT NULL,
  "category" VARCHAR(40) NOT NULL,
  "language" VARCHAR(50) NOT NULL,
  "template_type" VARCHAR(40) NOT NULL,
  "header_type" VARCHAR(20) NOT NULL DEFAULT 'none',
  "header_text" VARCHAR(60),
  "header_file_name" VARCHAR(255),
  "body" TEXT NOT NULL,
  "footer" VARCHAR(60),
  "content" JSONB NOT NULL DEFAULT '{}',
  "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by_id" UUID,
  "updated_by_id" UUID,
  "deleted_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "templates_workspace_id_template_key_key" ON "templates"("workspace_id", "template_key");
CREATE INDEX "templates_workspace_id_status_updated_at_id_idx" ON "templates"("workspace_id", "status", "updated_at", "id");
CREATE INDEX "templates_workspace_id_deleted_at_updated_at_id_idx" ON "templates"("workspace_id", "deleted_at", "updated_at", "id");
CREATE INDEX "templates_created_by_id_idx" ON "templates"("created_by_id");
CREATE INDEX "templates_updated_by_id_idx" ON "templates"("updated_by_id");
CREATE INDEX "templates_deleted_by_id_idx" ON "templates"("deleted_by_id");

ALTER TABLE "templates"
  ADD CONSTRAINT "templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "templates_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "templates_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
