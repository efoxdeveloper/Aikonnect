-- AlterTable
ALTER TABLE "workspaces"
ADD COLUMN "onboarding_data" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "workspaces"
ADD COLUMN "onboarding_step" INTEGER NOT NULL DEFAULT 0;
