ALTER TABLE "whatsapp_rate_cards"
  ADD CONSTRAINT "whatsapp_rate_cards_non_negative_money_chk"
    CHECK ("meta_rate" >= 0 AND "platform_fee" >= 0 AND "customer_rate" >= 0),
  ADD CONSTRAINT "whatsapp_rate_cards_date_range_chk"
    CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
  ADD CONSTRAINT "whatsapp_rate_cards_volume_range_chk"
    CHECK ("volume_tier_to" IS NULL OR ("volume_tier_from" IS NOT NULL AND "volume_tier_to" >= "volume_tier_from")),
  ADD CONSTRAINT "whatsapp_rate_cards_status_chk"
    CHECK ("status" IN ('ACTIVE', 'INACTIVE'));
