ALTER TABLE "contacts"
ADD COLUMN "deleted_at" TIMESTAMPTZ(3),
ADD COLUMN "deleted_by_id" UUID;

DROP INDEX "contacts_workspace_id_phone_e164_key";
DROP INDEX "contacts_workspace_id_created_at_id_idx";

-- A phone number is unique only among active contacts. Historical soft-deleted
-- rows can retain their original number while a new active contact reuses it.
CREATE UNIQUE INDEX "contacts_workspace_active_phone_key"
ON "contacts"("workspace_id", "phone_e164")
WHERE "deleted_at" IS NULL;

CREATE INDEX "contacts_workspace_id_deleted_at_created_at_id_idx"
ON "contacts"("workspace_id", "deleted_at", "created_at", "id");
CREATE INDEX "contacts_deleted_by_id_idx" ON "contacts"("deleted_by_id");

ALTER TABLE "contacts"
ADD CONSTRAINT "contacts_deleted_by_id_fkey"
FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
