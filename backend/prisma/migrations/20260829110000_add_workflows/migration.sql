CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

CREATE TABLE "workflows" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
  "trigger" JSONB NOT NULL,
  "conditions" JSONB NOT NULL DEFAULT '[]',
  "steps" JSONB NOT NULL,
  "run_count" INTEGER NOT NULL DEFAULT 0,
  "enrolled_count" INTEGER NOT NULL DEFAULT 0,
  "last_run_at" TIMESTAMPTZ(3),
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workflows_workspace_id_status_updated_at_idx" ON "workflows"("workspace_id", "status", "updated_at");
CREATE INDEX "workflows_workspace_id_created_at_idx" ON "workflows"("workspace_id", "created_at");

ALTER TABLE "workflows" ADD CONSTRAINT "workflows_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
