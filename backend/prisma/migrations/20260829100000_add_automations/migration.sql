CREATE TYPE "AutomationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');
CREATE TYPE "AutomationRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');

CREATE TABLE "automations" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "status" "AutomationStatus" NOT NULL DEFAULT 'DRAFT',
  "trigger" JSONB NOT NULL,
  "conditions" JSONB NOT NULL DEFAULT '[]',
  "actions" JSONB NOT NULL,
  "run_count" INTEGER NOT NULL DEFAULT 0,
  "last_run_at" TIMESTAMPTZ(3),
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "automation_logs" (
  "id" UUID NOT NULL,
  "automation_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "contact_id" UUID,
  "status" "AutomationRunStatus" NOT NULL,
  "trigger_payload" JSONB NOT NULL DEFAULT '{}',
  "condition_results" JSONB NOT NULL DEFAULT '[]',
  "action_results" JSONB NOT NULL DEFAULT '[]',
  "error" TEXT,
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(3),
  CONSTRAINT "automation_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "automations_workspace_id_status_updated_at_idx" ON "automations"("workspace_id", "status", "updated_at");
CREATE INDEX "automations_workspace_id_created_at_idx" ON "automations"("workspace_id", "created_at");
CREATE INDEX "automation_logs_workspace_id_automation_id_started_at_idx" ON "automation_logs"("workspace_id", "automation_id", "started_at");
CREATE INDEX "automation_logs_workspace_id_contact_id_started_at_idx" ON "automation_logs"("workspace_id", "contact_id", "started_at");

ALTER TABLE "automations" ADD CONSTRAINT "automations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automations" ADD CONSTRAINT "automations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
