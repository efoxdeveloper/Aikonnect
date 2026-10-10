import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { publishCampaignUpdated } from "../../realtime/campaign.js";

export async function refreshCampaignCost(workspaceId: string, campaignId: string) {
  const recipients = await prisma.campaignRecipient.findMany({
    where: { workspaceId, campaignId, metaMessageId: { not: null } },
    select: { metaMessageId: true },
  });
  const messageIds = recipients.map((recipient) => recipient.metaMessageId).filter((id): id is string => Boolean(id));
  let totalCost = new Prisma.Decimal(0);
  if (messageIds.length) {
    const messages = await prisma.message.findMany({
      where: { workspaceId, metaMessageId: { in: messageIds } },
      select: { id: true },
    });
    if (messages.length) {
      const entries = await prisma.walletLedgerEntry.findMany({
        where: { workspaceId, messageId: { in: messages.map((message) => message.id) }, transactionType: { in: ["CHARGE", "REFUND"] } },
        select: { amount: true, direction: true },
      });
      totalCost = entries.reduce((sum, entry) => {
        if (entry.amount === null) return sum;
        return entry.direction === "CREDIT" ? sum.sub(entry.amount) : sum.add(entry.amount);
      }, totalCost);
    }
  }
  totalCost = totalCost.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  await prisma.campaign.updateMany({ where: { id: campaignId, workspaceId }, data: { totalCost } });
  return totalCost;
}

export async function refreshCampaignMetrics(workspaceId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId }, select: { status: true, retryFailed: true } });
  if (!campaign) return;
  const grouped = await prisma.campaignRecipient.groupBy({ by: ["status"], where: { workspaceId, campaignId }, _count: { _all: true } });
  const counts = new Map(grouped.map((item) => [item.status, item._count._all]));
  const pending = counts.get("PENDING") ?? 0;
  const attempted = counts.get("ATTEMPTED") ?? 0;
  const failedRetryable = campaign.retryFailed ? await prisma.campaignRecipient.count({ where: { workspaceId, campaignId, status: "FAILED", attemptCount: { lt: 3 } } }) : 0;
  const totalCost = await refreshCampaignCost(workspaceId, campaignId);
  const nextStatus = campaign.status === "RUNNING" && pending === 0 && attempted === 0 && failedRetryable === 0 ? "COMPLETED" : undefined;
  await prisma.campaign.updateMany({
    where: { id: campaignId, workspaceId, ...(nextStatus ? { status: "RUNNING" } : {}) },
    data: {
      attempted: attempted + (counts.get("SENT") ?? 0) + (counts.get("DELIVERED") ?? 0) + (counts.get("READ") ?? 0) + (counts.get("REPLIED") ?? 0) + (counts.get("FAILED") ?? 0),
      sent: (counts.get("SENT") ?? 0) + (counts.get("DELIVERED") ?? 0) + (counts.get("READ") ?? 0) + (counts.get("REPLIED") ?? 0),
      delivered: (counts.get("DELIVERED") ?? 0) + (counts.get("READ") ?? 0) + (counts.get("REPLIED") ?? 0),
      read: (counts.get("READ") ?? 0) + (counts.get("REPLIED") ?? 0),
      replied: counts.get("REPLIED") ?? 0,
      failed: counts.get("FAILED") ?? 0,
      totalCost,
      ...(nextStatus ? { status: nextStatus, completedAt: new Date() } : {}),
    },
  });
  publishCampaignUpdated(workspaceId, campaignId);
}

export async function markCampaignReply(workspaceId: string, phoneE164: string, occurredAt: Date) {
  const recipient = await prisma.campaignRecipient.findFirst({
    where: {
      workspaceId,
      phoneE164,
      status: { in: ["SENT", "DELIVERED", "READ"] },
      sentAt: { lte: occurredAt },
      campaign: { status: { in: ["RUNNING", "COMPLETED"] } },
    },
    orderBy: [{ sentAt: "desc" }, { id: "desc" }],
    select: { id: true, campaignId: true, status: true },
  });
  if (!recipient) return;
  const updated = await prisma.campaignRecipient.updateMany({
    where: { id: recipient.id, status: recipient.status },
    data: { status: "REPLIED", repliedAt: occurredAt },
  });
  if (updated.count) await refreshCampaignMetrics(workspaceId, recipient.campaignId);
}
