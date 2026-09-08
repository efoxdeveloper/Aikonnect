import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

Object.assign(process.env, {
  NODE_ENV: "test", APP_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  ACCESS_TOKEN_SECRET: "unit-test-only-access-token-secret-000000",
  META_APP_ID: "test-app", META_APP_SECRET: "test-app-secret",
  META_TOKEN_ENCRYPTION_KEY: "test-token-encryption-key-for-tests-32chars",
  META_GRAPH_API_VERSION: "v25.0", LOG_LEVEL: "silent",
});
const { sendTestMessage, disconnectWhatsApp } = await import("../src/modules/whatsapp/whatsapp.service.js");
const { createMessage } = await import("../src/modules/conversations/conversation.service.js");
const { prisma } = await import("../src/database/prisma.js");
const { AppError } = await import("../src/middleware/error-handler.js");
const { testMessageSchema } = await import("../src/modules/whatsapp/whatsapp.schemas.js");

function stub(t: TestContext, target: any, method: string, implementation: (...args: any[]) => any) {
  const original = target[method]; target[method] = implementation; t.after(() => { target[method] = original; });
}

test("test message sends through the saved active phone and records setup progress", async (t) => {
  const upserts: any[] = [];
  // The encrypted value is produced with the real helper so this covers decryption too.
  const { encryptSecret } = await import("../src/utils/crypto.js");
  stub(t, prisma.whatsAppBusinessAccount, "findFirst", async () => ({
    id: "account", encryptedAccessToken: encryptSecret("business-token", "test-token-encryption-key-for-tests-32chars"), phoneNumbers: [{ id: "phone", metaPhoneNumberId: "meta-phone" }],
  }));
  stub(t, prisma.workspaceSetupProgress, "upsert", async (args: any) => { upserts.push(args); return {}; });
  stub(t, globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    assert.match(String(input), /\/v25\.0\/meta-phone\/messages$/);
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer business-token");
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body, { messaging_product: "whatsapp", recipient_type: "individual", to: "919876543210", type: "text", text: { body: "This is a test message from Aikonnect." } });
    return new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] }), { status: 200 });
  });
  const result = await sendTestMessage("workspace", "+919876543210");
  assert.equal(result.messageId, "wamid.test");
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].where.workspaceId, "workspace");
  assert.ok(upserts[0].create.testMessageSentAt instanceof Date);
});

test("test message explains that a connection is required", async (t) => {
  stub(t, prisma.whatsAppBusinessAccount, "findFirst", async () => null);
  await assert.rejects(sendTestMessage("workspace", "+919876543210"), (error: unknown) => {
    assert.ok(error instanceof AppError); assert.equal(error.statusCode, 409); assert.equal(error.code, "WHATSAPP_NOT_CONNECTED"); return true;
  });
});

test("disconnect removes workspace credentials and marks numbers inactive", async (t) => {
  const calls: any[] = [];
  const transaction: any = {
    whatsAppBusinessAccount: {
      findMany: async () => [{ id: "account-1" }],
      updateMany: async (args: any) => { calls.push(["account", args]); return {}; },
    },
    whatsAppPhoneNumber: { updateMany: async (args: any) => { calls.push(["phone", args]); return {}; } },
    workspaceSetupProgress: { updateMany: async (args: any) => { calls.push(["progress", args]); return {}; } },
  };
  stub(t, prisma, "$transaction", async (callback: (client: any) => Promise<unknown>) => callback(transaction));
  const result = await disconnectWhatsApp("workspace");
  assert.equal(result.disconnectedAccounts, 1);
  assert.equal(calls[0][0], "phone"); assert.equal(calls[0][1].data.status, "DISCONNECTED");
  assert.equal(calls[1][0], "account"); assert.equal(calls[1][1].data.encryptedAccessToken, null);
  assert.equal(calls[2][0], "progress"); assert.equal(calls[2][1].data.testMessageSentAt, null);
  assert.match(result.message, /fully disconnect.*WhatsApp Business/i);
});

test("conversation replies are sent through Meta before being saved", async (t) => {
  const { encryptSecret } = await import("../src/utils/crypto.js");
  const encryptedAccessToken = encryptSecret("business-token", "test-token-encryption-key-for-tests-32chars");
  const sentAt = new Date("2026-09-08T06:00:00.000Z");
  const conversation = {
    id: "conversation",
    workspaceId: "workspace",
    contactId: "contact",
    phoneNumberId: "phone",
    channelKey: "whatsapp",
    contact: { phoneE164: "+919876543210" },
    phoneNumber: { metaPhoneNumberId: "meta-phone", status: "ACTIVE", businessAccount: { status: "CONNECTED", encryptedAccessToken } },
  };
  let created = 0;
  stub(t, prisma.conversation, "findFirst", async () => conversation);
  stub(t, prisma.message, "findUnique", async () => null);
  stub(t, prisma.message, "create", async (args: any) => { created += 1; return { id: "message", ...args.data, createdAt: sentAt, updatedAt: sentAt, deliveredAt: null, readAt: null, failedAt: null, failureReason: null }; });
  stub(t, prisma.conversation, "update", async () => ({}));
  stub(t, prisma, "$transaction", async (callback: (client: any) => Promise<unknown>) => callback(prisma));
  stub(t, globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    assert.match(String(input), /\/v25\.0\/meta-phone\/messages$/);
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer business-token");
    assert.deepEqual(JSON.parse(String(init?.body)), { messaging_product: "whatsapp", recipient_type: "individual", to: "919876543210", type: "text", text: { body: "Hello from Inbox" } });
    return new Response(JSON.stringify({ messages: [{ id: "wamid.reply" }] }), { status: 200 });
  });

  const result = await createMessage("workspace", "contact", "conversation", "user", { direction: "OUTGOING", type: "TEXT", status: "SENT", text: "Hello from Inbox", payload: {} });
  assert.equal(result.message.metaMessageId, "wamid.reply");
  assert.equal(created, 1);
});

test("a rejected Meta reply is not saved locally", async (t) => {
  const { encryptSecret } = await import("../src/utils/crypto.js");
  stub(t, prisma.conversation, "findFirst", async () => ({
    id: "conversation", workspaceId: "workspace", contactId: "contact", phoneNumberId: "phone", channelKey: "whatsapp",
    contact: { phoneE164: "+919876543210" },
    phoneNumber: { metaPhoneNumberId: "meta-phone", status: "ACTIVE", businessAccount: { status: "CONNECTED", encryptedAccessToken: encryptSecret("business-token", "test-token-encryption-key-for-tests-32chars") } },
  }));
  let created = 0;
  stub(t, prisma.message, "create", async () => { created += 1; return {}; });
  stub(t, globalThis, "fetch", async () => new Response(JSON.stringify({ error: { message: "(#131047) Re-engagement message" } }), { status: 400 }));
  await assert.rejects(
    createMessage("workspace", "contact", "conversation", "user", { direction: "OUTGOING", type: "TEXT", status: "SENT", text: "Hello from Inbox", payload: {} }),
    (error: unknown) => { assert.ok(error instanceof AppError); assert.equal(error.statusCode, 502); assert.match(error.message, /Meta rejected.*sending the WhatsApp message/i); return true; },
  );
  assert.equal(created, 0);
});

test("test recipient validation requires an E.164 number", () => {
  assert.equal(testMessageSchema.safeParse({ to: "+919876543210" }).success, true);
  for (const to of ["919876543210", "+1", "+abc", "+12345678901234567"]) assert.equal(testMessageSchema.safeParse({ to }).success, false);
});
