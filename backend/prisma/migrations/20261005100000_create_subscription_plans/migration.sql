CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000),
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "monthly_price_minor_units" BIGINT NOT NULL DEFAULT 0,
    "annual_price_minor_units" BIGINT NOT NULL DEFAULT 0,
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "max_seats" INTEGER,
    "max_contacts" INTEGER,
    "max_campaigns_per_month" INTEGER,
    "max_automations" INTEGER,
    "max_workflows" INTEGER,
    "max_pipelines" INTEGER,
    "api_access" BOOLEAN NOT NULL DEFAULT false,
    "webhooks" BOOLEAN NOT NULL DEFAULT false,
    "advanced_reports" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_plans_slug_key" ON "subscription_plans"("slug");
CREATE INDEX "subscription_plans_active_display_order_idx" ON "subscription_plans"("active", "display_order");
