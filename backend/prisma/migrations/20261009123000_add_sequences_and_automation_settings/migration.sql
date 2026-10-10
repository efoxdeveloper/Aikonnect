CREATE TYPE "SequenceEnrollmentStatus" AS ENUM ('WAITING', 'ACTIVE', 'COMPLETED', 'STOPPED', 'FAILED');

CREATE TABLE "sequences" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "enrolled_count" INTEGER NOT NULL DEFAULT 0,
    "completed_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "sequences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sequence_enrollments" (
    "id" UUID NOT NULL,
    "sequence_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "conversation_id" UUID,
    "status" "SequenceEnrollmentStatus" NOT NULL DEFAULT 'WAITING',
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "current_campaign_id" UUID,
    "next_run_at" TIMESTAMPTZ(3) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "sequence_enrollments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspace_automation_settings" (
    "workspace_id" UUID NOT NULL,
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Asia/Kolkata',
    "send_window_start" VARCHAR(5) NOT NULL DEFAULT '09:00',
    "send_window_end" VARCHAR(5) NOT NULL DEFAULT '18:00',
    "send_days" JSONB NOT NULL DEFAULT '[1,2,3,4,5]',
    "retry_limit" INTEGER NOT NULL DEFAULT 3,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "workspace_automation_settings_pkey" PRIMARY KEY ("workspace_id")
);

CREATE INDEX "sequences_workspace_id_status_updated_at_idx" ON "sequences"("workspace_id", "status", "updated_at");
CREATE INDEX "sequences_workspace_id_created_at_idx" ON "sequences"("workspace_id", "created_at");
CREATE INDEX "sequence_enrollments_workspace_id_status_next_run_at_idx" ON "sequence_enrollments"("workspace_id", "status", "next_run_at");
CREATE INDEX "sequence_enrollments_sequence_id_status_idx" ON "sequence_enrollments"("sequence_id", "status");
CREATE INDEX "sequence_enrollments_contact_id_status_idx" ON "sequence_enrollments"("contact_id", "status");
CREATE UNIQUE INDEX "sequence_enrollments_sequence_id_contact_id_active_key" ON "sequence_enrollments"("sequence_id", "contact_id") WHERE "status" IN ('WAITING', 'ACTIVE');

ALTER TABLE "sequences" ADD CONSTRAINT "sequences_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_automation_settings" ADD CONSTRAINT "workspace_automation_settings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
