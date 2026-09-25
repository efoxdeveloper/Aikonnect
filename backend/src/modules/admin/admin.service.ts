import { env } from "../../config/env.js";
import { checkDatabaseConnection, prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { Prisma, type Prisma as PrismaTypes } from "../../generated/prisma/client.js";
import type { Request } from "express";
import type { AdminAuditQuery, AdminListQuery, AdminUserAction } from "./admin.schemas.js";
import type { PlatformRole } from "../../middleware/platform-access.js";
import { minorUnitsToAmount } from "../wallet/wallet.service.js";

function pagination(total: number, query: AdminListQuery) {
  return { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)), hasNext: query.page * query.pageSize < total, hasPrevious: query.page > 1 };
}

export async function getOverview() {
  const [usersByStatus, workspaces, connectedWhatsAppAccounts, activeSessions, accountsByStatus, recentWorkspaces] = await Promise.all([
    prisma.user.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.workspace.count(),
    prisma.whatsAppBusinessAccount.count({ where: { status: "CONNECTED" } }),
    prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.whatsAppBusinessAccount.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.workspace.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, name: true, slug: true, createdAt: true, onboardingCompletedAt: true, owner: { select: { email: true, firstName: true, lastName: true } }, _count: { select: { memberships: true, contacts: true, messages: true, whatsappBusinessAccounts: true } } } }),
  ]);
  return {
    users: Object.fromEntries(usersByStatus.map(({ status, _count }) => [status.toLowerCase(), _count._all])),
    workspaces, connectedWhatsAppAccounts, activeSessions,
    whatsappAccountsByStatus: Object.fromEntries(accountsByStatus.map(({ status, _count }) => [status.toLowerCase(), _count._all])),
    recentWorkspaces: recentWorkspaces.map((workspace) => ({ ...workspace, createdAt: workspace.createdAt.toISOString(), ownerName: `${workspace.owner.firstName} ${workspace.owner.lastName}`.trim(), status: workspace.onboardingCompletedAt ? "ACTIVE" : "ONBOARDING" })),
  };
}

export async function listWorkspaces(query: AdminListQuery) {
  const where: PrismaTypes.WorkspaceWhereInput = query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { slug: { contains: query.search, mode: "insensitive" } }, { companyName: { contains: query.search, mode: "insensitive" } }, { owner: { email: { contains: query.search, mode: "insensitive" } } }] } : {};
  const [total, items] = await Promise.all([
    prisma.workspace.count({ where }),
    prisma.workspace.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, select: { id: true, name: true, slug: true, companyName: true, industry: true, country: true, timezone: true, createdAt: true, updatedAt: true, onboardingCompletedAt: true, owner: { select: { id: true, email: true, firstName: true, lastName: true, status: true } }, setupProgress: { select: { completedAt: true, whatsappConnectedAt: true, phoneNumberConnectedAt: true, testMessageSentAt: true } }, _count: { select: { memberships: true, contacts: true, messages: true, conversations: true, templates: true, whatsappBusinessAccounts: true, webhookEndpoints: true } } } }),
  ]);
  return { items: items.map((workspace) => ({ ...workspace, createdAt: workspace.createdAt.toISOString(), updatedAt: workspace.updatedAt.toISOString(), onboardingCompletedAt: workspace.onboardingCompletedAt?.toISOString() ?? null, status: workspace.onboardingCompletedAt ? "ACTIVE" : "ONBOARDING" })), pagination: pagination(total, query) };
}

