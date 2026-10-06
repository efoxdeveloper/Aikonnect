import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../src/middleware/error-handler.js";
import { enforceContactPlanLimit } from "../src/modules/contacts/contact-plan-limits.js";

const plan = { id: "plan-1", slug: "growth", name: "Growth", maxSeats: 5, maxContacts: 5, maxCampaignsPerMonth: 30, maxAutomations: 20, maxWorkflows: 10, maxPipelines: 3, apiAccess: true, webhooks: true, advancedReports: true };

function fakeTransaction({ status = "ACTIVE", trialEndsAt = null, currentContacts = 4, subscriptionExists = true } = {}) {
  let lockCalled = false;
  let countCalled = false;
  const transaction = {
    $queryRaw: async () => { lockCalled = true; return []; },
    workspaceSubscription: {
      findFirst: async () => subscriptionExists ? { id: "subscription-1", status, trialEndsAt, plan } : null,
      updateMany: async () => ({ count: 1 }),
    },
    contact: { count: async () => { countCalled = true; return currentContacts; } },
  };
  return { transaction: transaction as never, didLock: () => lockCalled, didCount: () => countCalled };
}

test("allows creating contacts up to the plan limit and locks the workspace for the check", async () => {
  const fake = fakeTransaction({ currentContacts: 4 });
  await enforceContactPlanLimit(fake.transaction, "workspace-1", 1);
  assert.equal(fake.didLock(), true);
  assert.equal(fake.didCount(), true);
});

test("rejects contact creation when the new total would exceed the plan limit", async () => {
  const fake = fakeTransaction({ currentContacts: 5 });
  await assert.rejects(
    enforceContactPlanLimit(fake.transaction, "workspace-1", 1),
    (error: unknown) => error instanceof AppError && error.code === "PLAN_LIMIT_REACHED" && error.statusCode === 403,
  );
});

test("rejects contact writes after a trial expires", async () => {
  const fake = fakeTransaction({ status: "TRIALING", trialEndsAt: new Date("2026-10-05T11:59:59.000Z") });
  await assert.rejects(
    enforceContactPlanLimit(fake.transaction, "workspace-1", 1, new Date("2026-10-05T12:00:00.000Z")),
    (error: unknown) => error instanceof AppError && error.code === "TRIAL_EXPIRED",
  );
  assert.equal(fake.didCount(), false);
});

test("leaves legacy workspaces without a subscription unrestricted", async () => {
  const fake = fakeTransaction({ subscriptionExists: false });
  await enforceContactPlanLimit(fake.transaction, "workspace-1", 100);
  assert.equal(fake.didCount(), false);
});
