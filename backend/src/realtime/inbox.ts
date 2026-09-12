import type { Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { corsOrigins, env } from "../config/env.js";
import { prisma } from "../database/prisma.js";
import { verifyAccessToken } from "../utils/tokens.js";

const websocketPath = `${env.API_PREFIX}/ws/inbox`;

type InboxClient = {
  socket: WebSocket;
  workspaceId: string;
};

type InboxEvent = {
  type: "inbox.refresh" | "inbox.message_status";
  workspaceId: string;
  conversationId?: string;
  messageId?: string;
  status?: "SENT" | "DELIVERED" | "READ" | "FAILED";
};

const clients = new Set<InboxClient>();

function rejectUpgrade(socket: Duplex, status: number, message: string) {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

function allowedOrigin(origin: string | undefined) {
  return !origin || corsOrigins.includes("*") || corsOrigins.includes(origin) || origin === new URL(env.APP_URL).origin;
}

async function authorize(workspaceId: string, token: string) {
  const payload = await verifyAccessToken(token);
  const session = await prisma.session.findFirst({
    where: {
      id: payload.sessionId,
      userId: payload.userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      user: { status: "ACTIVE", emailVerifiedAt: { not: null } },
    },
    select: { id: true },
  });
  if (!session) throw new Error("SESSION_INVALID");

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: payload.userId } },
    include: { role: { include: { permissions: { include: { permission: { select: { key: true } } } } } } },
  });
  if (!membership || membership.status !== "ACTIVE") throw new Error("WORKSPACE_ACCESS_DENIED");
  const permissions = membership.role.permissions.map(({ permission }) => permission.key);
  if (!permissions.includes("inbox.read")) throw new Error("PERMISSION_DENIED");

  return { userId: payload.userId };
}

export function attachInboxRealtime(server: Server) {
  const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  server.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (requestUrl.pathname !== websocketPath) {
      socket.destroy();
      return;
    }
    if (!allowedOrigin(request.headers.origin)) {
      rejectUpgrade(socket, 403, "Forbidden");
      return;
    }

    const workspaceId = requestUrl.searchParams.get("workspaceId");
    const token = requestUrl.searchParams.get("token");
    if (!workspaceId || !token) {
      rejectUpgrade(socket, 401, "Unauthorized");
      return;
    }

    void authorize(workspaceId, token)
      .then(() => {
        websocketServer.handleUpgrade(request, socket, head, (client) => {
          const inboxClient = { socket: client, workspaceId };
          clients.add(inboxClient);
          client.send(JSON.stringify({ type: "ready", workspaceId }));
          client.on("close", () => clients.delete(inboxClient));
          client.on("error", () => clients.delete(inboxClient));
        });
      })
      .catch(() => rejectUpgrade(socket, 401, "Unauthorized"));
  });

  return {
    close() {
      for (const client of clients) client.socket.terminate();
      clients.clear();
      websocketServer.close();
    },
  };
}

export function publishInboxRefresh(workspaceId: string, conversationId?: string) {
  const event: InboxEvent = { type: "inbox.refresh", workspaceId, ...(conversationId ? { conversationId } : {}) };
  publish(event);
}

export function publishInboxMessageStatus(workspaceId: string, conversationId: string, messageId: string, status: InboxEvent["status"]) {
  publish({ type: "inbox.message_status", workspaceId, conversationId, messageId, status });
}

function publish(event: InboxEvent) {
  const payload = JSON.stringify(event);
  for (const client of clients) {
    if (client.workspaceId !== event.workspaceId || client.socket.readyState !== WebSocket.OPEN) continue;
    client.socket.send(payload);
  }
}
