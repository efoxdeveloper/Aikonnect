import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { createCampaign, templateVariableCount } from "../campaigns/campaign.service.js";
import { campaignStepTime } from "./sequence-scheduler.js";
import type { CreateSequenceInput, SequenceStepInput } from "./sequence.schemas.js";

const sequenceSelect = { id: true, workspaceId: true, name: true, description: true, status: true, steps: true, enrolledCount: true, completedCount: true, failedCount: true, createdById: true, createdAt: true, updatedAt: true } satisfies Prisma.SequenceSelect;
type SequenceRecord = Prisma.SequenceGetPayload<{ select: typeof sequenceSelect }>;
function stepArray(value: Prisma.JsonValue): SequenceStepInput[] { return Array.isArray(value) ? value as unknown as SequenceStepInput[] : []; }
function serialize(sequence: SequenceRecord) { return { ...sequence, steps: stepArray(sequence.steps) }; }

async function validateSteps(workspaceId: string, steps: SequenceStepInput[], requireApproved: boolean) {
  for (const step of steps) {
    const template = await prisma.template.findFirst({ where: { workspaceId, templateKey: step.templateKey, deletedAt: null }, select: { status: true, body: true, headerType: true, templateType: true } });
    if (!template) throw new AppError(404, "A selected WhatsApp template was not found", "SEQUENCE_TEMPLATE_NOT_FOUND");
    if (requireApproved && template.status !== "APPROVED") throw new AppError(422, "Every sequence step needs an approved WhatsApp template", "SEQUENCE_TEMPLATE_NOT_APPROVED");
    if ((template.headerType && !["none", "text"].includes(template.headerType.toLowerCase())) || template.templateType.toLowerCase() === "carousel") throw new AppError(422, "Sequence steps currently support text and text-header templates", "SEQUENCE_TEMPLATE_UNSUPPORTED");
    const variableCount = templateVariableCount(template.body);
    if (step.templateVariables.length !== variableCount) throw new AppError(422, `Map all ${variableCount} template variable${variableCount === 1 ? "" : "s"} for each sequence step`, "SEQUENCE_TEMPLATE_VARIABLES_REQUIRED");
    for (const variable of step.templateVariables) {
      if ((variable.source === "contact" || variable.source === "custom") && !variable.field) throw new AppError(422, "Choose a contact field for each sequence template variable", "SEQUENCE_TEMPLATE_VARIABLE_INVALID");
      if (variable.source === "constant" && !variable.field && !variable.fallback) throw new AppError(422, "Enter a value for every constant template variable", "SEQUENCE_TEMPLATE_VARIABLE_INVALID");
    }
  }
}

export async function listSequences(workspaceId: string, query: { search: string; status?: "DRAFT" | "ACTIVE" | "PAUSED"; page: number; pageSize: number }) {
  const where: Prisma.SequenceWhereInput = { workspaceId, ...(query.status ? { status: query.status } : {}), ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}) };
  const [total, items] = await Promise.all([prisma.sequence.count({ where }), prisma.sequence.findMany({ where, select: sequenceSelect, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize })]);
  return { items: items.map(serialize), pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)), hasNext: query.page * query.pageSize < total, hasPrevious: query.page > 1 } };
}

export async function listEligibleContacts(workspaceId: string, search: string) {
  const items = await prisma.contact.findMany({ where: { workspaceId, deletedAt: null, whatsappOpted: true, marketingBlocked: false, ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { profileName: { contains: search, mode: "insensitive" } }, { phoneE164: { contains: search } }] } : {}) }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 100, select: { id: true, name: true } });
  return { items };
}

async function requireSequence(workspaceId: string, sequenceId: string) {
  const sequence = await prisma.sequence.findFirst({ where: { id: sequenceId, workspaceId }, select: sequenceSelect });
  if (!sequence) throw new AppError(404, "Sequence was not found", "SEQUENCE_NOT_FOUND");
  return sequence;
}

