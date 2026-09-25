import type { Prisma } from "../../generated/prisma/client.js";
import { TemplateStatus } from "../../generated/prisma/enums.js";
import { logger } from "../../config/logger.js";
import { prisma } from "../../database/prisma.js";
import { deleteWhatsAppTemplate } from "../whatsapp/whatsapp.service.js";
import { metaTemplateName } from "./meta-template-payload.js";

const POLL_INTERVAL_MS = 10_000;
const CLAIM_LEASE_MS = 2 * 60_000;
const MAX_ATTEMPTS = 6;
const META_TEMPLATE_DELETE_TIMEOUT_MS = 2 * 60_000;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000];
const BATCH_SIZE = 10;

const templateDeletionWhere: Prisma.TemplateWhereInput = {
  status: TemplateStatus.DELETING,
};

function failureMessage(error: unknown) {
  return error instanceof Error ? error.message : "Meta template deletion failed.";
}

async function claimTemplateDeletion(templateId?: string) {
  const now = new Date();
  const leaseCutoff = new Date(now.getTime() - CLAIM_LEASE_MS);
  const where: Prisma.TemplateWhereInput = {
    ...templateDeletionWhere,
    ...(templateId ? { id: templateId } : {}),
    deletionNextAttemptAt: { lte: now },
    OR: [{ deletionProcessingAt: null }, { deletionProcessingAt: { lt: leaseCutoff } }],
  };
  const candidate = await prisma.template.findFirst({
    where,
    orderBy: [{ deletionNextAttemptAt: "asc" }, { updatedAt: "asc" }, { id: "asc" }],
    select: { id: true, workspaceId: true, metaTemplateId: true, metaTemplateName: true, name: true, deletionAttemptCount: true },
  });
  if (!candidate) return null;

  const claimed = await prisma.template.updateMany({
    where: { ...where, id: candidate.id },
    data: { deletionProcessingAt: now, deletionAttemptCount: { increment: 1 } },
  });
  if (claimed.count !== 1) return null;

  return { candidate, attempt: candidate.deletionAttemptCount + 1, processingAt: now };
}

export async function processTemplateDeletion(templateId?: string): Promise<boolean> {
  const claim = await claimTemplateDeletion(templateId);
  if (!claim) return false;

  const { candidate, attempt, processingAt } = claim;
  try {
    if (candidate.metaTemplateId) {
      await deleteWhatsAppTemplate(
        candidate.workspaceId,
        candidate.metaTemplateId,
        candidate.metaTemplateName ?? metaTemplateName(candidate.name),
        META_TEMPLATE_DELETE_TIMEOUT_MS,
      );
    }
    await prisma.template.updateMany({
      where: { id: candidate.id, status: TemplateStatus.DELETING, deletionProcessingAt: processingAt },
      data: {
        status: TemplateStatus.DELETED,
        deletionProcessingAt: null,
        deletionNextAttemptAt: null,
        deletionError: null,
      },
    });
    logger.info({ templateId: candidate.id, attempt }, "WhatsApp template deletion completed");
    return true;
  } catch (error) {
    const message = failureMessage(error).slice(0, 10_000);
    const exhausted = attempt >= MAX_ATTEMPTS;
    const retryDelay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)] ?? 60 * 60_000;
    const nextAttemptAt = exhausted ? null : new Date(Date.now() + retryDelay);
    await prisma.template.updateMany({
      where: { id: candidate.id, status: TemplateStatus.DELETING, deletionProcessingAt: processingAt },
      data: {
        status: exhausted ? TemplateStatus.DELETE_FAILED : TemplateStatus.DELETING,
        deletionProcessingAt: null,
        deletionNextAttemptAt: nextAttemptAt,
        deletionError: message,
      },
    });
    logger.error({ templateId: candidate.id, attempt, exhausted, error }, "WhatsApp template deletion failed");
    return true;
  }
}

export async function processDueTemplateDeletions() {
  for (let index = 0; index < BATCH_SIZE; index += 1) {
    const processed = await processTemplateDeletion();
    if (!processed) break;
  }
}

export function dispatchTemplateDeletion(templateId: string) {
  void processTemplateDeletion(templateId).catch((error) => {
    logger.error({ templateId, error }, "Template deletion dispatch failed");
  });
}

let workerTimer: NodeJS.Timeout | undefined;
let workerRunning = false;

export function startTemplateDeletionWorker() {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    if (workerRunning) return;
    workerRunning = true;
    void processDueTemplateDeletions()
      .catch((error) => logger.error({ error }, "Template deletion scheduler tick failed"))
      .finally(() => { workerRunning = false; });
  }, POLL_INTERVAL_MS);
  workerTimer.unref();
  void processDueTemplateDeletions().catch((error) => logger.error({ error }, "Template deletion scheduler startup failed"));
}