export async function listUsers(query: AdminListQuery, baseWhere: PrismaTypes.UserWhereInput = {}) {
  const where: PrismaTypes.UserWhereInput = { AND: [baseWhere, query.search ? { OR: [{ email: { contains: query.search, mode: "insensitive" } }, { firstName: { contains: query.search, mode: "insensitive" } }, { lastName: { contains: query.search, mode: "insensitive" } }] } : {}] };
  const [total, active, verified, googleSignups, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count({ where: { AND: [where, { status: "ACTIVE" }] } }),
    prisma.user.count({ where: { AND: [where, { emailVerifiedAt: { not: null } }] } }),
    prisma.user.count({ where: { AND: [where, { oauthAccounts: { some: { provider: "google" } } }] } }),
    prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, select: { id: true, email: true, firstName: true, lastName: true, phone: true, status: true, platformRole: true, emailVerifiedAt: true, lastLoginAt: true, createdAt: true, oauthAccounts: { select: { provider: true }, orderBy: { createdAt: "asc" }, take: 1 }, memberships: { select: { status: true, workspace: { select: { id: true, name: true } }, role: { select: { name: true, slug: true } } } }, _count: { select: { memberships: true, sessions: true } } } }),
  ]);
  return { items: items.map(({ oauthAccounts, ...user }) => ({ ...user, signupSource: oauthAccounts[0]?.provider === "google" ? "Google signup" : "Manual signup", emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null, lastLoginAt: user.lastLoginAt?.toISOString() ?? null, createdAt: user.createdAt.toISOString() })), pagination: pagination(total, query), summary: { total, active, verified, googleSignups } };
}

export async function listPlatformAdmins(query: AdminListQuery) {
  return listUsers(query, { platformRole: { not: "NONE" } });
}

export async function performUserAction(userId: string, actorUserId: string, actorRole: PlatformRole, action: AdminUserAction, confirmation?: string) {
  if (actorRole !== "ADMIN" && actorRole !== "SUPER_ADMIN") throw new AppError(403, "Only platform administrators can manage users", "PLATFORM_USER_ACTION_DENIED");
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, status: true, platformRole: true } });
  if (!target) throw new AppError(404, "The user was not found", "USER_NOT_FOUND");
  if (target.id === actorUserId) throw new AppError(400, "You cannot perform this action on your own account", "SELF_ACTION_DENIED");
  if (target.platformRole !== "NONE") throw new AppError(403, "Platform administrator accounts are protected", "PLATFORM_ADMIN_ACTION_DENIED");

  const audit = (nextStatus: string | null) => prisma.platformAuditLog.create({ data: { actorUserId, action: `USER_${action}`, resourceType: "user", resourceId: userId, metadata: { email: target.email, previousStatus: target.status, nextStatus } } });

  if (action === "DELETE") {
    if (confirmation !== target.email) throw new AppError(400, `Type ${target.email} to confirm permanent deletion`, "DELETE_CONFIRMATION_REQUIRED");
    const [ownedWorkspaces, sentInvitations, auditEvents] = await Promise.all([
      prisma.workspace.count({ where: { ownerId: userId } }),
      prisma.workspaceInvitation.count({ where: { invitedById: userId } }),
      prisma.platformAuditLog.count({ where: { actorUserId: userId } }),
    ]);
    if (ownedWorkspaces > 0) throw new AppError(409, "Transfer or delete this user's owned workspaces before deleting the account", "USER_OWNS_WORKSPACES");
    if (sentInvitations > 0) throw new AppError(409, "This user has sent workspace invitations and cannot be deleted yet", "USER_HAS_INVITATIONS");
    if (auditEvents > 0) throw new AppError(409, "This user has platform audit history and cannot be deleted", "USER_HAS_AUDIT_HISTORY");
    await prisma.$transaction([audit(null), prisma.user.delete({ where: { id: userId } })]);
    return { id: userId, action, deleted: true };
  }

  const nextStatus = action === "ACTIVATE" ? "ACTIVE" : action === "SUSPEND" ? "SUSPENDED" : "DISABLED";
  const revokeSessions = action === "SUSPEND" || action === "BLOCK";
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { status: nextStatus } }),
    ...(revokeSessions ? [prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })] : []),
    audit(nextStatus),
  ]);
  return { id: userId, action, status: nextStatus, deleted: false };
}

export async function listWhatsAppConnections(query: AdminListQuery) {
  const where: PrismaTypes.WhatsAppBusinessAccountWhereInput = query.search ? { OR: [{ displayName: { contains: query.search, mode: "insensitive" } }, { metaBusinessId: { contains: query.search, mode: "insensitive" } }, { metaWabaId: { contains: query.search, mode: "insensitive" } }, { workspace: { name: { contains: query.search, mode: "insensitive" } } }] } : {};
  const [total, items] = await Promise.all([
    prisma.whatsAppBusinessAccount.count({ where }),
    prisma.whatsAppBusinessAccount.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, select: { id: true, displayName: true, metaBusinessId: true, metaWabaId: true, status: true, connectedAt: true, lastSyncedAt: true, lastError: true, sharedBillingStatus: true, sharedBillingAllocationId: true, workspace: { select: { id: true, name: true, slug: true } }, phoneNumbers: { select: { id: true, displayPhoneNumber: true, verifiedName: true, status: true, qualityRating: true, messagingLimit: true, isOnBusinessApp: true, platformType: true, lastSyncedAt: true } } } }),
  ]);
  return { items: items.map((item) => ({ ...item, connectedAt: item.connectedAt?.toISOString() ?? null, lastSyncedAt: item.lastSyncedAt?.toISOString() ?? null })), pagination: pagination(total, query) };
}

