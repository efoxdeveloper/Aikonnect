import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test, type TestContext } from "node:test";

Object.assign(process.env, {
  NODE_ENV: "test",
  APP_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  ACCESS_TOKEN_SECRET: "unit-test-only-access-token-secret-000000",
  LOG_LEVEL: "silent",
});

const { prisma } = await import("../src/database/prisma.js");
const { enqueueMessageWebhook } = await import("../src/modules/webhooks/webhook.service.js");
const { processWebhookDelivery, webhookSignature } = await import("../src/modules/webhooks/webhook-delivery.worker.js");

function stub(t: TestContext, target: any, method: string, implementation: (...args: any[]) => any) {
  const original = target[method];
  target[method] = implementation;
  t.after(() => { target[method] = original; });
}

test("message status webhooks preserve the message id and callback data", { concurrency: false }, async (t) => {
  let createManyArgs: any;
  stub(t, prisma.message, "findUnique", async () => ({
    id: "message-1",
    workspaceId: "workspace-1",
    metaMessageId: "wamid-1",
    status: "DELIVERED",
    type: "DOCUMENT",
    text: "Your invoice",
    mediaUrl: "https://cdn.example.com/invoice.pdf",
    sentAt: new Date("2026-10-01T10:00:00.000Z"),
    deliveredAt: new Date("2026-10-01T10:00:02.000Z"),
    readAt: null,
    failedAt: null,
    failureReason: null,
    payload: { source: "public_api", callbackData: "order-123" },
    contact: { id: "contact-1", name: "Customer", phoneE164: "+919876543210", email: null, userId: "customer-1" },
  }));
  stub(t, prisma.webhookEndpoint, "findMany", async () => [{ id: "endpoint-1" }]);
  stub(t, prisma.webhookDelivery, "createMany", async (args: any) => { createManyArgs = args; return { count: 1 }; });

  assert.equal(await enqueueMessageWebhook("message-1", "message.delivered"), 1);
  assert.equal(createManyArgs.data[0].eventType, "message.delivered");
  assert.equal(createManyArgs.data[0].workspaceId, "workspace-1");
  assert.equal(createManyArgs.data[0].messageId, "message-1");
  assert.equal(createManyArgs.data[0].payload.type, "message.delivered");
  assert.equal(createManyArgs.data[0].payload.data.message.id, "message-1");
  assert.equal(createManyArgs.data[0].payload.data.message.message_status, "Delivered");
  assert.equal(createManyArgs.data[0].payload.data.message.meta_data.source_data.callback_data, "order-123");
});

test("webhook signatures cover the timestamp and exact JSON body", () => {
  const timestamp = "1790848800";
  const body = JSON.stringify({ id: "evt-1", type: "message.sent" });
  const expected = `sha256=${createHmac("sha256", "secret").update(`${timestamp}.${body}`).digest("hex")}`;
  assert.equal(webhookSignature("secret", timestamp, body), expected);
});

test("webhook delivery sends signed JSON and records the delivery", { concurrency: false }, async (t) => {
  let claimUpdate = 0;
  let deliveredUpdate = 0;
  let endpointUpdate = 0;
  let claimedToken = "";
  let request: { url: string; init?: RequestInit } | undefined;
  stub(t, prisma.webhookDelivery, "findFirst", async () => ({ id: "delivery-1", attemptCount: 0 }));
  stub(t, prisma.webhookDelivery, "updateMany", async (args: any) => {
    if (claimUpdate++ === 0) {
      claimedToken = args.data.processingToken;
      return { count: 1 };
    }
    deliveredUpdate += 1;
    return { count: 1 };
  });
  stub(t, prisma.webhookEndpoint, "update", async () => { endpointUpdate += 1; return {}; });
  stub(t, prisma, "$transaction", async (callback: (transaction: typeof prisma) => Promise<unknown>) => callback(prisma));
  stub(t, globalThis, "fetch", async (url: string | URL, init?: RequestInit) => {
    request = { url: String(url), init };
    return new Response("ok", { status: 200 });
  });
  // The worker decrypts the stored secret before sending. Use the real encrypted value
  // so this test validates the production signing path instead of bypassing it.
  const { encryptSecret } = await import("../src/utils/crypto.js");
  const stored = encryptSecret("whsec_test-secret", process.env.ACCESS_TOKEN_SECRET!);
  stub(t, prisma.webhookDelivery, "findUnique", async () => ({
    id: "delivery-1",
    endpointId: "endpoint-1",
    eventType: "message.sent",
    payload: { version: "1.0", id: "evt-1", type: "message.sent" },
    processingToken: claimedToken,
    endpoint: { url: "https://developer.example.com/marento-webhook", secretEncrypted: stored, active: true },
  }));

  assert.equal(await processWebhookDelivery(), true);
  assert.equal(request?.url, "https://developer.example.com/marento-webhook");
  assert.equal(request?.init?.method, "POST");
  const headers = request?.init?.headers as Record<string, string>;
  assert.equal(headers["x-marento-event"], "message.sent");
  assert.equal(headers["x-marento-delivery-id"], "delivery-1");
  assert.match(headers["x-marento-signature"], /^sha256=[a-f0-9]{64}$/);
  assert.equal(deliveredUpdate, 1);
  assert.equal(endpointUpdate, 1);
});
