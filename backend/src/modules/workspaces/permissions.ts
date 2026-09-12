import type { Prisma } from "../../generated/prisma/client.js";
import { toSlug } from "../../utils/slug.js";

export const PERMISSIONS = {
  WORKSPACE_READ: "workspace.read",
  WORKSPACE_UPDATE: "workspace.update",
  WORKSPACE_DELETE: "workspace.delete",
  CONTACTS_READ: "contacts.read",
  CONTACTS_EXPORT: "contacts.export",
  CONTACTS_CREATE: "contacts.create",
  CONTACTS_UPDATE: "contacts.update",
  CONTACTS_DELETE: "contacts.delete",
  CONTACTS_BULK_TAG: "contacts.bulk_tag",
  CONTACTS_PHONE_VIEW: "contacts.phone.view",
  CONTACTS_FIELDS_VIEW: "contacts.fields.view",
  INBOX_READ: "inbox.read",
  CONVERSATIONS_REPLY: "conversations.reply",
  CONVERSATIONS_ASSIGN: "conversations.assign",
  CONVERSATIONS_MANAGE: "conversations.manage",
  CAMPAIGNS_READ: "campaigns.read",
  CAMPAIGNS_CREATE: "campaigns.create",
  CAMPAIGNS_SEND: "campaigns.send",
  CAMPAIGNS_DELETE: "campaigns.delete",
  TEMPLATES_READ: "templates.read",
  TEMPLATES_MANAGE: "templates.manage",
  AUTOMATIONS_READ: "automations.read",
  AUTOMATIONS_MANAGE: "automations.manage",
  REPORTS_READ: "reports.read",
  REPORTS_EXPORT: "reports.export",
  WHATSAPP_READ: "whatsapp.read",
  WHATSAPP_MANAGE: "whatsapp.manage",
  BILLING_READ: "billing.read",
  BILLING_MANAGE: "billing.manage",
  MEMBERS_READ: "members.read",
  MEMBERS_INVITE: "members.invite",
  MEMBERS_MANAGE: "members.manage",
  MEMBERS_REMOVE: "members.remove",
  ROLES_READ: "roles.read",
  ROLES_MANAGE: "roles.manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type PermissionDefinition = {
  key: PermissionKey;
  label: string;
  description: string;
  group: "contacts" | "contact-data" | "inbox" | "marketing" | "automation-reports" | "workspace";
};

