import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import type { ActivityListQuery, CreateContactNoteInput, CreateContactTaskInput, UpdateContactNoteInput, UpdateContactTaskInput } from "./contact-activity.schemas.js";

const actorSelect = { id: true, firstName: true, lastName: true, email: true } as const;

async function requireActiveContact(workspaceId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId, deletedAt: null }, select: { id: true } });
  if (!contact) throw new AppError(404, "Contact was not found", "CONTACT_NOT_FOUND");
}

function pagination(query: ActivityListQuery, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  return { page: query.page, pageSize: query.pageSize, total, totalPages, hasNext: query.page < totalPages, hasPrevious: query.page > 1 };
}

export async function listTasks(workspaceId: string, contactId: string, query: ActivityListQuery) {
  await requireActiveContact(workspaceId, contactId);
  const where = { workspaceId, contactId };
  const [total, items] = await prisma.$transaction([
    prisma.contactTask.count({ where }),
    prisma.contactTask.findMany({ where, orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { createdBy: { select: actorSelect } } }),
  ]);
  return { items, pagination: pagination(query, total) };
}

export async function createTask(workspaceId: string, contactId: string, actorUserId: string, input: CreateContactTaskInput) {
  await requireActiveContact(workspaceId, contactId);
  return prisma.contactTask.create({
    data: { workspaceId, contactId, title: input.title, description: input.description || null, dueAt: input.dueAt ? new Date(input.dueAt) : null, createdById: actorUserId, updatedById: actorUserId },
    include: { createdBy: { select: actorSelect } },
  });
}

export async function updateTask(workspaceId: string, contactId: string, taskId: string, actorUserId: string, input: UpdateContactTaskInput) {
  await requireActiveContact(workspaceId, contactId);
  const existing = await prisma.contactTask.findFirst({ where: { id: taskId, workspaceId, contactId }, select: { id: true, status: true } });
  if (!existing) throw new AppError(404, "Task was not found", "CONTACT_TASK_NOT_FOUND");
  return prisma.contactTask.update({
    where: { id: taskId, workspaceId, contactId },
    data: {
      title: input.title,
      description: input.description,
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt ? new Date(input.dueAt) : null } : {}),
      status: input.status,
      ...(input.status ? { completedAt: input.status === "COMPLETED" ? new Date() : null } : {}),
      updatedById: actorUserId,
    },
    include: { createdBy: { select: actorSelect } },
  });
}

export async function listNotes(workspaceId: string, contactId: string, query: ActivityListQuery) {
  await requireActiveContact(workspaceId, contactId);
  const where = { workspaceId, contactId, deletedAt: null };
  const [total, items] = await prisma.$transaction([
    prisma.contactNote.count({ where }),
    prisma.contactNote.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { createdBy: { select: actorSelect } } }),
  ]);
  return { items, pagination: pagination(query, total) };
}

function noteTitle(input: CreateContactNoteInput) {
  if (input.title) return input.title;
  const firstLine = input.content.split(/\r?\n/, 1)[0]?.trim() || "Note";
  return firstLine.length > 160 ? `${firstLine.slice(0, 157)}...` : firstLine;
}

export async function createNote(workspaceId: string, contactId: string, actorUserId: string, input: CreateContactNoteInput) {
  await requireActiveContact(workspaceId, contactId);
  return prisma.contactNote.create({
    data: { workspaceId, contactId, title: noteTitle(input), content: input.content, createdById: actorUserId, updatedById: actorUserId },
    include: { createdBy: { select: actorSelect } },
  });
}

export async function updateNote(workspaceId: string, contactId: string, noteId: string, actorUserId: string, input: UpdateContactNoteInput) {
  await requireActiveContact(workspaceId, contactId);
  const existing = await prisma.contactNote.findFirst({ where: { id: noteId, workspaceId, contactId, deletedAt: null }, select: { id: true } });
  if (!existing) throw new AppError(404, "Note was not found", "CONTACT_NOTE_NOT_FOUND");
  return prisma.contactNote.update({
    where: { id: noteId },
    data: {
      content: input.content,
      title: input.title ?? (input.content ? noteTitle({ content: input.content }) : undefined),
      updatedById: actorUserId,
    },
    include: { createdBy: { select: actorSelect } },
  });
}

export async function deleteNote(workspaceId: string, contactId: string, noteId: string, actorUserId: string): Promise<void> {
  await requireActiveContact(workspaceId, contactId);
  const result = await prisma.contactNote.updateMany({
    where: { id: noteId, workspaceId, contactId, deletedAt: null },
    data: { deletedAt: new Date(), deletedById: actorUserId, updatedById: actorUserId },
  });
  if (result.count !== 1) throw new AppError(404, "Note was not found", "CONTACT_NOTE_NOT_FOUND");
}
