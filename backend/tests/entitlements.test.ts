import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

Object.assign(process.env, {
  DOTENV_CONFIG_PATH: "tests/nonexistent-unit-test.env",
  NODE_ENV: "test",
  APP_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  ACCESS_TOKEN_SECRET: "unit-test-only-access-token-secret-000000",
  META_APP_ID: "test-app",
  META_APP_SECRET: "test-app-secret",
  META_WEBHOOK_VERIFY_TOKEN: "test-webhook-verify-token",
  META_TOKEN_ENCRYPTION_KEY: "test-token-encryption-key-for-tests-32chars",
  META_GRAPH_API_VERSION: "v25.0",
  LOG_LEVEL: "silent",
});

const { prisma } = await import("../src/database/prisma.js");
const { assertWorkspaceFeatureEnabled, assertWorkspaceWritable, resolveWorkspaceEntitlements } = await import("../src/modules/billing/entitlements.service.js");

function stub(t: TestContext, target: any, method: string, implementation: (...args: any[]) => any) {
  const original = target[method];
  target[method] = implementation;
  t.after(() => { target[method] = original; });
}

const now = new Date("2026-10-05T12:00:00.000Z");
const plan = { id: "plan-1", slug: "growth", name: "Growth", maxSeats: 5, maxContacts: 10000, maxCampaignsPerMonth: 30, maxAutomations: 20, maxWorkflows: 10, maxPipelines: 3, apiAccess: true, webhooks: true, advancedReports: true };
function subscription(values: Record<string, unknown> = {}) {
  return { id: "subscription-1", status: "ACTIVE", trialEndsAt: null, plan, ...values };
}

test("returns the active plan limits and feature access", async (t) => {
  stub(t, prisma.workspaceSubscription, "findFirst", async () => subscription());
  stub(t, prisma.workspaceSubscription, "updateMany", async () => { assert.fail("active subscription must not be expired"); });

  const result = await resolveWorkspaceEntitlements("workspace-1", now);
  assert.equal(result.status, "ACTIVE");
  assert.equal(result.subscriptionId, "subscription-1");
  assert.equal(result.plan?.maxContacts, 10000);
  assert.equal(result.plan?.apiAccess, true);
});

test("keeps a trial available until its end timestamp", async (t) => {
  stub(t, prisma.workspaceSubscription, "findFirst", async () => subscription({ status: "TRIALING", trialEndsAt: new Date("2026-10-05T12:00:00.001Z") }));
  stub(t, prisma.workspaceSubscription, "updateMany", async () => { assert.fail("unexpired trial must not be expired"); });

  const result = await resolveWorkspaceEntitlements("workspace-1", now);
  assert.equal(result.status, "TRIALING");
  assert.equal(result.plan?.slug, "growth");
});

test("expires a trial at its end timestamp and revokes its plan entitlements", async (t) => {
  const trialEndsAt = now;
  let updateArgs: any;
  stub(t, prisma.workspaceSubscription, "findFirst", async () => subscription({ status: "TRIALING", trialEndsAt }));
  stub(t, prisma.workspaceSubscription, "updateMany", async (args) => { updateArgs = args; return { count: 1 }; });

  const result = await resolveWorkspaceEntitlements("workspace-1", now);
  assert.deepEqual(updateArgs, { where: { id: "subscription-1", status: "TRIALING", trialEndsAt }, data: { status: "EXPIRED", endedAt: now } });
  assert.equal(result.status, "EXPIRED");
  assert.equal(result.plan, null);
});

test("treats a trial without an end date as expired", async (t) => {
  stub(t, prisma.workspaceSubscription, "findFirst", async () => subscription({ status: "TRIALING", trialEndsAt: null }));
  stub(t, prisma.workspaceSubscription, "updateMany", async ({ where }: any) => { assert.equal(where.trialEndsAt, null); return { count: 1 }; });

  const result = await resolveWorkspaceEntitlements("workspace-1", now);
  assert.equal(result.status, "EXPIRED");
  assert.equal(result.plan, null);
});

test("continues to recognize a trial after its expired state has been persisted", async (t) => {
  let lookup = 0;
  stub(t, prisma.workspaceSubscription, "findFirst", async () => {
    lookup += 1;
    return lookup === 1 ? null : { id: "subscription-1", trialEndsAt: now };
  });
  const result = await resolveWorkspaceEntitlements("workspace-1", now);
  assert.equal(result.status, "EXPIRED");
  assert.equal(result.subscriptionId, "subscription-1");
  assert.equal(result.trialEndsAt?.toISOString(), now.toISOString());
});

test("returns no entitlement when the workspace has no active subscription", async (t) => {
  stub(t, prisma.workspaceSubscription, "findFirst", async () => null);
  stub(t, prisma.workspaceSubscription, "updateMany", async () => { assert.fail("no subscription must not be updated"); });

  assert.deepEqual(await resolveWorkspaceEntitlements("workspace-1", now), { status: "NONE", subscriptionId: null, plan: null, trialEndsAt: null });
});

test("allows features included in an active plan and rejects features excluded from it", async (t) => {
  stub(t, prisma.workspaceSubscription, "findFirst", async () => subscription({ plan: { ...plan, apiAccess: true, webhooks: false } }));
  await assertWorkspaceFeatureEnabled("workspace-1", "apiAccess", prisma, now);
  await assert.rejects(assertWorkspaceFeatureEnabled("workspace-1", "webhooks", prisma, now), (error: any) => error.code === "PLAN_FEATURE_NOT_INCLUDED");
});

test("rejects plan features after trial expiration", async (t) => {
  stub(t, prisma.workspaceSubscription, "findFirst", async () => subscription({ status: "TRIALING", trialEndsAt: now, plan }));
  stub(t, prisma.workspaceSubscription, "updateMany", async () => ({ count: 1 }));
  await assert.rejects(assertWorkspaceFeatureEnabled("workspace-1", "webhooks", prisma, now), (error: any) => error.code === "TRIAL_EXPIRED");
});

test("keeps plan features available to legacy workspaces without subscriptions", async (t) => {
  stub(t, prisma.workspaceSubscription, "findFirst", async () => null);
  await assertWorkspaceFeatureEnabled("workspace-1", "advancedReports", prisma, now);
});

test("allows writes for an active trial and for workspaces without a subscription", async (t) => {
  stub(t, prisma.workspaceSubscription, "findFirst", async () => subscription({ status: "TRIALING", trialEndsAt: new Date("2026-10-05T12:00:00.001Z") }));
  stub(t, prisma.workspaceSubscription, "updateMany", async () => { assert.fail("unexpired trial must not be changed"); });
  await assertWorkspaceWritable("workspace-1", now);

  stub(t, prisma.workspaceSubscription, "findFirst", async () => null);
  await assertWorkspaceWritable("workspace-1", now);
});

test("makes expired trial workspaces read-only", async (t) => {
  stub(t, prisma.workspaceSubscription, "findFirst", async () => subscription({ status: "TRIALING", trialEndsAt: now }));
  stub(t, prisma.workspaceSubscription, "updateMany", async () => ({ count: 1 }));

  await assert.rejects(assertWorkspaceWritable("workspace-1", now), (error: any) => error.code === "TRIAL_EXPIRED" && error.details.readOnly === true);
});
