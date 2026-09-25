CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "whatsapp_rate_cards" (
    "id" UUID NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "country_name" VARCHAR(100) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "pricing_type" VARCHAR(60) NOT NULL,
    "meta_rate" DECIMAL(18,6) NOT NULL,
    "platform_fee" DECIMAL(18,6) NOT NULL,
    "customer_rate" DECIMAL(18,6) NOT NULL,
    "volume_tier_from" BIGINT,
    "volume_tier_to" BIGINT,
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "effective_to" TIMESTAMPTZ(3),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "source" VARCHAR(40) NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_rate_cards_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "whatsapp_rate_cards"
    ADD CONSTRAINT "whatsapp_rate_cards_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "whatsapp_rate_cards"
    ADD CONSTRAINT "whatsapp_rate_cards_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "whatsapp_rate_cards_country_category_type_status_idx"
    ON "whatsapp_rate_cards"("country_code", "category", "pricing_type", "status");
CREATE INDEX "whatsapp_rate_cards_effective_dates_idx"
    ON "whatsapp_rate_cards"("effective_from", "effective_to");
CREATE INDEX "whatsapp_rate_cards_volume_lookup_idx"
    ON "whatsapp_rate_cards"("country_code", "category", "pricing_type", "volume_tier_from", "volume_tier_to");
CREATE INDEX "whatsapp_rate_cards_status_dates_idx"
    ON "whatsapp_rate_cards"("status", "effective_from", "effective_to");
CREATE INDEX "whatsapp_rate_cards_created_by_idx" ON "whatsapp_rate_cards"("created_by");
CREATE INDEX "whatsapp_rate_cards_updated_by_idx" ON "whatsapp_rate_cards"("updated_by");

ALTER TABLE "whatsapp_rate_cards"
    ADD CONSTRAINT "whatsapp_rate_cards_active_non_overlap_excl"
    EXCLUDE USING gist (
      "country_code" WITH =,
      "category" WITH =,
      "pricing_type" WITH =,
      tstzrange("effective_from", COALESCE("effective_to", 'infinity'::timestamptz), '[)') WITH &&,
      int8range(COALESCE("volume_tier_from", 0),
        CASE WHEN "volume_tier_to" IS NULL THEN NULL ELSE "volume_tier_to" + 1 END, '[)') WITH &&
    ) WHERE ("status" = 'ACTIVE');

ALTER TABLE "messages"
    ADD COLUMN "rate_card_id" UUID,
    ADD COLUMN "pricing_country" CHAR(2),
    ADD COLUMN "pricing_category" VARCHAR(40),
    ADD COLUMN "pricing_type" VARCHAR(60),
    ADD COLUMN "meta_cost" DECIMAL(18,6),
    ADD COLUMN "platform_fee" DECIMAL(18,6),
    ADD COLUMN "customer_cost" DECIMAL(18,6),
    ADD COLUMN "pricing_currency" CHAR(3),
    ADD COLUMN "pricing_effective_date" TIMESTAMPTZ(3),
    ADD COLUMN "billing_status" VARCHAR(20) NOT NULL DEFAULT 'NOT_APPLICABLE';

ALTER TABLE "messages"
    ADD CONSTRAINT "messages_rate_card_id_fkey"
    FOREIGN KEY ("rate_card_id") REFERENCES "whatsapp_rate_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "messages_workspace_billing_status_sent_at_idx"
    ON "messages"("workspace_id", "billing_status", "sent_at");
CREATE INDEX "messages_rate_card_id_idx" ON "messages"("rate_card_id");
