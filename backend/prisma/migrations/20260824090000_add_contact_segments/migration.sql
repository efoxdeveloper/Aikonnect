CREATE TABLE "contact_segments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "normalized_name" VARCHAR(120) NOT NULL,
    "definition" JSONB NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contact_segments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_segments_workspace_id_normalized_name_key" ON "contact_segments"("workspace_id", "normalized_name");
CREATE INDEX "contact_segments_workspace_id_updated_at_idx" ON "contact_segments"("workspace_id", "updated_at");
CREATE INDEX "contact_segments_created_by_id_idx" ON "contact_segments"("created_by_id");
CREATE INDEX "contact_segments_updated_by_id_idx" ON "contact_segments"("updated_by_id");

ALTER TABLE "contact_segments" ADD CONSTRAINT "contact_segments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_segments" ADD CONSTRAINT "contact_segments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contact_segments" ADD CONSTRAINT "contact_segments_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