export async function getSequence(workspaceId: string, sequenceId: string) {
  const sequence = await requireSequence(workspaceId, sequenceId);
  const [enrollments, templates] = await Promise.all([
    prisma.sequenceEnrollment.findMany({ where: { workspaceId, sequenceId }, orderBy: [{ startedAt: "desc" }, { id: "desc" }], take: 50, select: { id: true, status: true, currentStep: true, nextRunAt: true, attemptCount: true, lastError: true, startedAt: true, completedAt: true, contact: { select: { id: true, name: true } } } }),
    prisma.template.findMany({ where: { workspaceId, templateKey: { in: stepArray(sequence.steps).map(({ templateKey }) => templateKey) } }, select: { templateKey: true, name: true } }),
  ]);
  const templateNames = new Map(templates.map((template) => [template.templateKey, template.name]));
  return { ...serialize(sequence), steps: stepArray(sequence.steps).map((step) => ({ ...step, templateName: templateNames.get(step.templateKey) ?? step.templateKey })), enrollments };
}

export async function createSequence(workspaceId: string, actorUserId: string, input: CreateSequenceInput) {
  await validateSteps(workspaceId, input.steps, false);
  const sequence = await prisma.sequence.create({ data: { workspaceId, createdById: actorUserId, name: input.name, description: input.description ?? null, steps: input.steps as unknown as Prisma.InputJsonValue }, select: sequenceSelect });
  return serialize(sequence);
}

export async function updateSequence(workspaceId: string, sequenceId: string, input: CreateSequenceInput) {
  const current = await requireSequence(workspaceId, sequenceId);
  if (current.status === "ACTIVE") throw new AppError(409, "Pause a sequence before editing it", "SEQUENCE_ACTIVE");
  await validateSteps(workspaceId, input.steps, false);
  const updated = await prisma.sequence.update({ where: { id: sequenceId }, data: { name: input.name, description: input.description ?? null, steps: input.steps as unknown as Prisma.InputJsonValue }, select: sequenceSelect });
  return serialize(updated);
}

export async function setSequenceStatus(workspaceId: string, sequenceId: string, status: "ACTIVE" | "PAUSED") {
  const sequence = await requireSequence(workspaceId, sequenceId);
  if (status === "ACTIVE") {
    const steps = stepArray(sequence.steps);
    if (!steps.length) throw new AppError(422, "Add at least one message step before activating this sequence", "SEQUENCE_INCOMPLETE");
    await validateSteps(workspaceId, steps, true);
  }
  const updated = await prisma.sequence.update({ where: { id: sequenceId }, data: { status }, select: sequenceSelect });
  const running = await prisma.sequenceEnrollment.findMany({ where: { workspaceId, sequenceId, status: { in: ["WAITING", "ACTIVE"] }, currentCampaignId: { not: null } }, select: { currentCampaignId: true } });
  const campaignIds = running.flatMap(({ currentCampaignId }) => currentCampaignId ? [currentCampaignId] : []);
  if (campaignIds.length) await prisma.campaign.updateMany({ where: { id: { in: campaignIds }, workspaceId, status: status === "PAUSED" ? { in: ["RUNNING", "SCHEDULED"] } : "PAUSED" }, data: { status: status === "PAUSED" ? "PAUSED" : "SCHEDULED" } });
  return serialize(updated);
}

export async function deleteSequence(workspaceId: string, sequenceId: string) {
  const sequence = await requireSequence(workspaceId, sequenceId);
  if (sequence.status === "ACTIVE") throw new AppError(409, "Pause a sequence before deleting it", "SEQUENCE_ACTIVE");
  await prisma.sequence.delete({ where: { id: sequenceId } });
}

