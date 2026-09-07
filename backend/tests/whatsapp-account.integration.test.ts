import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { app } from "../src/app.js";
import { prisma } from "../src/database/prisma.js";
import { decryptSecret } from "../src/utils/crypto.js";

let server: Server;
let apiBaseUrl: string;
const createdEmails: string[] = [];

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test API did not bind to TCP");
      apiBaseUrl = `http://127.0.0.1:${address.port}/api/v1`;
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

test("embedded signup requires workspace authentication and validates its callback data", async () => {
  const anonymous = await fetch(`${apiBaseUrl}/workspaces/00000000-0000-0000-0000-000000000000/whatsapp/embedded-signup`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
  assert.equal(anonymous.status, 401);
  const contentSecurityPolicy = anonymous.headers.get("content-security-policy") ?? "";
  assert.match(contentSecurityPolicy, /script-src[^;]*https:\/\/connect\.facebook\.net/);
  assert.match(contentSecurityPolicy, /frame-src[^;]*https:\/\/www\.facebook\.com/);
});

test("exchanges the signup code and stores the Meta account and phone against the workspace", async (testContext) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `whatsapp-account-integration-${suffix}@example.com`;
  createdEmails.push(email);
  const registration = await fetch(`${apiBaseUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "IntegrationPassword123", firstName: "WhatsApp", lastName: "Tester", companyName: "WhatsApp Workspace", annualRevenue: "under-50-lakh" }),
  });
  assert.equal(registration.status, 201);
  const registrationBody = (await registration.json()) as { data: { accessToken: string; workspace: { id: string }; verificationUrl: string } };
  const verificationToken = new URL(registrationBody.data.verificationUrl).searchParams.get("token");
  assert.ok(verificationToken);
  await fetch(`${apiBaseUrl}/auth/verify-email`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: verificationToken }) });
  const authorization = { authorization: `Bearer ${registrationBody.data.accessToken}` };
  const workspaceId = registrationBody.data.workspace.id;

  const invalid = await fetch(`${apiBaseUrl}/workspaces/${workspaceId}/whatsapp/embedded-signup`, { method: "POST", headers: { ...authorization, "content-type": "application/json" }, body: JSON.stringify({ code: "only-code" }) });
  assert.equal(invalid.status, 422);

  const accessToken = `meta-user-token-${suffix}`;
  const wabaId = `waba-${suffix}`;
  const phoneNumberId = `phone-${suffix}`;
  const requests: string[] = [];
  let businessAccountAttempts = 0;
  const originalFetch = globalThis.fetch;
  testContext.mock.method(globalThis, "fetch", async (input, init) => {
    const url = String(input);
    if (!url.startsWith("https://graph.facebook.com/")) return originalFetch(input, init);
    requests.push(`${init?.method ?? "GET"} ${url}`);
    if (url.includes("diagnostic-network-code")) {
      const error = new TypeError("fetch failed");
      error.cause = { code: "ECONNRESET" };
      throw error;
    }
    if (url.includes("diagnostic-invalid-response")) return new Response("null", { status: 200 });
    if (url.includes("/oauth/access_token")) return new Response(JSON.stringify({ access_token: accessToken, expires_in: 0 }), { status: 200 });
    if (url.includes(`/${wabaId}?fields=id,name`)) {
      businessAccountAttempts += 1;
      if (businessAccountAttempts === 1) {
        const error = new TypeError("fetch failed");
        error.cause = { code: "ECONNRESET" };
        throw error;
      }
      return new Response(JSON.stringify({ id: wabaId, name: "Test Business" }), { status: 200 });
    }
    if (url.includes(`/${phoneNumberId}?fields=`)) return new Response(JSON.stringify({ id: phoneNumberId, display_phone_number: "+919876543210", verified_name: "Test Business", quality_rating: "GREEN", messaging_limit: "TIER_1", is_on_biz_app: true, platform_type: "CLOUD_API" }), { status: 200 });
    if (url.includes(`/${wabaId}/subscribed_apps`)) return new Response(JSON.stringify({ error: { message: "Webhook subscription is not available in this test app" } }), { status: 403 });
    if (url.includes(`/${phoneNumberId}/smb_app_data`)) return new Response(JSON.stringify({ request_id: `request-${requests.length}` }), { status: 200 });
    return new Response("Unexpected Meta request", { status: 500 });
  });
  const unavailable = await fetch(`${apiBaseUrl}/workspaces/${workspaceId}/whatsapp/embedded-signup`, {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({ code: "diagnostic-network-code", wabaId }),
  });
  assert.equal(unavailable.status, 502);
  const unavailableBody = (await unavailable.json()) as { error: { code: string; message: string; details: { stage: string; reason: string; retryable: boolean } } };
  assert.equal(unavailableBody.error.code, "META_NETWORK_ERROR");
  assert.equal(unavailableBody.error.details.stage, "exchange_signup_code");
  assert.equal(unavailableBody.error.details.retryable, true);
  assert.match(unavailableBody.error.message, /connection to Meta was interrupted/i);

  const malformed = await fetch(`${apiBaseUrl}/workspaces/${workspaceId}/whatsapp/embedded-signup`, {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({ code: "diagnostic-invalid-response", wabaId }),
  });
  assert.equal(malformed.status, 502);
  const malformedBody = (await malformed.json()) as { error: { code: string; details: { stage: string } } };
  assert.equal(malformedBody.error.code, "META_RESPONSE_INVALID");
  assert.equal(malformedBody.error.details.stage, "exchange_signup_code");

  const connected = await fetch(`${apiBaseUrl}/workspaces/${workspaceId}/whatsapp/embedded-signup`, {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({ code: "meta-auth-code", businessId: `business-${suffix}`, wabaId, phoneNumberId }),
  });
  assert.equal(connected.status, 200);
  const connectedBody = (await connected.json()) as { data: { syncWarnings: string[] } };
  assert.equal(connectedBody.data.syncWarnings.length, 1);
  assert.match(connectedBody.data.syncWarnings[0] ?? "", /subscribing the app to WhatsApp webhooks: Webhook subscription is not available/i);
  const account = await prisma.whatsAppBusinessAccount.findFirstOrThrow({ where: { workspaceId, metaWabaId: wabaId } });
  const phone = await prisma.whatsAppPhoneNumber.findFirstOrThrow({ where: { businessAccountId: account.id, metaPhoneNumberId: phoneNumberId } });
  assert.equal(account.status, "CONNECTED");
  assert.match(account.lastError ?? "", /subscribing the app to WhatsApp webhooks: Webhook subscription is not available/i);
  assert.equal(phone.status, "ACTIVE");
  assert.equal(phone.isOnBusinessApp, true);
  assert.equal(phone.platformType, "CLOUD_API");
  assert.equal(businessAccountAttempts, 2);
  assert.ok(requests.some((request) => request.includes(`POST https://graph.facebook.com/`) && request.includes(`/${wabaId}/subscribed_apps`)));
  assert.equal(requests.filter((request) => request.includes(`/${phoneNumberId}/smb_app_data`)).length, 2);
  assert.notEqual(account.encryptedAccessToken, accessToken);
  assert.equal(decryptSecret(account.encryptedAccessToken!, "test-token-encryption-key-for-tests-32chars"), accessToken);
});
