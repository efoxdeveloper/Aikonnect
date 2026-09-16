import { env } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";
import type { UsageQuery } from "./usage.schemas.js";

type UsageSource = "incoming" | "inbox" | "campaign" | "automation";

function dateRange(query: UsageQuery) {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

function day(value: Date) {
  return value.toISOString().slice(0, 10);
}

function sourceOf(message: { direction: string; payload: unknown }): UsageSource {
  if (message.direction === "INCOMING") return "incoming";
  if (message.payload && typeof message.payload === "object" && !Array.isArray(message.payload)) {
    const source = (message.payload as Record<string, unknown>).source;
    if (source === "campaign") return "campaign";
    if (source === "automation") return "automation";
  }
  return "inbox";
}

export async function getUsage(workspaceId: string, query: UsageQuery) {
  const dates = dateRange(query);
  const messages = await prisma.message.findMany({
    where: { workspaceId, sentAt: { gte: dates.from, lte: dates.to } },
    select: { direction: true, status: true, type: true, sentAt: true, contactId: true, conversationId: true, payload: true },
    orderBy: [{ sentAt: "asc" }, { id: "asc" }],
  });
  const outgoing = messages.filter((message) => message.direction === "OUTGOING");
  const sourceCounts = new Map<UsageSource, number>([["incoming", 0], ["inbox", 0], ["campaign", 0], ["automation", 0]]);
  const daily = new Map<string, { total: number; incoming: number; outgoing: number; delivered: number }>();
  for (const message of messages) {
    const source = sourceOf(message);
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
    const item = daily.get(day(message.sentAt)) ?? { total: 0, incoming: 0, outgoing: 0, delivered: 0 };
    item.total += 1;
    if (message.direction === "INCOMING") item.incoming += 1;
    else {
      item.outgoing += 1;
      if (["DELIVERED", "READ"].includes(message.status)) item.delivered += 1;
    }
    daily.set(day(message.sentAt), item);
  }
  const breakdown = [
    { key: "incoming", label: "Incoming messages", messages: sourceCounts.get("incoming") ?? 0 },
    { key: "inbox", label: "Inbox replies", messages: sourceCounts.get("inbox") ?? 0 },
    { key: "campaign", label: "Campaign messages", messages: sourceCounts.get("campaign") ?? 0 },
    { key: "automation", label: "Automation messages", messages: sourceCounts.get("automation") ?? 0 },
  ].map((item) => ({ ...item, percentage: messages.length ? Math.round((item.messages / messages.length) * 100) : 0 }));
  return {
    wallet: {
      currency: env.WALLET_CURRENCY,
      balancePaise: env.WALLET_BALANCE_PAISE,
      balance: env.WALLET_BALANCE_PAISE / 100,
      configuredFromBackend: true,
    },
    filters: { from: dates.from.toISOString(), to: dates.to.toISOString() },
    summary: {
      totalMessages: messages.length,
      incomingMessages: messages.filter((message) => message.direction === "INCOMING").length,
      outgoingMessages: outgoing.length,
      deliveredMessages: outgoing.filter((message) => ["DELIVERED", "READ"].includes(message.status)).length,
      readMessages: outgoing.filter((message) => message.status === "READ").length,
      failedMessages: outgoing.filter((message) => message.status === "FAILED").length,
      engagedContacts: new Set(messages.map((message) => message.contactId)).size,
      activeConversations: new Set(messages.map((message) => message.conversationId)).size,
      mediaMessages: outgoing.filter((message) => message.type !== "TEXT").length,
    },
    breakdown,
    daily: [...daily.entries()].map(([date, values]) => ({ date, ...values })),
  };
}