export async function enrollContacts(workspaceId: string, sequenceId: string, contactIds: string[]) {
  const sequence = await requireSequence(workspaceId, sequenceId);
  if (sequence.status !== "ACTIVE") throw new AppError(409, "Activate this sequence before enrolling contacts", "SEQUENCE_NOT_ACTIVE");
  const contacts = await prisma.contact.findMany({ where: { id: { in: contactIds }, workspaceId, deletedAt: null, whatsappOpted: true, marketingBlocked: false }, select: { id: true } });
  if (contacts.length !== contactIds.length) throw new AppError(422, "Every selected contact must belong to this workspace and be eligible for WhatsApp marketing", "SEQUENCE_CONTACTS_INELIGIBLE");
  const already = await prisma.sequenceEnrollment.findMany({ where: { sequenceId, contactId: { in: contactIds }, status: { in: ["WAITING", "ACTIVE"] } }, select: { contactId: true } });
  const existing = new Set(already.map(({ contactId }) => contactId));
  const newContacts = contacts.filter(({ id }) => !existing.has(id));
  if (!newContacts.length) return { enrolled: 0, skipped: contactIds.length };
  const firstStep = stepArray(sequence.steps)[0];
  const nextRunAt = new Date(Date.now() + (firstStep?.delayMinutes ?? 0) * 60_000);
  const created = await prisma.sequenceEnrollment.createMany({ data: newContacts.map(({ id }) => ({ sequenceId, workspaceId, contactId: id, status: "WAITING", nextRunAt })), skipDuplicates: true });
  if (created.count) await prisma.sequence.update({ where: { id: sequenceId }, data: { enrolledCount: { increment: created.count } } });
  return { enrolled: created.count, skipped: contactIds.length - created.count };
}

export async function enrollContactFromAutomation(workspaceId: string, sequenceId: string, contactId: string, conversationId?: string) {
  const sequence = await requireSequence(workspaceId, sequenceId);
  if (sequence.status !== "ACTIVE") throw new Error("The configured sequence is not active");
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId, deletedAt: null, whatsappOpted: true, marketingBlocked: false }, select: { id: true } });
  if (!contact) throw new Error("The contact is not eligible for WhatsApp marketing");
  const existing = await prisma.sequenceEnrollment.findFirst({ where: { sequenceId, contactId, status: { in: ["WAITING", "ACTIVE"] } }, select: { id: true } });
  if (existing) return existing;
  const firstStep = stepArray(sequence.steps)[0];
  const enrollment = await prisma.sequenceEnrollment.createMany({ data: [{ sequenceId, workspaceId, contactId, conversationId, status: "WAITING", nextRunAt: new Date(Date.now() + (firstStep?.delayMinutes ?? 0) * 60_000) }], skipDuplicates: true });
  if (!enrollment.count) return prisma.sequenceEnrollment.findFirstOrThrow({ where: { sequenceId, contactId, status: { in: ["WAITING", "ACTIVE"] } }, select: { id: true } });
  await prisma.sequence.update({ where: { id: sequenceId }, data: { enrolledCount: { increment: enrollment.count } } });
  return prisma.sequenceEnrollment.findFirstOrThrow({ where: { sequenceId, contactId, status: { in: ["WAITING", "ACTIVE"] } }, select: { id: true } });
}

export async function stopContactSequence(workspaceId: string, sequenceId: string, contactId: string) {
  await requireSequence(workspaceId, sequenceId);
  const result = await prisma.sequenceEnrollment.updateMany({ where: { workspaceId, sequenceId, contactId, status: { in: ["WAITING", "ACTIVE"] } }, data: { status: "STOPPED", completedAt: new Date(), currentCampaignId: null } });
  return { stopped: result.count };
}

