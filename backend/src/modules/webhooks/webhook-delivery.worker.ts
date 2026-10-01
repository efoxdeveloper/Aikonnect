import { createHmac, randomUUID } from "node:crypto";
import { logger } from "../../config/logger.js";
import { env } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";
import { decryptSecret } from "../../utils/crypto.js";

const POLL_INTERVAL_MS = 1_000;
const CLAIM_LEASE_MS = 2 * 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 6;
const RETRY_DELAYS_MS = [5_000, 30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000];
const BATCH_SIZE = 25;
const NEVER_RETRY_AT = new Date("9999-12-31T23:59:59.999Z");

function jsonBody(payload: unknown) {
  return JSON.stringify(payload);
}

function signature(secret: string, timestamp: string, body: string) {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Webhook delivery failed";
}

async function claimDelivery() {
  const now = new Date();
  const leaseCutoff = new Date(now.getTime() - CLAIM_LEASE_MS);
  const candidate = await prisma.webhookDelivery.findFirst({
    where: {
      status: { in: ["PENDING", "FAILED", "PROCESSING"] },
      nextAttemptAt: { lte: now },
      attemptCount: { lt: MAX_ATTEMPTS },
      OR: [{ processingAt: null }, { processingAt: { lt: leaseCutoff } }],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, attemptCount: true },
  });
  if (!candidate) return null;

  const processingToken = randomUUID();
  const claimed = await prisma.webhookDelivery.updateMany({
    where: {
      id: candidate.id,
      status: { in: ["PENDING", "FAILED", "PROCESSING"] },
      nextAttemptAt: { lte: now },
      attemptCount: { lt: MAX_ATTEMPTS },
      OR: [{ processingAt: null }, { processingAt: { lt: leaseCutoff } }],
    },
    data: { status: "PROCESSING", processingToken, processingAt: now, attemptCount: { increment: 1 } },
  });
  return claimed.count === 1 ? { id: candidate.id, processingToken, attempt: candidate.attemptCount + 1 } : null;
}

async function deliver(claim: { id: string; processingToken: string; attempt: number }) {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: claim.id },
    select: { id: true, endpointId: true, eventType: true, payload: true, processingToken: true, endpoint: { select: { url: true, secretEncrypted: true, active: true } } },
  });
  if (!delivery || delivery.processingToken !== claim.processingToken) return;
  if (!delivery.endpoint.active) {
    await prisma.webhookDelivery.updateMany({ where: { id: delivery.id, processingToken: claim.processingToken }, data: { status: "FAILED", processingToken: null, processingAt: null, nextAttemptAt: NEVER_RETRY_AT, lastError: "The webhook endpoint is inactive" } });
    return;
  }

  const body = jsonBody(delivery.payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const secret = decryptSecret(delivery.endpoint.secretEncrypted, env.ACCESS_TOKEN_SECRET);
  const response = await fetch(delivery.endpoint.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Marento-Webhooks/1.0",
      "x-marento-event": delivery.eventType,
      "x-marento-delivery-id": delivery.id,
      "x-marento-timestamp": timestamp,
      "x-marento-signature": signature(secret, timestamp, body),
    },
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const responseBody = (await response.text()).slice(0, 2_000);
    throw new Error(`Webhook endpoint returned HTTP ${response.status}${responseBody ? `: ${responseBody}` : ""}`);
  }

  const updated = await prisma.webhookDelivery.updateMany({
    where: { id: delivery.id, status: "PROCESSING", processingToken: claim.processingToken },
    data: { status: "DELIVERED", deliveredAt: new Date(), processingToken: null, processingAt: null, nextAttemptAt: NEVER_RETRY_AT, lastError: null },
  });
  if (updated.count) {
    await prisma.webhookEndpoint.update({ where: { id: delivery.endpointId }, data: { lastDeliveredAt: new Date() } }).catch((error) => {
      logger.warn({ deliveryId: delivery.id, error }, "Webhook delivered but endpoint timestamp could not be updated");
    });
  }
}

async function markFailed(claim: { id: string; processingToken: string; attempt: number }, reason: string) {
  const exhausted = claim.attempt >= MAX_ATTEMPTS;
  const nextAttemptAt = exhausted ? NEVER_RETRY_AT : new Date(Date.now() + (RETRY_DELAYS_MS[claim.attempt - 1] ?? RETRY_DELAYS_MS.at(-1)!));
  await prisma.webhookDelivery.updateMany({
    where: { id: claim.id, status: "PROCESSING", processingToken: claim.processingToken },
    data: { status: "FAILED", processingToken: null, processingAt: null, nextAttemptAt, lastError: reason },
  });
  return exhausted;
}

async function recoverExhaustedDeliveries() {
  const leaseCutoff = new Date(Date.now() - CLAIM_LEASE_MS);
  const stale = await prisma.webhookDelivery.findMany({
    where: { status: "PROCESSING", attemptCount: { gte: MAX_ATTEMPTS }, processingAt: { lt: leaseCutoff } },
    select: { id: true, processingToken: true },
    take: BATCH_SIZE,
  });
  for (const delivery of stale) {
    if (!delivery.processingToken) continue;
    await prisma.webhookDelivery.updateMany({
      where: { id: delivery.id, status: "PROCESSING", processingToken: delivery.processingToken },
      data: { status: "FAILED", processingToken: null, processingAt: null, nextAttemptAt: NEVER_RETRY_AT, lastError: "The webhook worker stopped before completing delivery" },
    });
  }
}

export async function processWebhookDelivery() {
  const claim = await claimDelivery();
  if (!claim) return false;
  try {
    await deliver(claim);
  } catch (error) {
    const reason = errorMessage(error);
    const exhausted = await markFailed(claim, reason);
    logger[exhausted ? "error" : "warn"]({ deliveryId: claim.id, attempt: claim.attempt, exhausted, error }, "Webhook delivery failed");
  }
  return true;
}

export async function processDueWebhookDeliveries() {
  await recoverExhaustedDeliveries();
  for (let index = 0; index < BATCH_SIZE; index += 1) {
    const processed = await processWebhookDelivery();
    if (!processed) break;
  }
}

let workerTimer: NodeJS.Timeout | undefined;
let workerRunning = false;

export function startWebhookDeliveryWorker() {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    if (workerRunning) return;
    workerRunning = true;
    void processDueWebhookDeliveries()
      .catch((error) => logger.error({ error }, "Webhook delivery queue tick failed"))
      .finally(() => { workerRunning = false; });
  }, POLL_INTERVAL_MS);
  workerTimer.unref();
  void processDueWebhookDeliveries().catch((error) => logger.error({ error }, "Webhook delivery queue startup failed"));
}

export { signature as webhookSignature };
