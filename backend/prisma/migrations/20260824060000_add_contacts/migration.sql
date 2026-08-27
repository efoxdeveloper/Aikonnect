-- Contact data is isolated per workspace. Phone numbers use canonical E.164 values,
-- making duplicate detection deterministic across manual creation and imports.
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "phone_e164" VARCHAR(20) NOT NULL,
    "email" VARCHAR(320),
    "source" VARCHAR(50) NOT NULL DEFAULT 'Manual',
    "whatsapp_opted" BOOLEAN NOT NULL DEFAULT true,
    "custom_attributes" JSONB NOT NULL DEFAULT '{}',
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contacts_phone_e164_check" CHECK ("phone_e164" ~ '^\+[1-9][0-9]{6,14}$'),
    CONSTRAINT "contacts_name_not_blank_check" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "contacts_source_not_blank_check" CHECK (length(btrim("source")) > 0)
);

CREATE TABLE "contact_tags" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "normalized_name" VARCHAR(50) NOT NULL,
    "color" VARCHAR(20),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contact_tags_name_not_blank_check" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "contact_tags_normalized_name_not_blank_check" CHECK (length(btrim("normalized_name")) > 0)
);

CREATE TABLE "contact_tag_assignments" (
    "contact_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_tag_assignments_pkey" PRIMARY KEY ("contact_id", "tag_id")
);

CREATE UNIQUE INDEX "contacts_workspace_id_phone_e164_key" ON "contacts"("workspace_id", "phone_e164");
CREATE INDEX "contacts_workspace_id_created_at_id_idx" ON "contacts"("workspace_id", "created_at", "id");
CREATE INDEX "contacts_workspace_id_updated_at_id_idx" ON "contacts"("workspace_id", "updated_at", "id");
CREATE INDEX "contacts_workspace_id_source_created_at_idx" ON "contacts"("workspace_id", "source", "created_at");
CREATE INDEX "contacts_created_by_id_idx" ON "contacts"("created_by_id");
CREATE INDEX "contacts_updated_by_id_idx" ON "contacts"("updated_by_id");
CREATE UNIQUE INDEX "contact_tags_workspace_id_normalized_name_key" ON "contact_tags"("workspace_id", "normalized_name");
CREATE INDEX "contact_tags_workspace_id_name_idx" ON "contact_tags"("workspace_id", "name");
CREATE INDEX "contact_tag_assignments_tag_id_contact_id_idx" ON "contact_tag_assignments"("tag_id", "contact_id");

-- Trigram indexes keep contains-search useful once a workspace has a large contact list.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "contacts_name_search_idx" ON "contacts" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "contacts_email_search_idx" ON "contacts" USING GIN ("email" gin_trgm_ops);
CREATE INDEX "contacts_phone_search_idx" ON "contacts" USING GIN ("phone_e164" gin_trgm_ops);

ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_tag_assignments" ADD CONSTRAINT "contact_tag_assignments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_tag_assignments" ADD CONSTRAINT "contact_tag_assignments_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "contact_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
