CREATE TYPE "PlanRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "plan_requests" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "plan_id" UUID,
    "requested_by_user_id" UUID NOT NULL,
    "reviewed_by_user_id" UUID,
    "subscription_id" UUID,
    "plan_name" VARCHAR(100) NOT NULL,
    "billing_period" "SubscriptionBillingPeriod" NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "amount_minor_units" BIGINT NOT NULL,
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "status" "PlanRequestStatus" NOT NULL DEFAULT 'PENDING',
    "customer_note" VARCHAR(1000),
    "admin_note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "decided_at" TIMESTAMPTZ(3),

    CONSTRAINT "plan_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plan_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "plan_requests_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "plan_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "plan_requests_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "plan_requests_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "workspace_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "plan_requests_subscription_id_key" ON "plan_requests"("subscription_id");
CREATE INDEX "plan_requests_status_created_at_idx" ON "plan_requests"("status", "created_at" DESC);
CREATE INDEX "plan_requests_workspace_id_created_at_idx" ON "plan_requests"("workspace_id", "created_at" DESC);
CREATE INDEX "plan_requests_plan_id_idx" ON "plan_requests"("plan_id");
