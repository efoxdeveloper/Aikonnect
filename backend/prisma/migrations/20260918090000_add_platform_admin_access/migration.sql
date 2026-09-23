-- Platform access is intentionally separate from workspace roles.
CREATE TYPE "PlatformRole" AS ENUM ('NONE', 'SUPPORT', 'OPERATIONS', 'BILLING', 'ADMIN', 'SUPER_ADMIN');

ALTER TABLE "users"
ADD COLUMN "platform_role" "PlatformRole" NOT NULL DEFAULT 'NONE';