export async function processDueSequenceEnrollments() {
  const now = new Date();
  const candidates = await prisma.sequenceEnrollment.findMany({ where: { status: "WAITING", nextRunAt: { lte: now }, sequence: { status: "ACTIVE" } }, orderBy: [{ nextRunAt: "asc" }, { id: "asc" }], take: 25, select: { id: true, sequenceId: true, workspaceId: true, contactId: true, currentStep: true, currentCampaignId: true, attemptCount: true, sequence: { select: { name: true, steps: true, createdById: true } } } });
  for (const enrollment of candidates) {
    const claimed = await prisma.sequenceEnrollment.updateMany({ where: { id: enrollment.id, status: "WAITING", nextRunAt: { lte: now } }, data: { status: "ACTIVE" } });
    if (!claimed.count) continue;
    try {
      if (enrollment.currentCampaignId) {
        const campaign = await prisma.campaign.findFirst({ where: { id: enrollment.currentCampaignId, workspaceId: enrollment.workspaceId }, select: { status: true, failed: true } });
        if (!campaign) throw new Error("The sequence step campaign could not be found");
        if (campaign.status !== "COMPLETED") {
          await prisma.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "WAITING", nextRunAt: new Date(Date.now() + 15_000) } });
          continue;
        }
        if (campaign.failed) {
          const settings = await prisma.workspaceAutomationSettings.findUnique({ where: { workspaceId: enrollment.workspaceId }, select: { retryLimit: true } });
          if (enrollment.attemptCount >= (settings?.retryLimit ?? 3)) {
            await prisma.$transaction([prisma.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "FAILED", completedAt: new Date(), lastError: "WhatsApp could not deliver this sequence step" } }), prisma.sequence.update({ where: { id: enrollment.sequenceId }, data: { failedCount: { increment: 1 } } })]);
            continue;
          }
          await prisma.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "WAITING", currentCampaignId: null, attemptCount: { increment: 1 }, nextRunAt: new Date(Date.now() + 60_000), lastError: "WhatsApp could not deliver this sequence step" } });
          continue;
        }
        const steps = stepArray(enrollment.sequence.steps);
        const nextIndex = enrollment.currentStep + 1;
        if (nextIndex >= steps.length) {
          await prisma.$transaction([prisma.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "COMPLETED", currentStep: nextIndex, completedAt: new Date(), currentCampaignId: null, lastError: null } }), prisma.sequence.update({ where: { id: enrollment.sequenceId }, data: { completedCount: { increment: 1 } } })]);
          continue;
        }
        await prisma.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "WAITING", currentStep: nextIndex, currentCampaignId: null, attemptCount: 0, lastError: null, nextRunAt: new Date(Date.now() + steps[nextIndex]!.delayMinutes * 60_000) } });
        continue;
      }

      const step = stepArray(enrollment.sequence.steps)[enrollment.currentStep];
      if (!step) throw new Error("The sequence step is missing");
      const settings = await prisma.workspaceAutomationSettings.findUnique({ where: { workspaceId: enrollment.workspaceId } });
      const workspace = await prisma.workspace.findUnique({ where: { id: enrollment.workspaceId }, select: { ownerId: true } });
      const scheduledAt = campaignStepTime(now, settings ?? { timezone: "Asia/Kolkata", sendWindowStart: "09:00", sendWindowEnd: "18:00", sendDays: [1, 2, 3, 4, 5] });
      const campaign = await createCampaign(enrollment.workspaceId, enrollment.sequence.createdById ?? workspace?.ownerId ?? "", {
        name: `${enrollment.sequence.name} · Step ${enrollment.currentStep + 1}`,
        kind: "one_time", category: "Marketing", templateKey: step.templateKey,
        audienceType: "contacts", audienceLabel: `Sequence: ${enrollment.sequence.name}`, contactIds: [enrollment.contactId], phoneNumbers: [], segmentId: undefined,
        launchMode: "schedule", scheduledAt: scheduledAt.toISOString(), retryFailed: true,
        templateVariables: step.templateVariables, audienceConfig: {},
      });
      await prisma.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { currentCampaignId: campaign.id, status: "WAITING", nextRunAt: scheduledAt, attemptCount: 0, lastError: null } });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Sequence step could not be scheduled";
      const settings = await prisma.workspaceAutomationSettings.findUnique({ where: { workspaceId: enrollment.workspaceId }, select: { retryLimit: true } }).catch(() => null);
      if (enrollment.attemptCount >= (settings?.retryLimit ?? 3)) {
        await prisma.$transaction([prisma.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "FAILED", completedAt: new Date(), lastError: reason } }), prisma.sequence.update({ where: { id: enrollment.sequenceId }, data: { failedCount: { increment: 1 } } })]).catch(() => undefined);
      } else {
        await prisma.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { status: "WAITING", attemptCount: { increment: 1 }, nextRunAt: new Date(Date.now() + 60_000), lastError: reason } }).catch(() => undefined);
      }
    }
  }
}
