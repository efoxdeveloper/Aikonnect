-- Add feature-level permissions used by configurable workspace roles.
INSERT INTO "permissions" ("id", "key", "description") VALUES
('10000000-0000-4000-8000-000000000001', 'contacts.read', 'View contacts and their activity'),
('10000000-0000-4000-8000-000000000002', 'contacts.export', 'Export contact lists from the workspace'),
('10000000-0000-4000-8000-000000000003', 'contacts.create', 'Create individual contacts and import contact lists'),
('10000000-0000-4000-8000-000000000004', 'contacts.update', 'Update contact details and attributes'),
('10000000-0000-4000-8000-000000000005', 'contacts.delete', 'Permanently remove contacts from the workspace'),
('10000000-0000-4000-8000-000000000006', 'contacts.bulk_tag', 'Add or remove tags from multiple contacts'),
('10000000-0000-4000-8000-000000000007', 'contacts.phone.view', 'Show phone numbers throughout contacts and reports'),
('10000000-0000-4000-8000-000000000008', 'contacts.fields.view', 'Show custom contact fields and their values'),
('10000000-0000-4000-8000-000000000009', 'inbox.read', 'View conversations available to this role'),
('10000000-0000-4000-8000-000000000010', 'conversations.reply', 'Send messages from the shared inbox'),
('10000000-0000-4000-8000-000000000011', 'conversations.assign', 'Assign conversations to teammates and teams'),
('10000000-0000-4000-8000-000000000012', 'conversations.manage', 'Close, reopen and manage conversation status'),
('10000000-0000-4000-8000-000000000013', 'campaigns.read', 'View campaign configuration and performance'),
('10000000-0000-4000-8000-000000000014', 'campaigns.create', 'Create and edit campaign drafts'),
('10000000-0000-4000-8000-000000000015', 'campaigns.send', 'Schedule and send campaigns to contacts'),
('10000000-0000-4000-8000-000000000016', 'campaigns.delete', 'Delete campaign drafts and history where allowed'),
('10000000-0000-4000-8000-000000000017', 'templates.read', 'View WhatsApp message templates and status'),
('10000000-0000-4000-8000-000000000018', 'templates.manage', 'Create, edit and submit templates to Meta'),
('10000000-0000-4000-8000-000000000019', 'automations.read', 'View automation rules and execution history'),
('10000000-0000-4000-8000-000000000020', 'automations.manage', 'Create, edit, enable and disable automations'),
('10000000-0000-4000-8000-000000000021', 'reports.read', 'Access workspace analytics and reports'),
('10000000-0000-4000-8000-000000000022', 'reports.export', 'Download analytics and report data'),
('10000000-0000-4000-8000-000000000023', 'whatsapp.read', 'View connected business accounts and phone numbers'),
('10000000-0000-4000-8000-000000000024', 'whatsapp.manage', 'Connect and configure WhatsApp business assets'),
('10000000-0000-4000-8000-000000000025', 'billing.read', 'View plan, invoices and usage'),
('10000000-0000-4000-8000-000000000026', 'billing.manage', 'Change plans and payment details')
ON CONFLICT ("key") DO NOTHING;

-- Rename the standard Member role to the product-facing Teammate name where safe.
UPDATE "roles" AS role
SET "name" = 'Teammate', "slug" = 'teammate', "updated_at" = CURRENT_TIMESTAMP
WHERE role."slug" = 'member'
  AND NOT EXISTS (
    SELECT 1 FROM "roles" AS existing
    WHERE existing."workspace_id" = role."workspace_id" AND existing."slug" = 'teammate'
  );

-- Owners always retain the complete permission catalog.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "roles" AS role
CROSS JOIN "permissions" AS permission
WHERE role."slug" = 'owner'
ON CONFLICT DO NOTHING;

-- Admins receive operational permissions but not ownership, role or billing control.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "roles" AS role
CROSS JOIN "permissions" AS permission
WHERE role."slug" = 'admin'
  AND permission."key" NOT IN ('workspace.delete', 'roles.manage', 'billing.manage')
ON CONFLICT DO NOTHING;

-- Teammates receive the standard day-to-day operational set.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "roles" AS role
JOIN "permissions" AS permission ON permission."key" IN (
  'workspace.read', 'members.read', 'roles.read',
  'contacts.read', 'contacts.create', 'contacts.update', 'contacts.bulk_tag',
  'contacts.phone.view', 'contacts.fields.view', 'inbox.read',
  'conversations.reply', 'conversations.assign', 'campaigns.read',
  'templates.read', 'automations.read', 'reports.read', 'whatsapp.read'
)
WHERE role."slug" IN ('teammate', 'member')
ON CONFLICT DO NOTHING;

-- Viewers retain read-only access across business modules.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "roles" AS role
JOIN "permissions" AS permission ON permission."key" IN (
  'workspace.read', 'contacts.read', 'contacts.phone.view', 'contacts.fields.view',
  'inbox.read', 'campaigns.read', 'templates.read', 'automations.read',
  'reports.read', 'whatsapp.read'
)
WHERE role."slug" = 'viewer'
ON CONFLICT DO NOTHING;
