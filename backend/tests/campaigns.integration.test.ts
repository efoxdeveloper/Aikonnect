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

async function registerVerified() {
  const email = `campaign-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  createdEmails.push(email);
  const registrationResponse = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "CampaignIntegration123", firstName: "Campaign", lastName: "Tester", companyName: "Campaign Workspace" }),
  });
  assert.equal(registrationResponse.status, 201);
  const registration = (await registrationResponse.json()) as { data: { accessToken: string; workspace: { id: string }; verificationUrl: string } };
  const token = new URL(registration.data.verificationUrl).searchParams.get("token");
  assert.ok(token);
  const verification = await fetch(`${baseUrl}/auth/verify-email`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
  assert.equal(verification.status, 200);
  return registration.data;
}

function headers(accessToken: string) {
  return { authorization: `Bearer ${accessToken}`, "content-type": "application/json" };
}

test("campaign APIs enforce authentication and input validation", async () => {
  const anonymous = await fetch(`${baseUrl}/workspaces/00000000-0000-0000-0000-000000000000/campaigns`);
  assert.equal(anonymous.status, 401);

  const owner = await registerVerified();
  const invalid = await fetch(`${baseUrl}/workspaces/${owner.workspace.id}/campaigns`, {
    method: "POST",
    headers: headers(owner.accessToken),
    body: JSON.stringify({ name: "Scheduled without a date", audienceLabel: "Everyone", launchMode: "schedule" }),
  });
  assert.equal(invalid.status, 422);
  const body = (await invalid.json()) as { error: { code: string } };
  assert.equal(body.error.code, "VALIDATION_ERROR");

  const ineligible = await fetch(`${baseUrl}/workspaces/${owner.workspace.id}/campaigns`, {
    method: "POST",
    headers: headers(owner.accessToken),
    body: JSON.stringify({ name: "Unconsented audience", audienceType: "manual", audienceLabel: "Manual numbers", phoneNumbers: ["+919999999999"], launchMode: "draft" }),
  });
  assert.equal(ineligible.status, 422);
  assert.equal(((await ineligible.json()) as { error: { code: string } }).error.code, "CAMPAIGN_PHONE_NOT_ELIGIBLE");

  const membership = await prisma.workspaceMember.findFirstOrThrow({ where: { workspaceId: owner.workspace.id }, select: { roleId: true } });
  const sendPermission = await prisma.permission.findUniqueOrThrow({ where: { key: "campaigns.send" }, select: { id: true } });
  await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: membership.roleId, permissionId: sendPermission.id } } });
  const unauthorizedLive = await fetch(`${baseUrl}/workspaces/${owner.workspace.id}/campaigns`, {
    method: "POST",
    headers: headers(owner.accessToken),
    body: JSON.stringify({ name: "Unauthorized live campaign", templateKey: "approved-template", audienceLabel: "Everyone", launchMode: "send" }),
  });
  assert.equal(unauthorizedLive.status, 403);
  assert.equal(((await unauthorizedLive.json()) as { error: { code: string } }).error.code, "PERMISSION_DENIED");
});

test("campaigns persist audience snapshots, support filters and duplicate safely", async () => {
  const owner = await registerVerified();
  const workspaceUrl = `${baseUrl}/workspaces/${owner.workspace.id}`;
  const contactResponse = await fetch(`${workspaceUrl}/contacts`, {
    method: "POST",
    headers: headers(owner.accessToken),
    body: JSON.stringify({ name: "Campaign Customer", phone: "+919876543210" }),
  });
  assert.equal(contactResponse.status, 201);
  const contact = (await contactResponse.json()) as { data: { id: string } };

  const create = await fetch(`${workspaceUrl}/campaigns`, {
    method: "POST",
    headers: headers(owner.accessToken),
    body: JSON.stringify({ name: "Welcome Contacts", kind: "one_time", category: "Marketing", audienceType: "contacts", audienceLabel: "Selected contacts (1)", contactIds: [contact.data.id], launchMode: "draft" }),
  });
  assert.equal(create.status, 201);
  const created = (await create.json()) as { data: { id: string; status: string; recipientCount: number; createdBy: string } };
  assert.equal(created.data.status, "DRAFT");
  assert.equal(created.data.recipientCount, 1);
  assert.equal(created.data.createdBy, "Campaign Tester");

  const list = await fetch(`${workspaceUrl}/campaigns?search=welcome&kind=one_time&hasSetLive=false`, { headers: { authorization: `Bearer ${owner.accessToken}` } });
  assert.equal(list.status, 200);
  const listed = (await list.json()) as { data: { items: Array<{ id: string; recipientCount: number }>; pagination: { total: number } } };
  assert.equal(listed.data.pagination.total, 1);
  assert.equal(listed.data.items[0]?.recipientCount, 1);

  const detail = await fetch(`${workspaceUrl}/campaigns/${created.data.id}`, { headers: { authorization: `Bearer ${owner.accessToken}` } });
  assert.equal(detail.status, 200);
  const detailed = (await detail.json()) as { data: { recipients: Array<{ phoneE164: string; status: string }> } };
  assert.deepEqual(detailed.data.recipients.map(({ phoneE164, status }) => ({ phoneE164, status })), [{ phoneE164: "+919876543210", status: "PENDING" }]);

  const duplicate = await fetch(`${workspaceUrl}/campaigns/${created.data.id}/duplicate`, { method: "POST", headers: headers(owner.accessToken) });
  assert.equal(duplicate.status, 201);
  const duplicated = (await duplicate.json()) as { data: { name: string; recipientCount: number; status: string } };
  assert.equal(duplicated.data.name, "Welcome Contacts (Copy)");
  assert.equal(duplicated.data.recipientCount, 1);
  assert.equal(duplicated.data.status, "DRAFT");

  const crossWorkspace = await fetch(`${baseUrl}/workspaces/00000000-0000-0000-0000-000000000000/campaigns`, { headers: { authorization: `Bearer ${owner.accessToken}` } });
  assert.equal(crossWorkspace.status, 403);
});
