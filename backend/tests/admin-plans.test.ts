import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { adminPlanInputSchema } from "../src/modules/admin/admin.schemas.js";

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
const { createSubscriptionPlan, updateSubscriptionPlan, deleteSubscriptionPlan } = await import("../src/modules/admin/admin.service.js");
const { listPublicPlans } = await import("../src/modules/billing/plans.service.js");
const { listWorkspaceSubscriptions } = await import("../src/modules/billing/subscriptions.service.js");

function stub(t: TestContext, target: any, method: string, implementation: (...args: any[]) => any) {
  const original = target[method];
  target[method] = implementation;
  t.after(() => { target[method] = original; });
}

const input = adminPlanInputSchema.parse({ name: "Growth", slug: "growth", description: "For growing teams", currency: "INR", monthlyPrice: "499.50", annualPrice: "4999", trialDays: 14, maxSeats: 5, maxContacts: 10000, maxCampaignsPerMonth: 30, maxAutomations: 20, maxWorkflows: 10, maxPipelines: 3, apiAccess: true, webhooks: true, advancedReports: true, active: true, displayOrder: 2 });
function persistedPlan(id: string, values: Record<string, unknown> = {}) {
  return { id, ...input, monthlyPriceMinorUnits: 49950n, annualPriceMinorUnits: 499900n, createdAt: new Date("2026-10-01T00:00:00.000Z"), updatedAt: new Date("2026-10-02T00:00:00.000Z"), ...values };
}

test("creating and updating a plan persist minor-unit prices with an audit record", async (t) => {
  const calls: Array<{ model: string; args: any }> = [];
  let id = "plan-1";
  const transaction = {
    subscriptionPlan: {
      create: async (args: any) => { calls.push({ model: "plan.create", args }); return persistedPlan(id); },
      update: async (args: any) => { calls.push({ model: "plan.update", args }); return persistedPlan(args.where.id, { name: "Growth Plus" }); },
    },
    platformAuditLog: { create: async (args: any) => { calls.push({ model: "audit", args }); return {}; } },
  };
  stub(t, prisma as any, "$transaction", async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction));

  const created = await createSubscriptionPlan(input, "admin-1");
  assert.equal(created.monthlyPriceMinorUnits, "49950");
  assert.equal(calls[0]?.args.data.monthlyPriceMinorUnits, 49950n);
  assert.equal(calls[1]?.args.data.action, "PLAN_CREATE");

  const updated = await updateSubscriptionPlan(id, { ...input, name: "Growth Plus" }, "admin-1");
  assert.equal(updated.name, "Growth Plus");
  assert.equal(calls[2]?.args.where.id, id);
  assert.equal(calls[3]?.args.data.action, "PLAN_UPDATE");
});

test("deleting a plan removes its database row and records its identity", async (t) => {
  const calls: Array<{ model: string; args: any }> = [];
  const transaction = {
    subscriptionPlan: { delete: async (args: any) => { calls.push({ model: "plan.delete", args }); return { id: args.where.id, name: "Growth", slug: "growth" }; } },
    platformAuditLog: { create: async (args: any) => { calls.push({ model: "audit", args }); return {}; } },
  };
  stub(t, prisma as any, "$transaction", async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction));

  assert.deepEqual(await deleteSubscriptionPlan("plan-1", "admin-1"), { id: "plan-1", deleted: true });
  assert.equal(calls[0]?.model, "plan.delete");
  assert.equal(calls[1]?.args.data.action, "PLAN_DELETE");
  assert.deepEqual(calls[1]?.args.data.metadata, { name: "Growth", slug: "growth" });
});

test("public plan catalog only queries active priced plans and serializes prices safely", async (t) => {
  let query: any;
  stub(t, prisma.subscriptionPlan, "findMany", async (args) => {
    query = args;
    return [{ id: "plan-1", name: "Growth", slug: "growth", description: null, currency: "INR", monthlyPriceMinorUnits: 259900n, annualPriceMinorUnits: 0n, trialDays: 14, maxSeats: 5, maxContacts: 10000, maxCampaignsPerMonth: 30, maxAutomations: 20, maxWorkflows: 10, maxPipelines: 3, apiAccess: true, webhooks: true, advancedReports: true }];
  });

  const result = await listPublicPlans();
  assert.equal(query.where.active, true);
  assert.deepEqual(query.where.OR, [{ monthlyPriceMinorUnits: { gt: 0n } }, { annualPriceMinorUnits: { gt: 0n } }]);
  assert.equal(result.items[0]?.monthlyPriceMinorUnits, "259900");
  assert.equal(result.items[0]?.annualPriceMinorUnits, "0");
});

test("workspace subscription history is scoped and returns an active subscription with serialized price", async (t) => {
  let query: any;
  const createdAt = new Date("2026-10-01T00:00:00.000Z");
  stub(t, prisma.workspaceSubscription, "findFirst", async () => ({ id: "subscription-1", status: "ACTIVE", trialEndsAt: null, plan: { id: "plan-1", slug: "growth", name: "Growth", maxSeats: 5, maxContacts: 10000, maxCampaignsPerMonth: 30, maxAutomations: 20, maxWorkflows: 10, maxPipelines: 3, apiAccess: true, webhooks: true, advancedReports: true } }));
  stub(t, prisma.workspaceSubscription, "findMany", async (args) => {
    query = args;
    return [{ id: "subscription-1", workspaceId: "workspace-1", planId: "plan-1", planName: "Growth", plan: { slug: "growth" }, status: "ACTIVE", billingPeriod: "MONTHLY", currency: "INR", amountMinorUnits: 259900n, startedAt: createdAt, trialEndsAt: null, currentPeriodStartsAt: createdAt, currentPeriodEndsAt: new Date("2026-11-01T00:00:00.000Z"), cancelAtPeriodEnd: false, canceledAt: null, endedAt: null, createdAt, updatedAt: createdAt }];
  });
  stub(t, prisma.planRequest, "findMany", async () => []);

  const result = await listWorkspaceSubscriptions("workspace-1");
  assert.deepEqual(query.where, { workspaceId: "workspace-1" });
  assert.equal(result.active?.id, "subscription-1");
  assert.equal(result.active?.planSlug, "growth");
  assert.equal(result.active?.amountMinorUnits, "259900");
  assert.equal(result.items[0]?.trialEndsAt, null);
});
