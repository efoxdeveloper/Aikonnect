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
const { requireWorkspacePermission } = await import("../src/middleware/workspace-access.js");

function stub(t: TestContext, target: any, method: string, implementation: (...args: any[]) => any) {
  const original = target[method];
  target[method] = implementation;
  t.after(() => { target[method] = original; });
}

const member = { id: "membership-1", status: "ACTIVE", roleId: "role-1", role: { permissions: [{ permission: { key: "contacts.create" } }] } };

function request(method: string, originalUrl = "/api/v1/workspaces/workspace-1/contacts") {
  return { auth: { userId: "user-1", email: "owner@example.com" }, params: { workspaceId: "workspace-1" }, method, originalUrl } as any;
}

test("allows workspace reads after a trial expires", async (t) => {
  stub(t, prisma.workspaceMember, "findUnique", async () => member);
  stub(t, prisma.workspaceSubscription, "findFirst", async () => { assert.fail("read requests do not check write access"); });
  const next = (error?: unknown) => { assert.equal(error, undefined); };
  await requireWorkspacePermission("contacts.create")(request("GET"), {} as any, next);
});

test("rejects workspace writes after a trial expires", async (t) => {
  stub(t, prisma.workspaceMember, "findUnique", async () => member);
  stub(t, prisma.workspaceSubscription, "findFirst", async () => ({ id: "subscription-1", status: "TRIALING", trialEndsAt: new Date("2026-10-01T00:00:00.000Z"), plan: {} }));
  stub(t, prisma.workspaceSubscription, "updateMany", async () => ({ count: 1 }));
  let received: any;
  await requireWorkspacePermission("contacts.create")(request("POST"), {} as any, (error?: unknown) => { received = error; });
  assert.equal(received?.code, "TRIAL_EXPIRED");
  assert.equal(received?.details?.readOnly, true);
});

test("allows expired workspaces to submit plan requests", async (t) => {
  stub(t, prisma.workspaceMember, "findUnique", async () => ({ ...member, role: { permissions: [{ permission: { key: "billing.manage" } }] } }));
  stub(t, prisma.workspaceSubscription, "findFirst", async () => { assert.fail("plan request recovery must remain available"); });
  const next = (error?: unknown) => { assert.equal(error, undefined); };
  await requireWorkspacePermission("billing.manage")(
    request("POST", "/api/v1/workspaces/workspace-1/subscriptions/requests"), {} as any, next,
  );
});
