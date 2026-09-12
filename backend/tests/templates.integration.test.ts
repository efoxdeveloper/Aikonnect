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

test("template endpoints require workspace authentication", async () => {
  const response = await fetch(`${baseUrl}/workspaces/00000000-0000-0000-0000-000000000000/templates`);
  assert.equal(response.status, 401);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, "AUTHENTICATION_REQUIRED");
});

test("templates are created, listed, updated and deleted within their workspace", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `template-integration-${suffix}@example.com`;
  createdEmails.push(email);
  const password = "IntegrationPassword123";
  const registration = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, firstName: "Template", lastName: "Tester", companyName: "Template Workspace", annualRevenue: "under-50-lakh" }),
  });
  assert.equal(registration.status, 201);
  const registrationBody = (await registration.json()) as { data: { accessToken: string; workspace: { id: string }; verificationUrl: string } };
  const token = new URL(registrationBody.data.verificationUrl).searchParams.get("token");
  assert.ok(token);
  const verification = await fetch(`${baseUrl}/auth/verify-email`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
  assert.equal(verification.status, 200);
  const authorization = { authorization: `Bearer ${registrationBody.data.accessToken}` };
  const workspaceId = registrationBody.data.workspace.id;

  const invalid = await fetch(`${baseUrl}/workspaces/${workspaceId}/templates`, { method: "POST", headers: { ...authorization, "content-type": "application/json" }, body: JSON.stringify({ name: "Missing body" }) });
  assert.equal(invalid.status, 422);

  const create = await fetch(`${baseUrl}/workspaces/${workspaceId}/templates`, {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({ saveAs: "draft", name: "Summer Sale", category: "Marketing", language: "English", templateType: "standard", headerType: "text", headerText: "A special offer", body: "Hi {{1}}, save today.", footer: "Reply STOP to opt out", content: { buttons: ["website"] } }),
  });
  assert.equal(create.status, 201);
  const created = (await create.json()) as { data: { id: string; key: string; status: string; createdBy: string } };
  assert.equal(created.data.key, "summer-sale");
  assert.equal(created.data.status, "DRAFT");
  assert.equal(created.data.createdBy, "Template Tester");

  const list = await fetch(`${baseUrl}/workspaces/${workspaceId}/templates?status=active`, { headers: authorization });
  assert.equal(list.status, 200);
  const listed = (await list.json()) as { data: { items: Array<{ id: string; name: string }> } };
  assert.equal(listed.data.items.some((item) => item.id === created.data.id && item.name === "Summer Sale"), true);

  const update = await fetch(`${baseUrl}/workspaces/${workspaceId}/templates/${created.data.id}`, { method: "PATCH", headers: { ...authorization, "content-type": "application/json" }, body: JSON.stringify({ saveAs: "draft", body: "Hi {{1}}, save this weekend." }) });
  assert.equal(update.status, 200);
  const updated = (await update.json()) as { data: { status: string } };
  assert.equal(updated.data.status, "DRAFT");

  const remove = await fetch(`${baseUrl}/workspaces/${workspaceId}/templates/${created.data.id}`, { method: "DELETE", headers: authorization });
  assert.equal(remove.status, 204);
  const deleted = await fetch(`${baseUrl}/workspaces/${workspaceId}/templates?status=deleted`, { headers: authorization });
  assert.equal(deleted.status, 200);
  const deletedBody = (await deleted.json()) as { data: { items: Array<{ id: string; status: string }> } };
  assert.equal(deletedBody.data.items.some((item) => item.id === created.data.id && item.status === "DELETED"), true);

  const crossWorkspace = await fetch(`${baseUrl}/workspaces/00000000-0000-0000-0000-000000000000/templates`, { headers: authorization });
  assert.equal(crossWorkspace.status, 403);
});
