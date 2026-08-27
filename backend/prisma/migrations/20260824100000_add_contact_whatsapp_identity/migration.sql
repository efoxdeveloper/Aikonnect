ALTER TABLE "contacts"
ADD COLUMN "whatsapp_id" VARCHAR(64),
ADD COLUMN "profile_name" VARCHAR(160),
ADD CONSTRAINT "contacts_whatsapp_id_format_check"
  CHECK ("whatsapp_id" IS NULL OR "whatsapp_id" ~ '^[A-Za-z0-9._:-]+$'),
ADD CONSTRAINT "contacts_profile_name_not_blank_check"
  CHECK ("profile_name" IS NULL OR length(btrim("profile_name")) > 0);

-- A WhatsApp identity can belong to only one active contact in an organization.
-- Soft-deleted contacts retain history without blocking later recreation.
CREATE UNIQUE INDEX "contacts_workspace_active_whatsapp_id_key"
ON "contacts"("workspace_id", "whatsapp_id")
WHERE "deleted_at" IS NULL AND "whatsapp_id" IS NOT NULL;

CREATE INDEX "contacts_workspace_id_whatsapp_id_idx"
ON "contacts"("workspace_id", "whatsapp_id");

CREATE INDEX "contacts_profile_name_search_idx"
ON "contacts" USING GIN ("profile_name" gin_trgm_ops);

CREATE INDEX "contacts_whatsapp_id_search_idx"
ON "contacts" USING GIN ("whatsapp_id" gin_trgm_ops);
