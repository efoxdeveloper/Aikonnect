import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { app } from "../src/app.js";
import { prisma } from "../src/database/prisma.js";
import { applyAssignmentRules } from "../src/modules/assignment-rules/assignment-rule.service.js";

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

test("assignment rules support authorized CRUD and reject anonymous or invalid requests", async () => {
  const anonymous = await fetch(`${baseUrl}/workspaces/00000000-0000-0000-0000-000000000000/assignment-rules`);
  assert.equal(anonymous.status, 401);

  const email = `assignment-rules-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  createdEmails.push(email);
  const registration = await fetch(`${baseUrl}/auth/register`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "AssignmentRules123", firstName: "Rules", lastName: "Tester", companyName: "Rules Workspace" }),
  });
  assert.equal(registration.status, 201);
  const result = (await registration.json()) as { data: { accessToken: string; user: { id: string }; workspace: { id: string }; verificationUrl: string } };
  const token = new URL(result.data.verificationUrl).searchParams.get("token");
  assert.ok(token);
  await fetch(`${baseUrl}/auth/verify-email`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
  const workspaceUrl = `${baseUrl}/workspaces/${result.data.workspace.id}/assignment-rules`;
  const headers = { authorization: `Bearer ${result.data.accessToken}`, "content-type": "application/json" };
  const member = await prisma.workspaceMember.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: result.data.workspace.id, userId: result.data.user.id } }, select: { id: true } });

  const invalid = await fetch(workspaceUrl, { method: "POST", headers, body: JSON.stringify({ name: "Bad direct rule", strategy: "AGENT", memberIds: [member.id, member.id] }) });
  assert.equal(invalid.status, 422);

  const create = await fetch(workspaceUrl, { method: "POST", headers, body: JSON.stringify({ name: "VIP routing", strategy: "AGENT", memberIds: [member.id] }) });
  assert.equal(create.status, 201);
  const created = (await create.json()) as { data: { id: string; enabled: boolean; priority: number } };
  assert.equal(created.data.enabled, true);
  assert.equal(created.data.priority, 0);

  const contact = await prisma.contact.create({ data: { workspaceId: result.data.workspace.id, name: "Auto-routed contact", phoneE164: "+919876543210", source: "WhatsApp" }, select: { id: true } });
  const conversation = await prisma.conversation.create({ data: { workspaceId: result.data.workspace.id, contactId: contact.id, channelKey: "whatsapp", status: "OPEN" }, select: { id: true } });
  const assignment = await applyAssignmentRules(result.data.workspace.id, conversation.id);
  assert.equal(assignment?.assigneeMembershipId, member.id);
  assert.equal(assignment?.ruleId, created.data.id);
  assert.equal((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id }, select: { assigneeMembershipId: true } })).assigneeMembershipId, member.id);

  const list = await fetch(workspaceUrl, { headers });
  assert.equal(((await list.json()) as { data: { items: unknown[] } }).data.items.length, 1);
  const update = await fetch(`${workspaceUrl}/${created.data.id}`, { method: "PUT", headers, body: JSON.stringify({ name: "VIP routing paused", enabled: false, strategy: "AGENT", memberIds: [member.id] }) });
  assert.equal(update.status, 200);
  assert.equal(((await update.json()) as { data: { enabled: boolean } }).data.enabled, false);

  const remove = await fetch(`${workspaceUrl}/${created.data.id}`, { method: "DELETE", headers });
  assert.equal(remove.status, 204);
  assert.equal(await prisma.conversationAssignmentRule.count({ where: { id: created.data.id } }), 0);
  const preservedAssignment = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id }, select: { assigneeMembershipId: true, assignmentRuleId: true } });
  assert.equal(preservedAssignment.assigneeMembershipId, member.id);
  assert.equal(preservedAssignment.assignmentRuleId, null);
});
