import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import { after, before, test } from "node:test";

const [{ app }, { prisma }, { env }] = await Promise.all([
  import("../src/app.js"),
  import("../src/database/prisma.js"),
  import("../src/config/env.js"),
]);

const configuredWebhookSecret = env.META_APP_SECRET;
const configuredVerifyToken = env.META_WEBHOOK_VERIFY_TOKEN;

let server: Server;
let baseUrl: string;
const createdEmails: string[] = [];

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test API did not bind to TCP");
      baseUrl = `http://127.0.0.1:${address.port}/api/webhooks/whatsapp`;
      resolve();
    });
  });
});

after(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } }, select: { id: true } });
  const userIds = users.map(({ id }) => id);
  if (userIds.length) {
    await prisma.workspace.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await prisma.$disconnect();
});

test("verifies Meta webhook subscriptions and rejects invalid signatures", async () => {
  const invalid = await fetch(`${baseUrl}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc`);
  assert.equal(invalid.status, 403);
  assert.ok(configuredVerifyToken);
  const verified = await fetch(`${baseUrl}?hub.mode=subscribe&hub.verify_token=${configuredVerifyToken}&hub.challenge=abc123`);
  assert.equal(verified.status, 200);
  assert.equal(await verified.text(), "abc123");

  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const unsigned = await fetch(baseUrl, { method: "POST", headers: { "content-type": "application/json" }, body });
  assert.equal(unsigned.status, 401);
  assert.ok(configuredWebhookSecret);
  const signature = createHmac("sha256", configuredWebhookSecret).update(body).digest("hex");
  const accepted = await fetch(baseUrl, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${signature}` }, body });
  assert.equal(accepted.status, 200);
});

test("ingests incoming WhatsApp messages into the mapped workspace and deduplicates retries", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `webhook-integration-${suffix}@example.com`;
  createdEmails.push(email);
  const registration = await fetch(`${baseUrl.replace("/api/webhooks/whatsapp", "/api/v1")}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "IntegrationPassword123", firstName: "Webhook", lastName: "Tester", companyName: "Webhook Workspace", annualRevenue: "under-50-lakh" }),
  });
  assert.equal(registration.status, 201);
  const registrationBody = (await registration.json()) as { data: { workspace: { id: string } } };
  const workspaceId = registrationBody.data.workspace.id;
  const account = await prisma.whatsAppBusinessAccount.create({ data: { workspaceId, metaWabaId: `waba-${suffix}`, status: "CONNECTED" } });
  const phoneNumber = await prisma.whatsAppPhoneNumber.create({ data: { businessAccountId: account.id, metaPhoneNumberId: `phone-${suffix}`, displayPhoneNumber: "+919876543210", status: "ACTIVE" } });
  const payload = {
    object: "whatsapp_business_account",
    entry: [{ id: account.metaWabaId, changes: [{ field: "messages", value: { metadata: { phone_number_id: phoneNumber.metaPhoneNumberId }, contacts: [{ wa_id: "919812345678", profile: { name: "Webhook Customer" } }], messages: [{ from: "919812345678", id: `wamid-${suffix}`, timestamp: "1750000000", type: "text", text: { body: "Hello from Meta" } }] } }] }],
  };
  const body = JSON.stringify(payload);
  assert.ok(configuredWebhookSecret);
  const signature = createHmac("sha256", configuredWebhookSecret).update(body).digest("hex");
  const headers = { "content-type": "application/json", "x-hub-signature-256": `sha256=${signature}` };
  const first = await fetch(baseUrl, { method: "POST", headers, body });
  const retry = await fetch(baseUrl, { method: "POST", headers, body });
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal(await prisma.contact.count({ where: { workspaceId, whatsappId: "919812345678" } }), 1);
  assert.equal(await prisma.conversation.count({ where: { workspaceId, phoneNumberId: phoneNumber.id } }), 1);
  assert.equal(await prisma.message.count({ where: { workspaceId, metaMessageId: `wamid-${suffix}` } }), 1);
  assert.equal((await prisma.message.findFirstOrThrow({ where: { workspaceId, metaMessageId: `wamid-${suffix}` } })).text, "Hello from Meta");
});

