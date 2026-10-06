CREATE TYPE "ConversationAssignmentStrategy" AS ENUM ('AGENT', 'ROUND_ROBIN');

CREATE TABLE "conversation_assignment_rules" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "contact_tag_id" UUID,
    "phone_number_id" UUID,
    "strategy" "ConversationAssignmentStrategy" NOT NULL,
    "member_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    "round_robin_cursor" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "conversation_assignment_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversation_assignment_rules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "conversation_assignment_rules_phone_number_id_fkey" FOREIGN KEY ("phone_number_id") REFERENCES "whatsapp_phone_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "conversations"
    ADD COLUMN "assignee_membership_id" UUID,
    ADD COLUMN "assignment_rule_id" UUID,
    ADD COLUMN "assigned_at" TIMESTAMPTZ(3),
    ADD CONSTRAINT "conversations_assignee_membership_id_fkey" FOREIGN KEY ("assignee_membership_id") REFERENCES "workspace_members"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "conversations_assignment_rule_id_fkey" FOREIGN KEY ("assignment_rule_id") REFERENCES "conversation_assignment_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "conversation_assignment_rules_workspace_id_enabled_priority_idx" ON "conversation_assignment_rules"("workspace_id", "enabled", "priority");
CREATE INDEX "conversations_workspace_assignee_membership_id_status_last_message_at_idx" ON "conversations"("workspace_id", "assignee_membership_id", "status", "last_message_at" DESC);
