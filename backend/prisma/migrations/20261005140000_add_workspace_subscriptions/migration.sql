CREATE TYPE "WorkspaceSubscriptionStatus" AS ENUM (
    'TRIALING',
    'ACTIVE',
    'PAST_DUE',
    'CANCELED',
    'EXPIRED',
    'INCOMPLETE'
);

CREATE TYPE "SubscriptionBillingPeriod" AS ENUM ('MONTHLY', 'ANNUAL');

CREATE TABLE "workspace_subscriptions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "plan_id" UUID,
    "plan_name" VARCHAR(100) NOT NULL,
    "status" "WorkspaceSubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "billing_period" "SubscriptionBillingPeriod" NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "amount_minor_units" BIGINT NOT NULL,
    "started_at" TIMESTAMPTZ(3),
    "trial_ends_at" TIMESTAMPTZ(3),
    "current_period_starts_at" TIMESTAMPTZ(3),
    "current_period_ends_at" TIMESTAMPTZ(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "canceled_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workspace_subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspace_subscriptions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workspace_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "workspace_subscriptions_workspace_id_created_at_idx" ON "workspace_subscriptions"("workspace_id", "created_at" DESC);
CREATE INDEX "workspace_subscriptions_workspace_id_status_idx" ON "workspace_subscriptions"("workspace_id", "status");
CREATE INDEX "workspace_subscriptions_plan_id_idx" ON "workspace_subscriptions"("plan_id");
