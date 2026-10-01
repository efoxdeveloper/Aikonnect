import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  APP_URL: "http://localhost:5173",
  ACCESS_TOKEN_SECRET: "unit-test-only-access-token-secret-000000",
  META_APP_ID: "test-app",
  META_APP_SECRET: "test-app-secret",
  META_TOKEN_ENCRYPTION_KEY: "test-token-encryption-key-for-tests-32chars",
  LOG_LEVEL: "silent",
});

const { prisma } = await import("../src/database/prisma.js");
const { claimRecipient } = await import("../src/modules/campaigns/campaign.worker.js");

function stub(t: TestContext, target: any, method: string, implementation: (...args: any[]) => any) {
  const original = target[method];
  target[method] = implementation;
  t.after(() => { target[method] = original; });
}

test("recipient lease allows only one concurrent worker claim", async (t) => {
  const candidate = { id: "recipient-1", contactId: "contact-1", phoneE164: "+919876543210", status: "PENDING", attemptCount: 0 };
  let claimed = false;
  const queries: any[] = [];
  stub(t, prisma.campaignRecipient, "findFirst", async (args: any) => {
    queries.push(args);
    return candidate;
  });
  stub(t, prisma.campaignRecipient, "updateMany", async (args: any) => {
    if (claimed) return { count: 0 };
    claimed = true;
    assert.equal(args.where.id, candidate.id);
    assert.equal(args.where.status, "PENDING");
    assert.equal(args.where.processingToken, null);
    assert.equal(args.data.status, "ATTEMPTED");
    assert.match(args.data.processingToken, /^[0-9a-f-]{36}$/i);
    assert.ok(args.data.processingExpiresAt instanceof Date);
    return { count: 1 };
  });

  const results = await Promise.all([claimRecipient("campaign-1"), claimRecipient("campaign-1")]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(queries.length, 2);
  assert.ok(results.find(Boolean)?.leaseToken);
});

test("recipient lease query does not reclaim a current attempt after one second", async (t) => {
  let query: any;
  stub(t, prisma.campaignRecipient, "findFirst", async (args: any) => {
    query = args;
    return null;
  });

  await claimRecipient("campaign-1");
  const attemptedRule = query.where.OR.find((item: any) => item.status === "ATTEMPTED");
  assert.ok(attemptedRule);
  assert.ok(attemptedRule.OR.some((item: any) => item.processingExpiresAt?.lte instanceof Date));
  assert.ok(attemptedRule.OR.some((item: any) => item.processingToken === null));
});
