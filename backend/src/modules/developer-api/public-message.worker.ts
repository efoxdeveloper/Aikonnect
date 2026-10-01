import { randomUUID } from "node:crypto";
import { logger } from "../../config/logger.js";
import { prisma } from "../../database/prisma.js";
import { releaseMessageBilling } from "../billing/billing.service.js";
import { deliverPublicMessage } from "./developer-api.service.js";

const POLL_INTERVAL_MS = 1_000;
const CLAIM_LEASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1_000, 5_000, 30_000];
const BATCH_SIZE = 25;

function failureMessage(error: unknown) {
  return error instanceof Error ? error.message : "The public message could not be sent";
}

async function claimPublicMessage() {
  const now = new Date();
  const leaseCutoff = new Date(now.getTime() - CLAIM_LEASE_MS);
  const where = {
    status: "QUEUED" as const,
    payload: { path: ["source"], equals: "public_api" },
    queueAttemptCount: { lt: MAX_ATTEMPTS },
    OR: [{ queueNextAttemptAt: null }, { queueNextAttemptAt: { lte: now } }],
    AND: [{ OR: [{ queueProcessingAt: null }, { queueProcessingAt: { lt: leaseCutoff } }] }],
  };
  const candidate = await prisma.message.findFirst({
    where,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, queueAttemptCount: true },
  });
  if (!candidate) return null;

  const queueProcessingToken = randomUUID();
  const claimed = await prisma.message.updateMany({
    where: {
      id: candidate.id,
      status: "QUEUED",
      queueAttemptCount: { lt: MAX_ATTEMPTS },
      payload: { path: ["source"], equals: "public_api" },
      OR: [{ queueNextAttemptAt: null }, { queueNextAttemptAt: { lte: now } }],
      AND: [{ OR: [{ queueProcessingAt: null }, { queueProcessingAt: { lt: leaseCutoff } }] }],
    },
    data: { queueProcessingToken, queueProcessingAt: now, queueAttemptCount: { increment: 1 } },
  });
  return claimed.count === 1 ? { id: candidate.id, queueProcessingToken, attempt: candidate.queueAttemptCount + 1 } : null;
}

async function markRetry(messageId: string, queueProcessingToken: string, attempt: number, reason: string) {
  const exhausted = attempt >= MAX_ATTEMPTS;
  const nextAttemptAt = exhausted ? null : new Date(Date.now() + (RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS.at(-1)!));
  const updated = await prisma.message.updateMany({
    where: { id: messageId, status: "QUEUED", queueProcessingToken },
    data: exhausted
      ? { status: "FAILED", failedAt: new Date(), failureReason: reason, queueProcessingToken: null, queueProcessingAt: null, queueNextAttemptAt: null }
      : { queueProcessingToken: null, queueProcessingAt: null, queueNextAttemptAt: nextAttemptAt },
  });
  if (updated.count === 1 && exhausted) {
    await releaseMessageBilling(messageId, reason).catch((releaseError) => {
      logger.error({ messageId, error: releaseError }, "Failed to release billing for an exhausted public message");
    });
  }
  return exhausted;
}

async function recoverExhaustedLeases() {
  const leaseCutoff = new Date(Date.now() - CLAIM_LEASE_MS);
  const stale = await prisma.message.findMany({
    where: {
      status: "QUEUED",
      payload: { path: ["source"], equals: "public_api" },
      queueAttemptCount: { gte: MAX_ATTEMPTS },
      queueProcessingAt: { lt: leaseCutoff },
    },
    select: { id: true, queueProcessingToken: true },
    take: BATCH_SIZE,
  });
  for (const message of stale) {
    if (!message.queueProcessingToken) continue;
    const updated = await prisma.message.updateMany({
      where: { id: message.id, status: "QUEUED", queueProcessingToken: message.queueProcessingToken },
      data: { status: "FAILED", failedAt: new Date(), failureReason: "The delivery worker stopped before completing this message", queueProcessingToken: null, queueProcessingAt: null, queueNextAttemptAt: null },
    });
    if (updated.count === 1) await releaseMessageBilling(message.id, "The delivery worker stopped before completing this message").catch(() => undefined);
  }
}

export async function processQueuedPublicMessage() {
  const claim = await claimPublicMessage();
  if (!claim) return false;
  try {
    await deliverPublicMessage(claim.id, claim.queueProcessingToken);
  } catch (error) {
    const reason = failureMessage(error);
    const exhausted = await markRetry(claim.id, claim.queueProcessingToken, claim.attempt, reason);
    logger[exhausted ? "error" : "warn"]({ messageId: claim.id, attempt: claim.attempt, exhausted, error }, "Public API message delivery failed");
  }
  return true;
}

export async function processDuePublicMessages() {
  await recoverExhaustedLeases();
  for (let index = 0; index < BATCH_SIZE; index += 1) {
    const processed = await processQueuedPublicMessage();
    if (!processed) break;
  }
}

let workerTimer: NodeJS.Timeout | undefined;
let workerRunning = false;

export function startPublicMessageWorker() {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    if (workerRunning) return;
    workerRunning = true;
    void processDuePublicMessages()
      .catch((error) => logger.error({ error }, "Public API message queue tick failed"))
      .finally(() => { workerRunning = false; });
  }, POLL_INTERVAL_MS);
  workerTimer.unref();
  void processDuePublicMessages().catch((error) => logger.error({ error }, "Public API message queue startup failed"));
}
