-- Keep current consent state queryable while retaining an immutable audit trail.
ALTER TABLE "contacts"
  ADD COLUMN "whatsapp_opt_in_source" VARCHAR(100),
  ADD COLUMN "whatsapp_opted_in_at" TIMESTAMPTZ(3),
  ADD COLUMN "whatsapp_opt_out_source" VARCHAR(100),
  ADD COLUMN "whatsapp_opted_out_at" TIMESTAMPTZ(3),
  ADD COLUMN "marketing_blocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "marketing_blocked_at" TIMESTAMPTZ(3),
  ADD COLUMN "marketing_block_source" VARCHAR(100),
  ADD COLUMN "marketing_block_reason" VARCHAR(500);

UPDATE "contacts"
SET
  "whatsapp_opt_in_source" = CASE WHEN "whatsapp_opted" THEN 'Legacy import' END,
  "whatsapp_opted_in_at" = CASE WHEN "whatsapp_opted" THEN "created_at" END,
  "whatsapp_opt_out_source" = CASE WHEN NOT "whatsapp_opted" THEN 'Legacy import' END,
  "whatsapp_opted_out_at" = CASE WHEN NOT "whatsapp_opted" THEN "updated_at" END,
  "marketing_blocked" = NOT "whatsapp_opted",
  "marketing_blocked_at" = CASE WHEN NOT "whatsapp_opted" THEN "updated_at" END,
  "marketing_block_source" = CASE WHEN NOT "whatsapp_opted" THEN 'WhatsApp opt-out' END,
  "marketing_block_reason" = CASE WHEN NOT "whatsapp_opted" THEN 'Contact was already opted out when consent tracking was introduced' END;

CREATE TYPE "ContactConsentEventType" AS ENUM ('OPT_IN', 'OPT_OUT', 'BLOCK', 'UNBLOCK');

CREATE TABLE "contact_consent_events" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "contact_id" UUID NOT NULL,
  "type" "ContactConsentEventType" NOT NULL,
  "source" VARCHAR(100) NOT NULL,
  "reason" VARCHAR(500),
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "actor_user_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_consent_events_pkey" PRIMARY KEY ("id")
);

INSERT INTO "contact_consent_events" ("id", "workspace_id", "contact_id", "type", "source", "reason", "occurred_at")
SELECT
  gen_random_uuid(),
  "workspace_id",
  "id",
  CASE WHEN "whatsapp_opted" THEN 'OPT_IN'::"ContactConsentEventType" ELSE 'OPT_OUT'::"ContactConsentEventType" END,
  'Legacy import',
  'Consent state backfilled when consent tracking was introduced',
  CASE WHEN "whatsapp_opted" THEN "created_at" ELSE "updated_at" END
FROM "contacts";

CREATE INDEX "contacts_workspace_id_deleted_at_whatsapp_opted_marketing_b_idx"
  ON "contacts"("workspace_id", "deleted_at", "whatsapp_opted", "marketing_blocked", "id");
CREATE INDEX "contact_consent_events_workspace_id_contact_id_occurred_at_idx"
  ON "contact_consent_events"("workspace_id", "contact_id", "occurred_at", "id");
CREATE INDEX "contact_consent_events_actor_user_id_idx"
  ON "contact_consent_events"("actor_user_id");

ALTER TABLE "contact_consent_events"
  ADD CONSTRAINT "contact_consent_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "contact_consent_events_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "contact_consent_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