export async function getBillingOverview() {
  const [accountsByBillingStatus, totalAccounts, allocatedAccounts, workspaces, walletSummary, wallets] = await Promise.all([
    prisma.whatsAppBusinessAccount.groupBy({ by: ["sharedBillingStatus"], _count: { _all: true } }),
    prisma.whatsAppBusinessAccount.count(),
    prisma.whatsAppBusinessAccount.count({ where: { sharedBillingAllocationId: { not: null } } }),
    prisma.workspace.count(),
    prisma.wallet.aggregate({ _count: { _all: true }, _sum: { balanceMinorUnits: true, totalBalance: true, reservedBalance: true } }),
    prisma.wallet.findMany({ orderBy: { tenant: { name: "asc" } }, select: { tenantId: true, currency: true, balanceMinorUnits: true, totalBalance: true, reservedBalance: true, status: true, tenant: { select: { name: true, slug: true, _count: { select: { workspaces: true } } } } } }),
  ]);
  const totalBalanceMinorUnits = walletSummary._sum.balanceMinorUnits ?? 0n;
  const totalBalance = walletSummary._sum.totalBalance?.toFixed(6) ?? "0.000000";
  const reservedBalance = walletSummary._sum.reservedBalance?.toFixed(6) ?? "0.000000";
  return { subscriptions: { configured: false, message: "Subscription and invoice models are not configured yet." }, wallet: { configured: true, currency: env.WALLET_CURRENCY, walletCount: walletSummary._count._all, balanceMinorUnits: totalBalanceMinorUnits.toString(), balance: minorUnitsToAmount(totalBalanceMinorUnits), totalBalance, reservedBalance, availableBalance: new Prisma.Decimal(totalBalance).sub(new Prisma.Decimal(reservedBalance)).toFixed(6) }, wallets: wallets.map((wallet) => ({ tenantId: wallet.tenantId, tenantName: wallet.tenant.name, tenantSlug: wallet.tenant.slug, workspaceCount: wallet.tenant._count.workspaces, currency: wallet.currency, balanceMinorUnits: wallet.balanceMinorUnits.toString(), balance: minorUnitsToAmount(wallet.balanceMinorUnits), totalBalance: wallet.totalBalance.toFixed(6), reservedBalance: wallet.reservedBalance.toFixed(6), availableBalance: wallet.totalBalance.sub(wallet.reservedBalance).toFixed(6), status: wallet.status })), sharedWhatsAppBilling: { totalAccounts, allocatedAccounts, unallocatedAccounts: totalAccounts - allocatedAccounts, statuses: Object.fromEntries(accountsByBillingStatus.map(({ sharedBillingStatus, _count }) => [sharedBillingStatus.toLowerCase(), _count._all])) }, workspaceCount: workspaces };
}

export async function getUsageOverview() {
  const [contacts, messages, conversations, templates, campaigns, automations, workflows, apiKeys, webhooks, workspaces] = await Promise.all([
    prisma.contact.count({ where: { deletedAt: null } }), prisma.message.count(), prisma.conversation.count(), prisma.template.count({ where: { deletedAt: null } }), prisma.campaign.count(), prisma.automation.count(), prisma.workflow.count(), prisma.publicApiKey.count({ where: { revokedAt: null } }), prisma.webhookEndpoint.count({ where: { active: true } }),
    prisma.workspace.findMany({ orderBy: { updatedAt: "desc" }, take: 10, select: { id: true, name: true, updatedAt: true, _count: { select: { contacts: true, messages: true, conversations: true, campaigns: true, automations: true } } } }),
  ]);
  return { totals: { contacts, messages, conversations, templates, campaigns, automations, workflows, activeApiKeys: apiKeys, activeWebhooks: webhooks }, workspaces: workspaces.map((workspace) => ({ ...workspace, updatedAt: workspace.updatedAt.toISOString() })) };
}

