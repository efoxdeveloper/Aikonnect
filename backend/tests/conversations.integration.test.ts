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

test("inbox unread counts require authentication", async () => {
  const response = await fetch(baseUrl + "/workspaces/00000000-0000-0000-0000-000000000000/conversations/unread-count");
  assert.equal(response.status, 401);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, "AUTHENTICATION_REQUIRED");
});

test("forward target search requires authentication", async () => {
  const response = await fetch(baseUrl + "/workspaces/00000000-0000-0000-0000-000000000000/conversations/forward-targets?search=Inbox");
  assert.equal(response.status, 401);
});

test("inbox conversation listing requires authentication", async () => {
  const response = await fetch(`${baseUrl}/workspaces/00000000-0000-0000-0000-000000000000/conversations`);
  assert.equal(response.status, 401);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, "AUTHENTICATION_REQUIRED");
});

test("lists workspace conversations with contact context and unread filtering", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `inbox-integration-${suffix}@example.com`;
  createdEmails.push(email);
  const registration = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "IntegrationPassword123", firstName: "Inbox", lastName: "Tester", companyName: "Inbox Workspace", annualRevenue: "under-50-lakh" }),
  });
  assert.equal(registration.status, 201);
  const registrationBody = (await registration.json()) as { data: { accessToken: string; user: { id: string }; workspace: { id: string }; verificationUrl: string } };
  const token = new URL(registrationBody.data.verificationUrl).searchParams.get("token");
  assert.ok(token);
  await fetch(`${baseUrl}/auth/verify-email`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
  const authorization = { authorization: `Bearer ${registrationBody.data.accessToken}` };
  const workspaceId = registrationBody.data.workspace.id;

  const contactResponse = await fetch(`${baseUrl}/workspaces/${workspaceId}/contacts`, {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({ name: "Inbox Customer", phone: "+919876543210" }),
  });
  assert.equal(contactResponse.status, 201);
  const contact = (await contactResponse.json()) as { data: { id: string } };
  const conversationResponse = await fetch(`${baseUrl}/workspaces/${workspaceId}/contacts/${contact.data.id}/conversations`, {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({ channelKey: "whatsapp" }),
  });
  assert.equal(conversationResponse.status, 201);
  const conversation = (await conversationResponse.json()) as { data: { id: string } };
  const messageResponse = await fetch(`${baseUrl}/workspaces/${workspaceId}/contacts/${contact.data.id}/conversations/${conversation.data.id}/messages`, {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({ direction: "INCOMING", type: "TEXT", text: "Hello from WhatsApp", sentAt: "2026-08-27T06:00:00.000Z" }),
  });
  assert.equal(messageResponse.status, 201);
  const firstMessage = (await messageResponse.json()) as { data: { message: { id: string } } };
  const newerMessageResponse = await fetch(`${baseUrl}/workspaces/${workspaceId}/contacts/${contact.data.id}/conversations/${conversation.data.id}/messages`, {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({ direction: "INCOMING", type: "TEXT", text: "A newer WhatsApp message", sentAt: "2026-08-27T06:01:00.000Z" }),
  });
  assert.equal(newerMessageResponse.status, 201);

  const latestPage = await fetch(`${baseUrl}/workspaces/${workspaceId}/contacts/${contact.data.id}/conversations/${conversation.data.id}/messages?page=1&pageSize=1&latest=true`, { headers: authorization });
  assert.equal(latestPage.status, 200);
  const latestPageBody = (await latestPage.json()) as { data: { items: Array<{ text: string | null }>; pagination: { hasPrevious: boolean } } };
  assert.deepEqual(latestPageBody.data.items.map(({ text }) => text), ["A newer WhatsApp message"]);
  assert.equal(latestPageBody.data.pagination.hasPrevious, true);

  const olderPage = await fetch(`${baseUrl}/workspaces/${workspaceId}/contacts/${contact.data.id}/conversations/${conversation.data.id}/messages?page=2&pageSize=1&latest=true`, { headers: authorization });
  assert.equal(olderPage.status, 200);
  const olderPageBody = (await olderPage.json()) as { data: { items: Array<{ text: string | null }>; pagination: { hasPrevious: boolean } } };
  assert.deepEqual(olderPageBody.data.items.map(({ text }) => text), ["Hello from WhatsApp"]);
  assert.equal(olderPageBody.data.pagination.hasPrevious, false);

  const deleteMessage = await fetch(`${baseUrl}/workspaces/${workspaceId}/contacts/${contact.data.id}/conversations/${conversation.data.id}/messages/${firstMessage.data.message.id}`, { method: "DELETE", headers: authorization });
  assert.equal(deleteMessage.status, 204);
  const messageSearch = await fetch(`${baseUrl}/workspaces/${workspaceId}/contacts/${contact.data.id}/conversations/${conversation.data.id}/messages?page=1&pageSize=50&latest=true&search=newer`, { headers: authorization });
  assert.equal(messageSearch.status, 200);
  assert.deepEqual(((await messageSearch.json()) as { data: { items: Array<{ text: string | null }> } }).data.items.map(({ text }) => text), ["A newer WhatsApp message"]);

  const managerRoleResponse = await fetch(`${baseUrl}/workspaces/${workspaceId}/roles`, {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({ name: `Conversation-manager-${suffix}`, permissions: ["workspace.read", "inbox.read", "conversations.manage"] }),
  });
  assert.equal(managerRoleResponse.status, 201);
  const managerRole = (await managerRoleResponse.json()) as { data: { id: string } };

  const inboxRoleResponse = await fetch(`${baseUrl}/workspaces/${workspaceId}/roles`, {
    method: "POST",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({ name: `Inbox-only-${suffix}`, permissions: ["workspace.read", "inbox.read"] }),
  });
  assert.equal(inboxRoleResponse.status, 201);
  const inboxRole = (await inboxRoleResponse.json()) as { data: { id: string } };
  await prisma.workspaceMember.update({
    where: { workspaceId_userId: { workspaceId, userId: registrationBody.data.user.id } },
    data: { roleId: inboxRole.data.id },
  });

  const messagesForInboxRole = await fetch(`${baseUrl}/workspaces/${workspaceId}/contacts/${contact.data.id}/conversations/${conversation.data.id}/messages`, { headers: authorization });
  assert.equal(messagesForInboxRole.status, 200, "Inbox members should be able to read conversation messages");
  const messagesBody = (await messagesForInboxRole.json()) as { data: { items: Array<{ id: string; text: string | null; deletedAt: string | null }> } };
  assert.deepEqual(messagesBody.data.items.map(({ text, deletedAt }) => ({ text, deleted: Boolean(deletedAt) })), [{ text: null, deleted: true }, { text: "A newer WhatsApp message", deleted: false }]);
  const deleteForInboxRole = await fetch(`${baseUrl}/workspaces/${workspaceId}/contacts/${contact.data.id}/conversations/${conversation.data.id}/messages/${messagesBody.data.items[0].id}`, { method: "DELETE", headers: authorization });
  assert.equal(deleteForInboxRole.status, 403, "Inbox members should not be able to delete messages");
  const deleteChatForInboxRole = await fetch(`${baseUrl}/workspaces/${workspaceId}/contacts/${contact.data.id}/conversations/${conversation.data.id}`, { method: "DELETE", headers: authorization });
  assert.equal(deleteChatForInboxRole.status, 403, "Inbox members should not be able to delete chats");

  const list = await fetch(`${baseUrl}/workspaces/${workspaceId}/conversations?unreadOnly=true&search=Inbox`, { headers: authorization });
  assert.equal(list.status, 200);
  const listed = (await list.json()) as { data: { items: Array<{ id: string; unreadCount: number; contact: { name: string } }> } };
  assert.deepEqual(listed.data.items.map((item) => ({ id: item.id, unreadCount: item.unreadCount, contact: item.contact.name })), [{ id: conversation.data.id, unreadCount: 2, contact: "Inbox Customer" }]);

  const unreadCount = await fetch(baseUrl + "/workspaces/" + workspaceId + "/conversations/unread-count", { headers: authorization });
  assert.equal(unreadCount.status, 200);
  assert.deepEqual((await unreadCount.json()).data, { unreadCount: 2 });

  const forwardTargets = await fetch(`${baseUrl}/workspaces/${workspaceId}/conversations/forward-targets?page=1&pageSize=1&search=Inbox`, { headers: authorization });
  assert.equal(forwardTargets.status, 200);
  const forwardTargetsBody = (await forwardTargets.json()) as { data: { items: Array<{ id: string; contact: { name: string } }>; pagination: { pageSize: number; total: number } } };
  assert.deepEqual(forwardTargetsBody.data.items.map((item) => ({ id: item.id, name: item.contact.name })), [{ id: conversation.data.id, name: "Inbox Customer" }]);
  assert.equal(forwardTargetsBody.data.pagination.pageSize, 1);
  assert.equal(forwardTargetsBody.data.pagination.total, 1);

  const markRead = await fetch(`${baseUrl}/workspaces/${workspaceId}/contacts/${contact.data.id}/conversations/${conversation.data.id}/read`, { method: "POST", headers: authorization });
  assert.equal(markRead.status, 200);
  const readMessage = await prisma.message.findFirstOrThrow({ where: { workspaceId, conversationId: conversation.data.id, direction: "INCOMING" } });
  assert.equal(readMessage.status, "READ");
  assert.ok(readMessage.readAt);
  const afterRead = await fetch(`${baseUrl}/workspaces/${workspaceId}/conversations?unreadOnly=true`, { headers: authorization });
  assert.equal(afterRead.status, 200);
  assert.deepEqual(((await afterRead.json()) as { data: { items: unknown[] } }).data.items, []);
  const afterReadCount = await fetch(baseUrl + "/workspaces/" + workspaceId + "/conversations/unread-count", { headers: authorization });
  assert.deepEqual((await afterReadCount.json()).data, { unreadCount: 0 });

  await prisma.workspaceMember.update({
    where: { workspaceId_userId: { workspaceId, userId: registrationBody.data.user.id } },
    data: { roleId: managerRole.data.id },
  });
  const pinChat = await fetch(`${baseUrl}/workspaces/${workspaceId}/contacts/${contact.data.id}/conversations/${conversation.data.id}/pin`, {
    method: "PATCH",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({ pinned: true }),
  });
  assert.equal(pinChat.status, 200);
  assert.deepEqual((await pinChat.json()).data, { isPinned: true });
  const clearChat = await fetch(`${baseUrl}/workspaces/${workspaceId}/contacts/${contact.data.id}/conversations/${conversation.data.id}/clear`, { method: "POST", headers: authorization });
  assert.equal(clearChat.status, 200);
  const messagesAfterClear = await fetch(`${baseUrl}/workspaces/${workspaceId}/contacts/${contact.data.id}/conversations/${conversation.data.id}/messages`, { headers: authorization });
  assert.equal(messagesAfterClear.status, 200);
  assert.deepEqual(((await messagesAfterClear.json()) as { data: { items: unknown[] } }).data.items, []);
  const deleteChat = await fetch(`${baseUrl}/workspaces/${workspaceId}/contacts/${contact.data.id}/conversations/${conversation.data.id}`, { method: "DELETE", headers: authorization });
  assert.equal(deleteChat.status, 204);
  const conversationsAfterDelete = await fetch(`${baseUrl}/workspaces/${workspaceId}/conversations`, { headers: authorization });
  assert.equal(conversationsAfterDelete.status, 200);
  assert.deepEqual(((await conversationsAfterDelete.json()) as { data: { items: unknown[] } }).data.items, []);

  const crossWorkspace = await fetch(`${baseUrl}/workspaces/00000000-0000-0000-0000-000000000000/conversations`, { headers: authorization });
  assert.equal(crossWorkspace.status, 403);
});
