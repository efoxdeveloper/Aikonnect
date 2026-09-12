import { prisma } from "../../database/prisma.js";

export async function refreshCampaignMetrics(workspaceId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId }, select: { status: true, retryFailed: true } });
  if (!campaign) return;
  const grouped = await prisma.campaignRecipient.groupBy({ by: ["status"], where: { workspaceId, campaignId }, _count: { _all: true } });
  const counts = new Map(grouped.map((item) => [item.status, item._count._all]));
  const pending = counts.get("PENDING") ?? 0;
  const attempted = counts.get("ATTEMPTED") ?? 0;
  const failedRetryable = campaign.retryFailed ? await prisma.campaignRecipient.count({ where: { workspaceId, campaignId, status: "FAILED", attemptCount: { lt: 3 } } }) : 0;
  const nextStatus = campaign.status === "RUNNING" && pending === 0 && attempted === 0 && failedRetryable === 0 ? "COMPLETED" : undefined;
  await prisma.campaign.updateMany({
    where: { id: campaignId, workspaceId },
    data: {
      attempted: attempted + (counts.get("SENT") ?? 0) + (counts.get("DELIVERED") ?? 0) + (counts.get("READ") ?? 0) + (counts.get("REPLIED") ?? 0) + (counts.get("FAILED") ?? 0),
      sent: (counts.get("SENT") ?? 0) + (counts.get("DELIVERED") ?? 0) + (counts.get("READ") ?? 0) + (counts.get("REPLIED") ?? 0),
      delivered: (counts.get("DELIVERED") ?? 0) + (counts.get("READ") ?? 0) + (counts.get("REPLIED") ?? 0),
      read: (counts.get("READ") ?? 0) + (counts.get("REPLIED") ?? 0),
      replied: counts.get("REPLIED") ?? 0,
      failed: counts.get("FAILED") ?? 0,
      ...(nextStatus ? { status: nextStatus, completedAt: new Date() } : {}),
    },
  });
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
