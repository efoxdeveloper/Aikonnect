import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  APP_URL: "http://localhost:5173",
  ACCESS_TOKEN_SECRET: "unit-test-only-access-token-secret-000000",
  LOG_LEVEL: "silent",
});

const { Prisma } = await import("../src/generated/prisma/client.js");
const { prisma } = await import("../src/database/prisma.js");
const { refreshCampaignCost, refreshCampaignMetrics } = await import("../src/modules/campaigns/campaign.metrics.js");

function stub(t: TestContext, target: any, method: string, implementation: (...args: any[]) => any) {
  const original = target[method];
  target[method] = implementation;
  t.after(() => { target[method] = original; });
}

test("campaign total cost sums settled wallet charges and subtracts refunds", async (t) => {
  let updatedCost: InstanceType<typeof Prisma.Decimal> | undefined;
  stub(t, prisma.campaignRecipient, "findMany", async (args: any) => {
    assert.deepEqual(args.where, { workspaceId: "workspace-1", campaignId: "campaign-1", metaMessageId: { not: null } });
    return [{ metaMessageId: "wamid-1" }, { metaMessageId: "wamid-2" }];
  });
  stub(t, prisma.message, "findMany", async () => [{ id: "message-1" }, { id: "message-2" }]);
  stub(t, prisma.walletLedgerEntry, "findMany", async (args: any) => {
    assert.deepEqual(args.where.transactionType, { in: ["CHARGE", "REFUND"] });
    return [
      { amount: new Prisma.Decimal("2.25"), direction: "DEBIT" },
      { amount: new Prisma.Decimal("1.00"), direction: "DEBIT" },
      { amount: new Prisma.Decimal("0.50"), direction: "CREDIT" },
    ];
  });
  stub(t, prisma.campaign, "updateMany", async (args: any) => {
    updatedCost = args.data.totalCost;
    return { count: 1 };
  });

  const total = await refreshCampaignCost("workspace-1", "campaign-1");
  assert.equal(total.toFixed(2), "2.75");
  assert.equal(updatedCost?.toFixed(2), "2.75");
});

test("campaign completion cannot overwrite a concurrent pause or cancellation", async (t) => {
  const updates: any[] = [];
  stub(t, prisma.campaign, "findFirst", async () => ({ status: "RUNNING", retryFailed: false }));
  stub(t, prisma.campaignRecipient, "groupBy", async () => []);
  stub(t, prisma.campaignRecipient, "findMany", async () => []);
  stub(t, prisma.message, "findMany", async () => []);
  stub(t, prisma.campaign, "updateMany", async (args: any) => { updates.push(args); return { count: 1 }; });

  await refreshCampaignMetrics("workspace-1", "campaign-1");
  const completionUpdate = updates.at(-1);
  assert.equal(completionUpdate.where.status, "RUNNING");
  assert.equal(completionUpdate.data.status, "COMPLETED");
});
