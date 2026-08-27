CREATE TYPE "ContactCustomFieldType" AS ENUM (
  'TEXT',
  'NUMBER',
  'DATE',
  'BOOLEAN',
  'SELECT',
  'MULTI_SELECT'
);

CREATE TABLE "contact_custom_fields" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "key" VARCHAR(80) NOT NULL,
  "label" VARCHAR(120) NOT NULL,
  "normalized_label" VARCHAR(120) NOT NULL,
  "type" "ContactCustomFieldType" NOT NULL,
  "options" JSONB NOT NULL DEFAULT '[]',
  "required" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL DEFAULT 0,
  "archived_at" TIMESTAMPTZ(3),
  "created_by_id" UUID,
  "updated_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "contact_custom_fields_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contact_custom_fields_key_format_check" CHECK ("key" ~ '^[a-z][a-z0-9_]{0,79}$'),
  CONSTRAINT "contact_custom_fields_label_not_blank_check" CHECK (length(btrim("label")) > 0),
  CONSTRAINT "contact_custom_fields_position_check" CHECK ("position" >= 0),
  CONSTRAINT "contact_custom_fields_options_array_check" CHECK (jsonb_typeof("options") = 'array')
);

CREATE UNIQUE INDEX "contact_custom_fields_workspace_id_key_key"
ON "contact_custom_fields"("workspace_id", "key");

CREATE UNIQUE INDEX "contact_custom_fields_workspace_id_normalized_label_key"
ON "contact_custom_fields"("workspace_id", "normalized_label");

CREATE INDEX "contact_custom_fields_workspace_id_archived_at_position_id_idx"
ON "contact_custom_fields"("workspace_id", "archived_at", "position", "id");

CREATE INDEX "contact_custom_fields_created_by_id_idx"
ON "contact_custom_fields"("created_by_id");

CREATE INDEX "contact_custom_fields_updated_by_id_idx"
ON "contact_custom_fields"("updated_by_id");

ALTER TABLE "contact_custom_fields"
ADD CONSTRAINT "contact_custom_fields_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_custom_fields"
ADD CONSTRAINT "contact_custom_fields_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contact_custom_fields"
ADD CONSTRAINT "contact_custom_fields_updated_by_id_fkey"
FOREIGN KEY ("updated_by_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
