-- These indexes support workspace-scoped server sorting while excluding
-- soft-deleted contacts from the active Contact Hub result set.
CREATE INDEX "contacts_workspace_id_deleted_at_name_id_idx"
ON "contacts"("workspace_id", "deleted_at", "name", "id");

CREATE INDEX "contacts_workspace_id_deleted_at_phone_e164_id_idx"
ON "contacts"("workspace_id", "deleted_at", "phone_e164", "id");

CREATE INDEX "contacts_workspace_id_deleted_at_email_id_idx"
ON "contacts"("workspace_id", "deleted_at", "email", "id");

CREATE INDEX "contacts_workspace_id_deleted_at_source_id_idx"
ON "contacts"("workspace_id", "deleted_at", "source", "id");

CREATE INDEX "contacts_workspace_id_deleted_at_profile_name_id_idx"
ON "contacts"("workspace_id", "deleted_at", "profile_name", "id");
