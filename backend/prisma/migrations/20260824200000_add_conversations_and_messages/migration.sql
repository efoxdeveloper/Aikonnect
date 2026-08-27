CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED');
CREATE TYPE "MessageDirection" AS ENUM ('INCOMING', 'OUTGOING');
CREATE TYPE "MessageStatus" AS ENUM ('SENT', 'DELIVERED', 'READ', 'FAILED');
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'LOCATION', 'CONTACT', 'INTERACTIVE');

CREATE TABLE "conversations" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "contact_id" UUID NOT NULL,
  "phone_number_id" UUID,
  "channel_key" VARCHAR(50) NOT NULL DEFAULT 'whatsapp',
  "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
  "unread_count" INTEGER NOT NULL DEFAULT 0,
  "last_message_preview" TEXT,
  "last_message_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "messages" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "contact_id" UUID NOT NULL,
  "meta_message_id" VARCHAR(200),
  "direction" "MessageDirection" NOT NULL,
  "type" "MessageType" NOT NULL,
  "status" "MessageStatus" NOT NULL DEFAULT 'SENT',
  "text" TEXT,
  "media_id" VARCHAR(255),
  "media_url" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "sent_at" TIMESTAMPTZ(3) NOT NULL,
  "delivered_at" TIMESTAMPTZ(3),
  "read_at" TIMESTAMPTZ(3),
  "failed_at" TIMESTAMPTZ(3),
  "failure_reason" TEXT,
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversations_workspace_id_contact_id_channel_key_key" ON "conversations"("workspace_id", "contact_id", "channel_key");
CREATE INDEX "conversations_workspace_id_status_last_message_at_id_idx" ON "conversations"("workspace_id", "status", "last_message_at", "id");
CREATE INDEX "conversations_workspace_id_contact_id_updated_at_id_idx" ON "conversations"("workspace_id", "contact_id", "updated_at", "id");
CREATE INDEX "conversations_phone_number_id_idx" ON "conversations"("phone_number_id");
CREATE UNIQUE INDEX "messages_workspace_id_meta_message_id_key" ON "messages"("workspace_id", "meta_message_id");
CREATE INDEX "messages_workspace_id_conversation_id_sent_at_id_idx" ON "messages"("workspace_id", "conversation_id", "sent_at", "id");
CREATE INDEX "messages_workspace_id_contact_id_sent_at_id_idx" ON "messages"("workspace_id", "contact_id", "sent_at", "id");
CREATE INDEX "messages_created_by_id_idx" ON "messages"("created_by_id");

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "conversations_phone_number_id_fkey" FOREIGN KEY ("phone_number_id") REFERENCES "whatsapp_phone_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "messages_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
