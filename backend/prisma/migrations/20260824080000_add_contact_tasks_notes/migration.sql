CREATE TYPE "ContactTaskStatus" AS ENUM ('OPEN', 'COMPLETED');

CREATE TABLE "contact_tasks" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "due_at" TIMESTAMPTZ(3),
    "status" "ContactTaskStatus" NOT NULL DEFAULT 'OPEN',
    "completed_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "contact_tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contact_tasks_title_not_blank_check" CHECK (length(btrim("title")) > 0)
);

CREATE TABLE "contact_notes" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "content" TEXT NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "deleted_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "contact_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contact_notes_title_not_blank_check" CHECK (length(btrim("title")) > 0),
    CONSTRAINT "contact_notes_content_not_blank_check" CHECK (length(btrim("content")) > 0)
);

CREATE INDEX "contact_tasks_workspace_id_contact_id_status_due_at_idx" ON "contact_tasks"("workspace_id", "contact_id", "status", "due_at");
CREATE INDEX "contact_tasks_created_by_id_idx" ON "contact_tasks"("created_by_id");
CREATE INDEX "contact_tasks_updated_by_id_idx" ON "contact_tasks"("updated_by_id");
CREATE INDEX "contact_notes_workspace_id_contact_id_deleted_at_created_at_idx" ON "contact_notes"("workspace_id", "contact_id", "deleted_at", "created_at");
CREATE INDEX "contact_notes_created_by_id_idx" ON "contact_notes"("created_by_id");
CREATE INDEX "contact_notes_updated_by_id_idx" ON "contact_notes"("updated_by_id");
CREATE INDEX "contact_notes_deleted_by_id_idx" ON "contact_notes"("deleted_by_id");

ALTER TABLE "contact_tasks" ADD CONSTRAINT "contact_tasks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_tasks" ADD CONSTRAINT "contact_tasks_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_tasks" ADD CONSTRAINT "contact_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contact_tasks" ADD CONSTRAINT "contact_tasks_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
