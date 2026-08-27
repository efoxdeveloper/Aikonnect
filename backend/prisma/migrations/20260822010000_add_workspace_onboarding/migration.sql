-- AlterTable
ALTER TABLE "workspaces"
ADD COLUMN "country" VARCHAR(100),
ADD COLUMN "timezone" VARCHAR(100),
ADD COLUMN "onboarding_completed_at" TIMESTAMPTZ(3);
