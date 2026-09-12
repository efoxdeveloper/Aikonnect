import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { app } from "../src/app.js";
import { prisma } from "../src/database/prisma.js";

let server: Server;
let baseUrl: string;
const createdEmails: string[] = [];

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test API did not bind to TCP");
      baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
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

async function registerVerified(label: string) {
  const email = `api-keys-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  createdEmails.push(email);
  const registrationResponse = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "ApiKeysIntegration123", firstName: "API", lastName: label, companyName: `${label} API Test` }),
  });
  assert.equal(registrationResponse.status, 201);
  const registration = (await registrationResponse.json()) as { data: { accessToken: string; workspace: { id: string }; verificationUrl: string } };
  const token = new URL(registration.data.verificationUrl).searchParams.get("token");
  assert.ok(token);
  const verificationResponse = await fetch(`${baseUrl}/auth/verify-email`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
  assert.equal(verificationResponse.status, 200);
  return registration.data;
}

function authorized(token: string) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

test("API key management enforces authentication, workspace access, one-time secrets, and revocation", async () => {
  const anonymous = await fetch(`${baseUrl}/workspaces/00000000-0000-4000-8000-000000000000/api-keys`);
  assert.equal(anonymous.status, 401);

  const owner = await registerVerified("owner");
  const otherUser = await registerVerified("other");
  const endpoint = `${baseUrl}/workspaces/${owner.workspace.id}/api-keys`;
  const invalid = await fetch(endpoint, { method: "POST", headers: authorized(owner.accessToken), body: JSON.stringify({ name: "" }) });
  assert.equal(invalid.status, 422);

  const forbidden = await fetch(endpoint, { headers: authorized(otherUser.accessToken) });
  assert.equal(forbidden.status, 403);

  const createdResponse = await fetch(endpoint, { method: "POST", headers: authorized(owner.accessToken), body: JSON.stringify({ name: "Order sync" }) });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()) as { data: { apiKey: { id: string; keyPrefix: string }; secret: string } };
  assert.match(created.data.secret, /^sk_live_/);
  assert.match(created.data.apiKey.keyPrefix, /…$/);
  assert.notEqual(created.data.apiKey.keyPrefix, created.data.secret);

  const listedResponse = await fetch(endpoint, { headers: authorized(owner.accessToken) });
  assert.equal(listedResponse.status, 200);
  const listed = (await listedResponse.json()) as { data: { items: Array<{ id: string; keyPrefix: string; revokedAt: string | null }> } };
  assert.equal(listed.data.items[0]?.keyPrefix, created.data.apiKey.keyPrefix);
  assert.equal(listed.data.items[0]?.revokedAt, null);

  const revokedResponse = await fetch(`${endpoint}/${created.data.apiKey.id}`, { method: "DELETE", headers: authorized(owner.accessToken) });
  assert.equal(revokedResponse.status, 204);
  const afterRevokeResponse = await fetch(endpoint, { headers: authorized(owner.accessToken) });
  const afterRevoke = (await afterRevokeResponse.json()) as { data: { items: Array<{ revokedAt: string | null }> } };
  assert.ok(afterRevoke.data.items[0]?.revokedAt);
});

test("webhook management requires HTTPS and never returns the stored signing secret", async () => {
  const owner = await registerVerified("webhook");
  const endpoint = `${baseUrl}/workspaces/${owner.workspace.id}/webhooks`;
  const insecure = await fetch(endpoint, { method: "POST", headers: authorized(owner.accessToken), body: JSON.stringify({ name: "Insecure", url: "http://example.com/hook" }) });
  assert.equal(insecure.status, 422);

  const createdResponse = await fetch(endpoint, { method: "POST", headers: authorized(owner.accessToken), body: JSON.stringify({ name: "Production", url: "https://example.com/hook" }) });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()) as { data: { webhook: { id: string; url: string }; secret: string } };
  assert.equal(created.data.webhook.url, "https://example.com/hook");
  assert.match(created.data.secret, /^whsec_/);

  const listedResponse = await fetch(endpoint, { headers: authorized(owner.accessToken) });
  const listed = (await listedResponse.json()) as { data: { items: Array<Record<string, unknown>> } };
  assert.equal(listed.data.items[0]?.url, "https://example.com/hook");
  assert.equal("secret" in (listed.data.items[0] ?? {}), false);

  const removedResponse = await fetch(`${endpoint}/${created.data.webhook.id}`, { method: "DELETE", headers: authorized(owner.accessToken) });
  assert.equal(removedResponse.status, 204);
});
