import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

Object.assign(process.env, {
  DOTENV_CONFIG_PATH: "tests/nonexistent-unit-test.env",
  NODE_ENV: "test",
  APP_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  ACCESS_TOKEN_SECRET: "unit-test-only-access-token-secret-000000",
  LOG_LEVEL: "silent",
});

const { prisma } = await import("../src/database/prisma.js");
const { getOverview, listUsers, performUserAction } = await import("../src/modules/admin/admin.service.js");
const { requirePlatformRole } = await import("../src/middleware/platform-access.js");
const { AppError } = await import("../src/middleware/error-handler.js");

function stubDelegate(t: TestContext, target: any, method: string, implementation: (...args: any[]) => any) {
  const original = target[method];
  target[method] = implementation;
  t.after(() => { target[method] = original; });
}

function request() {
  return {
    auth: { userId: "platform-user", sessionId: "session-1", email: "admin@example.com", emailVerifiedAt: new Date() },
  } as any;
}

test("platform middleware rejects anonymous requests", async () => {
  let nextError: unknown;
  await requirePlatformRole("ADMIN")( {} as any, {} as any, (error?: unknown) => { nextError = error; });

  assert.ok(nextError instanceof AppError);
  assert.equal((nextError as AppError).code, "AUTHENTICATION_REQUIRED");
});

test("platform middleware allows verified platform admins and records the role", async (t) => {
  stubDelegate(t, prisma.user, "findUnique", async () => ({ status: "ACTIVE", emailVerifiedAt: new Date(), platformRole: "SUPER_ADMIN" }));
  const currentRequest = request();
  let nextError: unknown;
  await requirePlatformRole("ADMIN", "SUPER_ADMIN")(currentRequest, {} as any, (error?: unknown) => { nextError = error; });

  assert.equal(nextError, undefined);
  assert.deepEqual(currentRequest.platformAccess, { role: "SUPER_ADMIN" });
});

test("platform middleware rejects customer and lower-privilege accounts", async (t) => {
  stubDelegate(t, prisma.user, "findUnique", async () => ({ status: "ACTIVE", emailVerifiedAt: new Date(), platformRole: "SUPPORT" }));
  let nextError: unknown;
  await requirePlatformRole("ADMIN")(request(), {} as any, (error?: unknown) => { nextError = error; });

  assert.ok(nextError instanceof AppError);
  assert.equal((nextError as AppError).code, "PLATFORM_ACCESS_DENIED");
});

test("admin overview returns only aggregate platform metrics", async (t) => {
  stubDelegate(t, prisma.user, "groupBy", async () => [
    { status: "ACTIVE", _count: { _all: 4 } },
    { status: "SUSPENDED", _count: { _all: 1 } },
  ]);
  stubDelegate(t, prisma.whatsAppBusinessAccount, "groupBy", async () => [{ status: "CONNECTED", _count: { _all: 2 } }]);
  stubDelegate(t, prisma.workspace, "count", async () => 3);
  stubDelegate(t, prisma.workspace, "findMany", async () => []);
  stubDelegate(t, prisma.whatsAppBusinessAccount, "count", async () => 2);
  stubDelegate(t, prisma.session, "count", async () => 5);

  assert.deepEqual(await getOverview(), {
    users: { active: 4, suspended: 1 },
    workspaces: 3,
    connectedWhatsAppAccounts: 2,
    activeSessions: 5,
    whatsappAccountsByStatus: { connected: 2 },
    recentWorkspaces: [],
  });
});

test("admin user listing reports the persisted signup source", async (t) => {
  stubDelegate(t, prisma.user, "count", async () => 2);
  stubDelegate(t, prisma.user, "findMany", async () => [
    { id: "google-user", email: "google@example.com", firstName: "Google", lastName: "User", phone: null, status: "ACTIVE", platformRole: "NONE", emailVerifiedAt: new Date("2026-09-18T00:00:00.000Z"), lastLoginAt: null, createdAt: new Date("2026-09-18T00:00:00.000Z"), oauthAccounts: [{ provider: "google" }], memberships: [], _count: { memberships: 0, sessions: 1 } },
    { id: "manual-user", email: "manual@example.com", firstName: "Manual", lastName: "User", phone: null, status: "ACTIVE", platformRole: "NONE", emailVerifiedAt: null, lastLoginAt: null, createdAt: new Date("2026-09-17T00:00:00.000Z"), oauthAccounts: [], memberships: [], _count: { memberships: 0, sessions: 0 } },
  ]);

  const result = await listUsers({ page: 1, pageSize: 25 });

  assert.deepEqual(result.items.map((user) => user.signupSource), ["Google signup", "Manual signup"]);
  assert.equal("oauthAccounts" in result.items[0]!, false);
});

test("admin can suspend a customer and revoke their sessions with an audit event", async (t) => {
  const writes: any[] = [];
  stubDelegate(t, prisma.user, "findUnique", async () => ({ id: "customer-1", email: "customer@example.com", status: "ACTIVE", platformRole: "NONE" }));
  stubDelegate(t, prisma.user, "update", async (args) => { writes.push({ type: "user", args }); return {}; });
  stubDelegate(t, prisma.session, "updateMany", async (args) => { writes.push({ type: "sessions", args }); return { count: 2 }; });
  stubDelegate(t, prisma.platformAuditLog, "create", async (args) => { writes.push({ type: "audit", args }); return {}; });
  stubDelegate(t, prisma as any, "$transaction", async (operations: Promise<unknown>[]) => Promise.all(operations));

  const result = await performUserAction("customer-1", "admin-1", "ADMIN", "SUSPEND");

  assert.deepEqual(result, { id: "customer-1", action: "SUSPEND", status: "SUSPENDED", deleted: false });
  assert.deepEqual(writes.map((write) => write.type), ["user", "sessions", "audit"]);
  assert.equal(writes[0].args.data.status, "SUSPENDED");
  assert.equal(writes[1].args.where.userId, "customer-1");
  assert.equal(writes[2].args.data.action, "USER_SUSPEND");
});

test("admin user actions protect platform admins, self-actions, and unconfirmed deletion", async (t) => {
  stubDelegate(t, prisma.user, "findUnique", async (args) => args.where.id === "platform-1"
    ? { id: "platform-1", email: "platform@example.com", status: "ACTIVE", platformRole: "ADMIN" }
    : args.where.id === "admin-1"
      ? { id: "admin-1", email: "admin@example.com", status: "ACTIVE", platformRole: "NONE" }
      : { id: "customer-1", email: "customer@example.com", status: "ACTIVE", platformRole: "NONE" });

  await assert.rejects(() => performUserAction("platform-1", "admin-1", "SUPER_ADMIN", "SUSPEND"), (error: unknown) => error instanceof AppError && error.code === "PLATFORM_ADMIN_ACTION_DENIED");
  await assert.rejects(() => performUserAction("admin-1", "admin-1", "ADMIN", "SUSPEND"), (error: unknown) => error instanceof AppError && error.code === "SELF_ACTION_DENIED");
  await assert.rejects(() => performUserAction("customer-1", "admin-1", "ADMIN", "DELETE"), (error: unknown) => error instanceof AppError && error.code === "DELETE_CONFIRMATION_REQUIRED");
  await assert.rejects(() => performUserAction("customer-1", "support-1", "SUPPORT", "SUSPEND"), (error: unknown) => error instanceof AppError && error.code === "PLATFORM_USER_ACTION_DENIED");
});
