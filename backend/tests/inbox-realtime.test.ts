import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test, type TestContext } from "node:test";
import { WebSocket } from "ws";

Object.assign(process.env, {
  NODE_ENV: "test",
  APP_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  ACCESS_TOKEN_SECRET: "unit-test-only-access-token-secret-000000",
  META_APP_SECRET: "test-app-secret",
  META_TOKEN_ENCRYPTION_KEY: "test-token-encryption-key-for-tests-32chars",
  LOG_LEVEL: "silent",
});

const { prisma } = await import("../src/database/prisma.js");
const { signAccessToken } = await import("../src/utils/tokens.js");
const { attachInboxRealtime, publishInboxRefresh } = await import("../src/realtime/inbox.js");

function stubDelegate(t: TestContext, target: any, method: string, implementation: (...args: any[]) => any) {
  const original = target[method];
  target[method] = implementation;
  t.after(() => { target[method] = original; });
}

function listen(server: ReturnType<typeof createServer>) {
  return new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Realtime test server did not bind");
    resolve(address.port);
  }));
}

function close(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function receive(socket: WebSocket) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    socket.once("message", (data) => resolve(JSON.parse(data.toString()) as Record<string, unknown>));
    socket.once("error", reject);
  });
}

test("workspace-authorized Inbox clients receive refresh events", async (t) => {
  stubDelegate(t, prisma.session, "findFirst", async () => ({ id: "session-1" }));
  stubDelegate(t, prisma.workspaceMember, "findUnique", async () => ({
    status: "ACTIVE",
    role: { permissions: [{ permission: { key: "inbox.read" } }] },
  }));
  const token = await signAccessToken({ userId: "user-1", sessionId: "session-1" });
  const server = createServer();
  const realtime = attachInboxRealtime(server);
  const port = await listen(server);
  t.after(() => { realtime.close(); return close(server); });

  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/v1/ws/inbox?workspaceId=workspace-1&token=${encodeURIComponent(token)}`);
  t.after(() => socket.close());
  const ready = receive(socket);
  await new Promise<void>((resolve, reject) => { socket.once("open", () => resolve()); socket.once("error", reject); });
  assert.deepEqual(await ready, { type: "ready", workspaceId: "workspace-1" });
  publishInboxRefresh("workspace-1", "conversation-1");
  assert.deepEqual(await receive(socket), { type: "inbox.refresh", workspaceId: "workspace-1", conversationId: "conversation-1" });
});

test("Inbox socket rejects a workspace member without inbox permission", async (t) => {
  stubDelegate(t, prisma.session, "findFirst", async () => ({ id: "session-1" }));
  stubDelegate(t, prisma.workspaceMember, "findUnique", async () => ({ status: "ACTIVE", role: { permissions: [] } }));
  const token = await signAccessToken({ userId: "user-1", sessionId: "session-1" });
  const server = createServer();
  const realtime = attachInboxRealtime(server);
  const port = await listen(server);
  t.after(() => { realtime.close(); return close(server); });

  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/v1/ws/inbox?workspaceId=workspace-1&token=${encodeURIComponent(token)}`);
    socket.once("unexpected-response", (_request, response) => { assert.equal(response.statusCode, 401); resolve(); });
    socket.once("error", () => undefined);
  });
});
