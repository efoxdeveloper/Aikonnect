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
const { AppError } = await import("../src/middleware/error-handler.js");
const { requireWorkspacePermission } = await import("../src/middleware/workspace-access.js");
const { PERMISSIONS } = await import("../src/modules/workspaces/permissions.js");

function request() {
  return { auth: { userId: "user-id", sessionId: "session-id", email: "user@example.com", emailVerifiedAt: new Date() }, params: { workspaceId: "workspace-id" } } as any;
}

function stubMembership(t: TestContext, permissions: string[]) {
  const original = prisma.workspaceMember.findUnique;
  prisma.workspaceMember.findUnique = async () => ({ status: "ACTIVE", id: "membership-id", roleId: "role-id", role: { permissions: permissions.map((key) => ({ permission: { key } })) } }) as never;
  t.after(() => { prisma.workspaceMember.findUnique = original; });
}

test("wallet access rejects anonymous requests", async () => {
  let error: unknown;
  await requireWorkspacePermission(PERMISSIONS.BILLING_READ)({ params: { workspaceId: "workspace-id" } } as any, {} as any, (nextError?: unknown) => { error = nextError; });
  assert.ok(error instanceof AppError);
  assert.equal((error as AppError).code, "AUTHENTICATION_REQUIRED");
});

test("wallet access rejects members without billing permission", async (t) => {
  stubMembership(t, [PERMISSIONS.WORKSPACE_READ]);
  let error: unknown;
  await requireWorkspacePermission(PERMISSIONS.BILLING_READ)(request(), {} as any, (nextError?: unknown) => { error = nextError; });
  assert.ok(error instanceof AppError);
  assert.equal((error as AppError).code, "PERMISSION_DENIED");
});

test("wallet access accepts members with billing permission", async (t) => {
  stubMembership(t, [PERMISSIONS.BILLING_READ]);
  const currentRequest = request();
  let error: unknown;
  await requireWorkspacePermission(PERMISSIONS.BILLING_READ)(currentRequest, {} as any, (nextError?: unknown) => { error = nextError; });
  assert.equal(error, undefined);
  assert.equal(currentRequest.workspaceAccess.workspaceId, "workspace-id");
});
