CREATE TABLE "platform_audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" VARCHAR(120) NOT NULL,
    "resource_type" VARCHAR(80) NOT NULL,
    "resource_id" UUID,
    "workspace_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_audit_logs_created_at_idx" ON "platform_audit_logs"("created_at");
CREATE INDEX "platform_audit_logs_actor_user_id_created_at_idx" ON "platform_audit_logs"("actor_user_id", "created_at");
CREATE INDEX "platform_audit_logs_resource_type_resource_id_created_at_idx" ON "platform_audit_logs"("resource_type", "resource_id", "created_at");

ALTER TABLE "platform_audit_logs"
ADD CONSTRAINT "platform_audit_logs_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
