import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { planRequestCreateSchema } from "../src/modules/billing/plan-requests.schemas.js";

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
const { createWorkspacePlanRequest } = await import("../src/modules/billing/plan-requests.service.js");
const { decidePlanRequest } = await import("../src/modules/admin/admin-plan-requests.service.js");

function stub(t: TestContext, target: any, method: string, implementation: (...args: any[]) => any) {
  const original = target[method];
  target[method] = implementation;
  t.after(() => { target[method] = original; });
}

const input = planRequestCreateSchema.parse({ planId: "00000000-0000-4000-8000-000000000001", billingPeriod: "MONTHLY" });
const plan = { id: input.planId, name: "Growth", currency: "INR", monthlyPriceMinorUnits: 259900n, annualPriceMinorUnits: 2599000n, trialDays: 14, active: true };
function requestRow(values: Record<string, unknown> = {}) {
  const createdAt = new Date("2026-10-01T00:00:00.000Z");
  return { id: "request-1", workspaceId: "workspace-1", planId: plan.id, requestedByUserId: "user-1", reviewedByUserId: null, subscriptionId: null, planName: "Growth", billingPeriod: "MONTHLY", currency: "INR", amountMinorUnits: 259900n, trialDays: 14, status: "PENDING", customerNote: null, adminNote: null, createdAt, updatedAt: createdAt, decidedAt: null, ...values };
}

test("customer plan request snapshots the selected active plan and is safe to retry", async (t) => {
  let creates = 0;
  const pending = requestRow();
  stub(t, prisma.subscriptionPlan, "findFirst", async () => plan);
  stub(t, prisma.workspaceSubscription, "findFirst", async () => null);
  stub(t, prisma.planRequest, "findFirst", async () => creates ? pending : null);
  stub(t, prisma.planRequest, "create", async ({ data }: any) => { creates += 1; return requestRow(data); });

  const first = await createWorkspacePlanRequest("workspace-1", "user-1", input);
  const retry = await createWorkspacePlanRequest("workspace-1", "user-1", input);
  assert.equal(first.status, "PENDING");
  assert.equal(first.amountMinorUnits, "259900");
  assert.equal(retry.id, first.id);
  assert.equal(creates, 1);
});

test("admin approval creates a trial subscription and records the decision in the audit log", async (t) => {
  const calls: Array<{ type: string; args: any }> = [];
  const transaction = {
    planRequest: {
      findUnique: async () => requestRow(),
      update: async ({ data, where }: any) => { calls.push({ type: "request.update", args: { data, where } }); return requestRow({ ...data, decidedAt: new Date("2026-10-05T00:00:00.000Z") }); },
    },
    workspaceSubscription: {
      findFirst: async () => null,
      create: async ({ data }: any) => { calls.push({ type: "subscription.create", args: data }); return { id: "subscription-1" }; },
    },
    platformAuditLog: { create: async ({ data }: any) => { calls.push({ type: "audit.create", args: data }); return {}; } },
  };
  stub(t, prisma as any, "$transaction", async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction));

  const result = await decidePlanRequest("request-1", "admin-1", { decision: "APPROVE" });
  assert.equal(result.status, "APPROVED");
  assert.equal(result.subscriptionId, "subscription-1");
  assert.equal(result.subscriptionStatus, "TRIALING");
  assert.equal(calls.find((item) => item.type === "subscription.create")?.args.status, "TRIALING");
  assert.equal(calls.find((item) => item.type === "request.update")?.args.data.reviewedByUserId, "admin-1");
  assert.equal(calls.find((item) => item.type === "audit.create")?.args.action, "PLAN_REQUEST_APPROVED");
});

test("admin rejection closes the request without creating a subscription", async (t) => {
  const calls: string[] = [];
  const transaction = {
    planRequest: { findUnique: async () => requestRow(), update: async ({ data }: any) => { calls.push(data.status); return requestRow({ ...data, decidedAt: new Date() }); } },
    workspaceSubscription: { findFirst: async () => null, create: async () => { calls.push("SUBSCRIPTION_CREATED"); return { id: "unexpected" }; } },
    platformAuditLog: { create: async ({ data }: any) => { calls.push(data.action); return {}; } },
  };
  stub(t, prisma as any, "$transaction", async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction));

  const result = await decidePlanRequest("request-1", "admin-1", { decision: "REJECT", adminNote: "Not approved" });
  assert.equal(result.status, "REJECTED");
  assert.deepEqual(calls, ["REJECTED", "PLAN_REQUEST_REJECTED"]);
});