export async function getSystemHealth() {
  let database: { connected: boolean; name?: string; serverTime?: string; error?: string };
  try { const connection = await checkDatabaseConnection(); database = { connected: true, name: connection.database, serverTime: connection.serverTime }; } catch (error) { database = { connected: false, error: error instanceof Error ? error.message : "Database connectivity check failed" }; }
  return { status: database.connected ? "healthy" : "degraded", uptimeSeconds: Math.floor(process.uptime()), nodeEnvironment: env.NODE_ENV, database, integrations: { metaEmbeddedSignup: Boolean(env.META_APP_ID && env.META_APP_SECRET && env.META_CONFIG_ID), metaTokenEncryption: Boolean(env.META_TOKEN_ENCRYPTION_KEY), metaWebhook: Boolean(env.META_WEBHOOK_VERIFY_TOKEN), smtp: Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.SMTP_FROM_EMAIL), googleOAuth: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI), groq: Boolean(env.GROQ_API_KEY) } };
}

export async function listWebhooks(query: AdminListQuery) {
  const where: PrismaTypes.WebhookEndpointWhereInput = query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { url: { contains: query.search, mode: "insensitive" } }, { workspace: { name: { contains: query.search, mode: "insensitive" } } }] } : {};
  const [total, items] = await Promise.all([
    prisma.webhookEndpoint.count({ where }),
    prisma.webhookEndpoint.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, select: { id: true, name: true, url: true, events: true, active: true, lastDeliveredAt: true, createdAt: true, updatedAt: true, workspace: { select: { id: true, name: true, slug: true } }, createdBy: { select: { email: true, firstName: true, lastName: true } } } }),
  ]);
  return { items: items.map((item) => ({ ...item, lastDeliveredAt: item.lastDeliveredAt?.toISOString() ?? null, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(), secretConfigured: true })), pagination: pagination(total, query) };
}

export async function listAuditLogs(query: AdminAuditQuery) {
  const where: PrismaTypes.PlatformAuditLogWhereInput = { ...(query.resourceType ? { resourceType: query.resourceType } : {}), ...(query.action ? { action: { contains: query.action, mode: "insensitive" } } : {}), ...(query.search ? { OR: [{ action: { contains: query.search, mode: "insensitive" } }, { resourceType: { contains: query.search, mode: "insensitive" } }, { actorUser: { email: { contains: query.search, mode: "insensitive" } } }] } : {}) };
  const [total, items] = await Promise.all([
    prisma.platformAuditLog.count({ where }),
    prisma.platformAuditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, select: { id: true, action: true, resourceType: true, resourceId: true, workspaceId: true, metadata: true, ipAddress: true, userAgent: true, createdAt: true, actorUser: { select: { id: true, email: true, firstName: true, lastName: true, platformRole: true } } } }),
  ]);
  return { items: items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })), pagination: pagination(total, query) };
}

export async function getPlatformSettings() {
  return { runtime: { environment: env.NODE_ENV, apiPrefix: env.API_PREFIX, accessTokenTtlMinutes: env.ACCESS_TOKEN_TTL_MINUTES, refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS }, integrations: { metaApp: Boolean(env.META_APP_ID), metaGraph: env.META_GRAPH_API_VERSION, smtp: Boolean(env.SMTP_HOST), googleOAuth: Boolean(env.GOOGLE_CLIENT_ID), aiProvider: Boolean(env.GROQ_API_KEY) }, featureFlags: { configured: false, message: "Feature flag persistence is not configured yet." }, billing: { currency: env.WALLET_CURRENCY, walletConfigured: true } };
}

export async function getFeatureFlags() {
  return { configured: false, items: [], message: "Feature flag persistence is not configured yet. No runtime flags are being applied." };
}

export async function recordAdminRequest(request: Request) {
  if (!request.auth) return;
  await prisma.platformAuditLog.create({ data: { actorUserId: request.auth.userId, action: `${request.method} ${request.path}`, resourceType: "platform_admin", metadata: { query: request.query }, ipAddress: request.ip, userAgent: request.get("user-agent") } });
}