export const permissionDefinitions: PermissionDefinition[] = [
  { key: PERMISSIONS.CONTACTS_READ, label: "Access Contact Hub", description: "View contacts and their activity.", group: "contacts" },
  { key: PERMISSIONS.CONTACTS_EXPORT, label: "Export contacts", description: "Export contact lists from the workspace.", group: "contacts" },
  { key: PERMISSIONS.CONTACTS_CREATE, label: "Add contacts", description: "Create individual contacts and import contact lists.", group: "contacts" },
  { key: PERMISSIONS.CONTACTS_UPDATE, label: "Edit contacts", description: "Update contact details and attributes.", group: "contacts" },
  { key: PERMISSIONS.CONTACTS_DELETE, label: "Delete contacts", description: "Permanently remove contacts from the workspace.", group: "contacts" },
  { key: PERMISSIONS.CONTACTS_BULK_TAG, label: "Bulk tag contacts", description: "Add or remove tags from multiple contacts.", group: "contacts" },
  { key: PERMISSIONS.CONTACTS_PHONE_VIEW, label: "View contact phone numbers", description: "Show phone numbers throughout inbox, contacts and reports.", group: "contact-data" },
  { key: PERMISSIONS.CONTACTS_FIELDS_VIEW, label: "View contact field data", description: "Show custom contact fields and their values.", group: "contact-data" },
  { key: PERMISSIONS.INBOX_READ, label: "Access shared inbox", description: "View conversations available to this role.", group: "inbox" },
  { key: PERMISSIONS.CONVERSATIONS_REPLY, label: "Reply to conversations", description: "Send messages from the shared inbox.", group: "inbox" },
  { key: PERMISSIONS.CONVERSATIONS_ASSIGN, label: "Assign conversations", description: "Assign conversations to teammates and teams.", group: "inbox" },
  { key: PERMISSIONS.CONVERSATIONS_MANAGE, label: "Manage conversations", description: "Close, reopen and manage conversation status.", group: "inbox" },
  { key: PERMISSIONS.CAMPAIGNS_READ, label: "View campaigns", description: "View campaign configuration and performance.", group: "marketing" },
  { key: PERMISSIONS.CAMPAIGNS_CREATE, label: "Create campaigns", description: "Create and edit campaign drafts.", group: "marketing" },
  { key: PERMISSIONS.CAMPAIGNS_SEND, label: "Send campaigns", description: "Schedule and send campaigns to contacts.", group: "marketing" },
  { key: PERMISSIONS.CAMPAIGNS_DELETE, label: "Delete campaigns", description: "Delete campaign drafts and history where allowed.", group: "marketing" },
  { key: PERMISSIONS.TEMPLATES_READ, label: "View message templates", description: "View WhatsApp message templates and status.", group: "marketing" },
  { key: PERMISSIONS.TEMPLATES_MANAGE, label: "Manage message templates", description: "Create, edit and submit templates to Meta.", group: "marketing" },
  { key: PERMISSIONS.AUTOMATIONS_READ, label: "View automations", description: "View automation rules and execution history.", group: "automation-reports" },
  { key: PERMISSIONS.AUTOMATIONS_MANAGE, label: "Manage automations", description: "Create, edit, enable and disable automations.", group: "automation-reports" },
  { key: PERMISSIONS.REPORTS_READ, label: "View reports", description: "Access workspace analytics and reports.", group: "automation-reports" },
  { key: PERMISSIONS.REPORTS_EXPORT, label: "Export reports", description: "Download analytics and report data.", group: "automation-reports" },
  { key: PERMISSIONS.WORKSPACE_READ, label: "View workspace settings", description: "View workspace details and configuration.", group: "workspace" },
  { key: PERMISSIONS.WORKSPACE_UPDATE, label: "Manage workspace settings", description: "Update workspace details and configuration.", group: "workspace" },
  { key: PERMISSIONS.WHATSAPP_READ, label: "View WhatsApp account", description: "View connected business accounts and phone numbers.", group: "workspace" },
  { key: PERMISSIONS.WHATSAPP_MANAGE, label: "Manage WhatsApp account", description: "Connect and configure WhatsApp business assets.", group: "workspace" },
  { key: PERMISSIONS.MEMBERS_READ, label: "View team members", description: "View workspace members and invitations.", group: "workspace" },
  { key: PERMISSIONS.MEMBERS_INVITE, label: "Invite team members", description: "Invite people to join the workspace.", group: "workspace" },
  { key: PERMISSIONS.MEMBERS_MANAGE, label: "Manage team members", description: "Change member roles and status.", group: "workspace" },
  { key: PERMISSIONS.MEMBERS_REMOVE, label: "Remove team members", description: "Remove members from the workspace.", group: "workspace" },
  { key: PERMISSIONS.ROLES_READ, label: "View roles and permissions", description: "View role definitions and access levels.", group: "workspace" },
  { key: PERMISSIONS.ROLES_MANAGE, label: "Manage roles and permissions", description: "Create roles and change their permissions.", group: "workspace" },
  { key: PERMISSIONS.BILLING_READ, label: "View billing", description: "View plan, invoices and usage.", group: "workspace" },
  { key: PERMISSIONS.BILLING_MANAGE, label: "Manage billing", description: "Change plans and payment details.", group: "workspace" },
  { key: PERMISSIONS.WORKSPACE_DELETE, label: "Delete workspace", description: "Permanently delete the workspace and its data.", group: "workspace" },
];

const allPermissionKeys = permissionDefinitions.map(({ key }) => key);

