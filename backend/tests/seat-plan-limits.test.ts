import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../src/middleware/error-handler.js";
import { enforceWorkspaceSeatLimit } from "../src/modules/workspaces/seat-plan-limits.js";

const plan = { id: "plan-1", slug: "growth", name: "Growth", maxSeats: 5, maxContacts: 10000, maxCampaignsPerMonth: 30, maxAutomations: 20, maxWorkflows: 10, maxPipelines: 3, apiAccess: true, webhooks: true, advancedReports: true };

function fakeTransaction({ status = "ACTIVE", trialEndsAt = null, activeMembers = 3, pendingInvitations = 1, subscriptionExists = true } = {}) {
  let lockCalled = false;
  const transaction = {
    $queryRaw: async () => { lockCalled = true; return []; },
    workspaceSubscription: {
      findFirst: async () => subscriptionExists ? { id: "subscription-1", status, trialEndsAt, plan } : null,
      updateMany: async () => ({ count: 1 }),
    },
    workspaceMember: { count: async () => activeMembers },
    workspaceInvitation: { count: async () => pendingInvitations },
  };
  return { transaction: transaction as never, didLock: () => lockCalled };
}

test("allows an invitation when active members and pending invitations fit the seat cap", async () => {
  const fake = fakeTransaction({ activeMembers: 3, pendingInvitations: 1 });
  await enforceWorkspaceSeatLimit(fake.transaction, "workspace-1", 1);
  assert.equal(fake.didLock(), true);
});

test("counts pending invitations as reserved seats", async () => {
  const fake = fakeTransaction({ activeMembers: 4, pendingInvitations: 1 });
  await assert.rejects(
    enforceWorkspaceSeatLimit(fake.transaction, "workspace-1", 1),
    (error: unknown) => error instanceof AppError && error.code === "PLAN_LIMIT_REACHED" && error.details && (error.details as { feature: string }).feature === "seats",
  );
});

test("allows acceptance of an invitation that already reserved a seat", async () => {
  const fake = fakeTransaction({ activeMembers: 4, pendingInvitations: 1 });
  await enforceWorkspaceSeatLimit(fake.transaction, "workspace-1", 0);
});

test("blocks new invitations and invitation acceptance after a trial expires", async () => {
  const fake = fakeTransaction({ status: "TRIALING", trialEndsAt: new Date("2026-10-05T11:59:59.000Z") });
  await assert.rejects(
    enforceWorkspaceSeatLimit(fake.transaction, "workspace-1", 1, new Date("2026-10-05T12:00:00.000Z")),
    (error: unknown) => error instanceof AppError && error.code === "TRIAL_EXPIRED",
  );
});

test("leaves legacy workspaces without subscriptions unrestricted", async () => {
  const fake = fakeTransaction({ subscriptionExists: false, activeMembers: 100, pendingInvitations: 100 });
  await enforceWorkspaceSeatLimit(fake.transaction, "workspace-1", 1);
});
