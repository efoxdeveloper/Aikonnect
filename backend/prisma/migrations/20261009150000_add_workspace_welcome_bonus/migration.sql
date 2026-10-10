ALTER TABLE "workspaces"
  ADD COLUMN "welcome_bonus_granted_at" TIMESTAMPTZ(3),
  ADD COLUMN "welcome_bonus_celebrated_at" TIMESTAMPTZ(3);

CREATE TABLE "platform_configuration" (
  "id" VARCHAR(40) NOT NULL DEFAULT 'default',
  "welcome_bonus_amount" DECIMAL(18,2) NOT NULL DEFAULT 400,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_configuration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_configuration_welcome_bonus_amount_check" CHECK ("welcome_bonus_amount" >= 0)
);

INSERT INTO "platform_configuration" ("id", "welcome_bonus_amount")
VALUES ('default', 400)
ON CONFLICT ("id") DO NOTHING;