const defaultRoles: Array<{
  name: string;
  slug: string;
  description: string;
  permissions: PermissionKey[];
}> = [
  {
    name: "Owner",
    slug: "owner",
    description: "Full workspace access, including ownership-only operations",
    permissions: allPermissionKeys,
  },
  {
    name: "Admin",
    slug: "admin",
    description: "Manage the workspace and its members",
    permissions: allPermissionKeys.filter(
      (key) =>
        key !== PERMISSIONS.WORKSPACE_DELETE &&
        key !== PERMISSIONS.ROLES_MANAGE &&
        key !== PERMISSIONS.BILLING_MANAGE,
    ),
  },
  {
    name: "Teammate",
    slug: "teammate",
    description: "Standard access to workspace resources and member directory",
    permissions: [
      PERMISSIONS.WORKSPACE_READ,
      PERMISSIONS.MEMBERS_READ,
      PERMISSIONS.ROLES_READ,
      PERMISSIONS.CONTACTS_READ,
      PERMISSIONS.CONTACTS_CREATE,
      PERMISSIONS.CONTACTS_UPDATE,
      PERMISSIONS.CONTACTS_BULK_TAG,
      PERMISSIONS.CONTACTS_PHONE_VIEW,
      PERMISSIONS.CONTACTS_FIELDS_VIEW,
      PERMISSIONS.INBOX_READ,
      PERMISSIONS.CONVERSATIONS_REPLY,
      PERMISSIONS.CONVERSATIONS_ASSIGN,
      PERMISSIONS.CAMPAIGNS_READ,
      PERMISSIONS.TEMPLATES_READ,
      PERMISSIONS.AUTOMATIONS_READ,
      PERMISSIONS.REPORTS_READ,
      PERMISSIONS.WHATSAPP_READ,
    ],
  },
  {
    name: "Viewer",
    slug: "viewer",
    description: "Read-only workspace access",
    permissions: [
      PERMISSIONS.WORKSPACE_READ,
      PERMISSIONS.CONTACTS_READ,
      PERMISSIONS.CONTACTS_PHONE_VIEW,
      PERMISSIONS.CONTACTS_FIELDS_VIEW,
      PERMISSIONS.INBOX_READ,
      PERMISSIONS.CAMPAIGNS_READ,
      PERMISSIONS.TEMPLATES_READ,
      PERMISSIONS.AUTOMATIONS_READ,
      PERMISSIONS.REPORTS_READ,
      PERMISSIONS.WHATSAPP_READ,
    ],
  },
];

type WorkspaceDetails = {
  name: string;
  companyName?: string;
  industry?: string;
  companyWebsite?: string;
  companyLocation?: string;
  annualRevenue?: string;
};

async function createUniqueWorkspaceSlug(
  transaction: Prisma.TransactionClient,
  name: string,
): Promise<string> {
  const base = toSlug(name) || "workspace";
  let candidate = base;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const existing = await transaction.workspace.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base}-${Math.random().toString(36).slice(2, 8)}`;
  }

  throw new Error("Unable to generate a unique workspace slug");
}

export async function createWorkspaceWithDefaults(
  transaction: Prisma.TransactionClient,
  ownerId: string,
  details: WorkspaceDetails,
) {
  await transaction.permission.createMany({
    data: permissionDefinitions.map(({ key, description }) => ({ key, description })),
    skipDuplicates: true,
  });

  const permissions = await transaction.permission.findMany({
    where: { key: { in: allPermissionKeys } },
    select: { id: true, key: true },
  });
  const permissionIds = new Map(permissions.map((permission) => [permission.key, permission.id]));
  const slug = await createUniqueWorkspaceSlug(transaction, details.name);
  const workspace = await transaction.workspace.create({
    data: {
      name: details.name,
      slug,
      companyName: details.companyName,
      industry: details.industry,
      companyWebsite: details.companyWebsite,
      companyLocation: details.companyLocation,
      annualRevenue: details.annualRevenue,
      ownerId,
    },
  });

  await transaction.workspaceSetupProgress.create({
    data: { workspaceId: workspace.id },
  });

  let ownerRoleId = "";
  for (const roleDefinition of defaultRoles) {
    const role = await transaction.role.create({
      data: {
        workspaceId: workspace.id,
        name: roleDefinition.name,
        slug: roleDefinition.slug,
        description: roleDefinition.description,
        isSystem: true,
        permissions: {
          create: roleDefinition.permissions.map((key) => ({
            permissionId: permissionIds.get(key) as string,
          })),
        },
      },
    });
    if (role.slug === "owner") ownerRoleId = role.id;
  }

  if (!ownerRoleId) throw new Error("The owner role could not be initialized");
  const membership = await transaction.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: ownerId, roleId: ownerRoleId },
  });

  return { workspace, membership };
}