test("ingests coexistence contact state and outbound message echoes", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `webhook-coexistence-${suffix}@example.com`;
  createdEmails.push(email);
  const registration = await fetch(`${baseUrl.replace("/api/webhooks/whatsapp", "/api/v1")}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "IntegrationPassword123", firstName: "Coex", lastName: "Tester", companyName: "Coex Workspace", annualRevenue: "under-50-lakh" }),
  });
  assert.equal(registration.status, 201);
  const registrationBody = (await registration.json()) as { data: { workspace: { id: string } } };
  const workspaceId = registrationBody.data.workspace.id;
  const account = await prisma.whatsAppBusinessAccount.create({ data: { workspaceId, metaWabaId: `waba-coex-${suffix}`, status: "CONNECTED" } });
  const phoneNumber = await prisma.whatsAppPhoneNumber.create({ data: { businessAccountId: account.id, metaPhoneNumberId: `phone-coex-${suffix}`, displayPhoneNumber: "+919876543210", status: "ACTIVE", isOnBusinessApp: true, platformType: "CLOUD_API" } });
  const payload = {
    object: "whatsapp_business_account",
    entry: [{ id: account.metaWabaId, changes: [
      { field: "smb_app_state_sync", value: { metadata: { phone_number_id: phoneNumber.metaPhoneNumberId }, state_sync: [{ type: "contact", action: "add", contact: { full_name: "Coex Customer", phone_number: "919812345678" } }] } },
      { field: "smb_message_echoes", value: { metadata: { phone_number_id: phoneNumber.metaPhoneNumberId }, message_echoes: [{ to: "919812345678", id: `echo-${suffix}`, timestamp: "1750000000", type: "text", text: { body: "Sent from WhatsApp Business App" } }] } },
      { field: "message_echoes", value: { metadata: { phone_number_id: phoneNumber.metaPhoneNumberId }, message_echoes: [{ to: "919812345678", id: `message-echo-${suffix}`, timestamp: "1750000001", type: "text", text: { body: "Sent from WhatsApp Business App (message echo)" } }] } },
      { field: "history", value: { metadata: { phone_number_id: phoneNumber.metaPhoneNumberId }, history: [{ metadata: { phase: 0, chunk_order: 1, progress: 100 }, threads: [{ id: "919812345678", messages: [{ from: "919812345678", id: `history-${suffix}`, timestamp: "1740000000", type: "text", text: { body: "Earlier conversation" } }] }] }] } },
    ] }],
  };
  const body = JSON.stringify(payload);
  assert.ok(configuredWebhookSecret);
  const signature = createHmac("sha256", configuredWebhookSecret).update(body).digest("hex");
  const response = await fetch(baseUrl, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${signature}` }, body });
  assert.equal(response.status, 200);
  assert.equal(await prisma.contact.count({ where: { workspaceId, whatsappId: "919812345678" } }), 1);
  const echo = await prisma.message.findFirstOrThrow({ where: { workspaceId, metaMessageId: `echo-${suffix}` } });
  assert.equal(echo.direction, "OUTGOING");
  assert.equal(echo.text, "Sent from WhatsApp Business App");
  const messageEcho = await prisma.message.findFirstOrThrow({ where: { workspaceId, metaMessageId: `message-echo-${suffix}` } });
  assert.equal(messageEcho.direction, "OUTGOING");
  assert.equal(messageEcho.text, "Sent from WhatsApp Business App (message echo)");
  const historyMessage = await prisma.message.findFirstOrThrow({ where: { workspaceId, metaMessageId: `history-${suffix}` } });
  assert.equal(historyMessage.direction, "INCOMING");
  assert.equal(historyMessage.text, "Earlier conversation");
});
