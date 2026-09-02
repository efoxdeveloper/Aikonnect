import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../database/prisma.js";
import type { ReportKey, ReportQuery } from "./report.schemas.js";

type ReportValue = string | number | boolean | null;
type ReportRow = Record<string, ReportValue>;
export type ReportData = { report: ReportKey; filters: { from: string; to: string }; summary: Record<string, number>; rows: ReportRow[]; pagination: { page: number; pageSize: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean }; trends?: Array<{ date: string; value: number; secondary?: number }> };

function range(query: ReportQuery) {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}
function period(field: "createdAt" | "sentAt" | "startedAt" | "dueAt", dates: { from: Date; to: Date }): Record<string, unknown> { return { [field]: { gte: dates.from, lte: dates.to } }; }
function pct(value: number, total: number) { return total ? Math.round((value / total) * 100) : 0; }
function day(date: Date) { return date.toISOString().slice(0, 10); }
function pageRows(rows: ReportRow[], query: ReportQuery) { const totalPages = Math.max(1, Math.ceil(rows.length / query.pageSize)); return { rows: rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), pagination: { page: query.page, pageSize: query.pageSize, total: rows.length, totalPages, hasNext: query.page < totalPages, hasPrevious: query.page > 1 } }; }
function base(report: ReportKey, query: ReportQuery, summary: Record<string, number>, rows: ReportRow[], trends?: ReportData["trends"]): ReportData { const dates = range(query); const paged = pageRows(rows, query); return { report, filters: { from: dates.from.toISOString(), to: dates.to.toISOString() }, summary, ...paged, ...(trends ? { trends } : {}) }; }
function searchText(row: ReportRow, search: string) { if (!search) return true; const needle = search.toLocaleLowerCase(); return Object.values(row).some((value) => String(value ?? "").toLocaleLowerCase().includes(needle)); }

async function overview(workspaceId: string, query: ReportQuery) {
  const dates = range(query);
  const [allContacts, contacts, conversations, messages, tasks, automationLogs, workflowRuns, activeAutomations, activeWorkflows] = await prisma.$transaction([
    prisma.contact.count({ where: { workspaceId, deletedAt: null } }),
    prisma.contact.findMany({ where: { workspaceId, deletedAt: null, ...period("createdAt", dates) }, select: { createdAt: true } }),
    prisma.conversation.findMany({ where: { workspaceId, ...period("createdAt", dates) }, select: { status: true, channelKey: true, createdAt: true } }),
    prisma.message.findMany({ where: { workspaceId, ...period("sentAt", dates) }, select: { direction: true, status: true, sentAt: true } }),
    prisma.contactTask.findMany({ where: { workspaceId, ...period("createdAt", dates) }, select: { status: true, dueAt: true } }),
    prisma.automationLog.findMany({ where: { workspaceId, ...period("startedAt", dates) }, select: { status: true, startedAt: true } }),
    prisma.workflowRun.findMany({ where: { workspaceId, ...period("startedAt", dates) }, select: { status: true, startedAt: true } }),
    prisma.automation.count({ where: { workspaceId, status: "ACTIVE" } }),
    prisma.workflow.count({ where: { workspaceId, status: "ACTIVE" } }),
  ]);
  const outgoing = messages.filter((message) => message.direction === "OUTGOING");
  const trends = new Map<string, { value: number; secondary: number }>();
  for (const message of messages) { const item = trends.get(day(message.sentAt)) ?? { value: 0, secondary: 0 }; item.value += 1; if (message.direction === "INCOMING") item.secondary += 1; trends.set(day(message.sentAt), item); }
  return base("overview", query, {
    totalContacts: allContacts, newContacts: contacts.length, conversations: conversations.length, openConversations: conversations.filter(({ status }) => status === "OPEN").length,
    messages: messages.length, incomingMessages: messages.filter(({ direction }) => direction === "INCOMING").length, outgoingMessages: outgoing.length, deliveredMessages: outgoing.filter(({ status }) => ["DELIVERED", "READ"].includes(status)).length, readMessages: outgoing.filter(({ status }) => status === "READ").length, failedMessages: outgoing.filter(({ status }) => status === "FAILED").length,
    openTasks: tasks.filter(({ status }) => status === "OPEN").length, overdueTasks: tasks.filter(({ status, dueAt }) => status === "OPEN" && dueAt !== null && dueAt < new Date()).length, completedTasks: tasks.filter(({ status }) => status === "COMPLETED").length,
    activeAutomations, automationFailures: automationLogs.filter(({ status }) => status === "FAILED").length, activeWorkflows, workflowFailures: workflowRuns.filter(({ status }) => status === "FAILED").length,
  }, [], [...trends.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, ...value })));
}

async function campaigns(workspaceId: string, query: ReportQuery) {
  const dates = range(query);
  const items = await prisma.campaign.findMany({ where: { workspaceId, ...period("createdAt", dates), ...(query.status ? { status: query.status as never } : {}), ...(query.category ? { category: query.category } : {}), ...(query.channel ? { channelKey: query.channel } : {}) }, select: { id: true, name: true, channelKey: true, kind: true, category: true, templateName: true, audienceLabel: true, status: true, recipientCount: true, attempted: true, sent: true, delivered: true, read: true, replied: true, failed: true, totalCost: true, setLiveAt: true, createdAt: true, createdBy: { select: { firstName: true, lastName: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  const rows = items.map((item) => ({ id: item.id, campaign: item.name, channel: item.channelKey, kind: item.kind, category: item.category, template: item.templateName ?? "--", audience: item.audienceLabel, status: item.status, recipients: item.recipientCount, attempted: item.attempted, sent: item.sent, delivered: item.delivered, deliveredRate: pct(item.delivered, item.sent), read: item.read, readRate: pct(item.read, item.sent), replied: item.replied, replyRate: pct(item.replied, item.sent), failed: item.failed, cost: item.totalCost === null ? null : Number(item.totalCost), createdBy: item.createdBy ? `${item.createdBy.firstName} ${item.createdBy.lastName}`.trim() : "Interakt Admin", setLiveAt: item.setLiveAt?.toISOString() ?? null })) satisfies ReportRow[];
  const filtered = rows.filter((row) => searchText(row, query.search));
  return base("campaigns", query, { campaigns: filtered.length, recipients: filtered.reduce((sum, row) => sum + Number(row.recipients ?? 0), 0), sent: filtered.reduce((sum, row) => sum + Number(row.sent ?? 0), 0), delivered: filtered.reduce((sum, row) => sum + Number(row.delivered ?? 0), 0), read: filtered.reduce((sum, row) => sum + Number(row.read ?? 0), 0), replies: filtered.reduce((sum, row) => sum + Number(row.replied ?? 0), 0), failed: filtered.reduce((sum, row) => sum + Number(row.failed ?? 0), 0) }, filtered);
}

async function conversations(workspaceId: string, query: ReportQuery) {
  const dates = range(query);
  const conversationWhere: Prisma.ConversationWhereInput = { workspaceId, ...period("createdAt", dates), ...(query.status ? { status: query.status as never } : {}), ...(query.channel ? { channelKey: query.channel } : {}), ...(query.search ? { OR: [{ contact: { name: { contains: query.search, mode: "insensitive" } } }, { lastMessagePreview: { contains: query.search, mode: "insensitive" } }]} : {}) };
  const items = await prisma.conversation.findMany({ where: conversationWhere, select: { id: true, channelKey: true, status: true, unreadCount: true, lastMessageAt: true, contact: { select: { name: true } } }, orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }] });
  const messages = await prisma.message.findMany({ where: { workspaceId, conversationId: { in: items.map(({ id }) => id) }, ...period("sentAt", dates) }, select: { conversationId: true, direction: true, status: true, createdById: true, sentAt: true } });
  const stats = new Map<string, { total: number; incoming: number; outgoing: number; delivered: number; failed: number }>();
  for (const message of messages) { const item = stats.get(message.conversationId) ?? { total: 0, incoming: 0, outgoing: 0, delivered: 0, failed: 0 }; item.total += 1; if (message.direction === "INCOMING") item.incoming += 1; else { item.outgoing += 1; if (["DELIVERED", "READ"].includes(message.status)) item.delivered += 1; if (message.status === "FAILED") item.failed += 1; } stats.set(message.conversationId, item); }
  const rows = items.map((item) => ({ id: item.id, contact: item.contact.name, channel: item.channelKey, status: item.status, messages: stats.get(item.id)?.total ?? 0, incoming: stats.get(item.id)?.incoming ?? 0, outgoing: stats.get(item.id)?.outgoing ?? 0, delivered: stats.get(item.id)?.delivered ?? 0, failed: stats.get(item.id)?.failed ?? 0, unread: item.unreadCount, lastMessageAt: item.lastMessageAt?.toISOString() ?? null })) satisfies ReportRow[];
  const members = await prisma.user.findMany({ where: { id: { in: [...new Set(messages.map(({ createdById }) => createdById).filter((id): id is string => Boolean(id)))] } }, select: { id: true, firstName: true, lastName: true } });
  const byMember = new Map<string, { outgoing: number; conversations: Set<string> }>();
  for (const message of messages.filter(({ direction }) => direction === "OUTGOING")) { const key = message.createdById ?? "system"; const item = byMember.get(key) ?? { outgoing: 0, conversations: new Set<string>() }; item.outgoing += 1; item.conversations.add(message.conversationId); byMember.set(key, item); }
  const memberNames = new Map(members.map((member) => [member.id, `${member.firstName} ${member.lastName}`.trim()]));
  const teamRows = [...byMember.entries()].map(([id, item]) => ({ member: id === "system" ? "System / WhatsApp" : memberNames.get(id) ?? "Unknown user", outgoing: item.outgoing, conversations: item.conversations.size })) satisfies ReportRow[];
  return { ...base("conversations", query, { conversations: rows.length, messages: messages.length, incoming: messages.filter(({ direction }) => direction === "INCOMING").length, outgoing: messages.filter(({ direction }) => direction === "OUTGOING").length, open: items.filter(({ status }) => status === "OPEN").length, unresolved: items.filter(({ status }) => ["OPEN", "PENDING"].includes(status)).length }, rows), team: teamRows } as ReportData & { team: ReportRow[] };
}

async function contacts(workspaceId: string, query: ReportQuery) {
  const dates = range(query);
  const where: Prisma.ContactWhereInput = { workspaceId, deletedAt: null, ...period("createdAt", dates), ...(query.status ? { status: query.status } : {}), ...(query.source ? { source: query.source } : {}), ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { email: { contains: query.search, mode: "insensitive" } }, { phoneE164: { contains: query.search } }] } : {}) };
  const items = await prisma.contact.findMany({ where, select: { id: true, name: true, phoneE164: true, email: true, source: true, status: true, dealValue: true, whatsappOpted: true, marketingBlocked: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  const rows = items.map((item) => ({ id: item.id, contact: item.name, phone: item.phoneE164, email: item.email, source: item.source, stage: item.status, dealValue: item.dealValue === null ? null : Number(item.dealValue), whatsappOpted: item.whatsappOpted, marketingBlocked: item.marketingBlocked, createdAt: item.createdAt.toISOString() })) satisfies ReportRow[];
  return base("contacts", query, { contacts: rows.length, optedIn: rows.filter((row) => row.whatsappOpted === true).length, optedOutOrBlocked: rows.filter((row) => row.whatsappOpted === false || row.marketingBlocked === true).length, totalDealValue: rows.reduce((sum, row) => sum + Number(row.dealValue ?? 0), 0) }, rows);
}

async function automations(workspaceId: string, query: ReportQuery) {
  const dates = range(query);
  const automationItems = await prisma.automation.findMany({ where: { workspaceId, ...(query.status ? { status: query.status as never } : {}), ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}) }, select: { id: true, name: true, status: true, runCount: true, lastRunAt: true, createdAt: true } });
  const workflowItems = await prisma.workflow.findMany({ where: { workspaceId, ...(query.status ? { status: query.status as never } : {}), ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}) }, select: { id: true, name: true, status: true, runCount: true, enrolledCount: true, lastRunAt: true, createdAt: true } });
  const logs = await prisma.automationLog.findMany({ where: { workspaceId, automationId: { in: automationItems.map(({ id }) => id) }, ...period("startedAt", dates) }, select: { automationId: true, status: true } });
  const runs = await prisma.workflowRun.findMany({ where: { workspaceId, workflowId: { in: workflowItems.map(({ id }) => id) }, ...period("startedAt", dates) }, select: { workflowId: true, status: true } });
  const rows = [
    ...automationItems.map((item) => ({ id: item.id, type: "Automation", name: item.name, status: item.status, runs: logs.filter(({ automationId }) => automationId === item.id).length, success: logs.filter(({ automationId, status }) => automationId === item.id && status === "SUCCESS").length, failures: logs.filter(({ automationId, status }) => automationId === item.id && status === "FAILED").length, enrolled: null, lastRunAt: item.lastRunAt?.toISOString() ?? null, createdAt: item.createdAt.toISOString() })),
    ...workflowItems.map((item) => ({ id: item.id, type: "Workflow", name: item.name, status: item.status, runs: runs.filter(({ workflowId }) => workflowId === item.id).length, success: runs.filter(({ workflowId, status }) => workflowId === item.id && status === "COMPLETED").length, failures: runs.filter(({ workflowId, status }) => workflowId === item.id && status === "FAILED").length, enrolled: item.enrolledCount, lastRunAt: item.lastRunAt?.toISOString() ?? null, createdAt: item.createdAt.toISOString() })),
  ] satisfies ReportRow[];
  return base("automations", query, { automations: automationItems.length, workflows: workflowItems.length, active: rows.filter((row) => row.status === "ACTIVE").length, runs: rows.reduce((sum, row) => sum + Number(row.runs ?? 0), 0), successes: rows.reduce((sum, row) => sum + Number(row.success ?? 0), 0), failures: rows.reduce((sum, row) => sum + Number(row.failures ?? 0), 0) }, rows);
}

async function templates(workspaceId: string, query: ReportQuery) {
  const dates = range(query);
  const items = await prisma.template.findMany({ where: { workspaceId, ...period("createdAt", dates), ...(query.status ? { status: query.status as never } : {}), ...(query.category ? { category: query.category } : {}), ...(query.search ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { templateKey: { contains: query.search, mode: "insensitive" } }] } : {}) }, select: { id: true, name: true, templateKey: true, status: true, category: true, language: true, createdAt: true, updatedAt: true } });
  const messages = await prisma.message.findMany({ where: { workspaceId, direction: "OUTGOING", ...period("sentAt", dates) }, select: { payload: true } });
  const usage = new Map<string, number>();
  for (const message of messages) if (message.payload && typeof message.payload === "object" && !Array.isArray(message.payload)) { const payload = message.payload as Record<string, unknown>; const key = typeof payload.templateKey === "string" ? payload.templateKey : typeof payload.templateId === "string" ? payload.templateId : null; if (key) usage.set(key, (usage.get(key) ?? 0) + 1); }
  const rows = items.map((item) => ({ id: item.id, template: item.name, key: item.templateKey, status: item.status, category: item.category, language: item.language, usage: usage.get(item.templateKey) ?? 0, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })) satisfies ReportRow[];
  return base("templates", query, { templates: rows.length, approved: rows.filter((row) => row.status === "APPROVED").length, pending: rows.filter((row) => row.status === "PENDING").length, rejected: rows.filter((row) => row.status === "REJECTED").length, used: rows.filter((row) => Number(row.usage) > 0).length }, rows);
}

async function tasks(workspaceId: string, query: ReportQuery) {
  const dates = range(query);
  const where: Prisma.ContactTaskWhereInput = { workspaceId, ...period("createdAt", dates), ...(query.status ? { status: query.status as never } : {}), ...(query.search ? { OR: [{ title: { contains: query.search, mode: "insensitive" } }, { contact: { name: { contains: query.search, mode: "insensitive" } } }] } : {}) };
  const items = await prisma.contactTask.findMany({ where, select: { id: true, title: true, status: true, dueAt: true, completedAt: true, createdAt: true, contact: { select: { name: true } }, createdBy: { select: { firstName: true, lastName: true } } }, orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }] });
  const rows = items.map((item) => ({ id: item.id, task: item.title, contact: item.contact.name, status: item.status, dueAt: item.dueAt?.toISOString() ?? null, overdue: item.status === "OPEN" && item.dueAt !== null && item.dueAt < new Date(), completedAt: item.completedAt?.toISOString() ?? null, createdBy: item.createdBy ? `${item.createdBy.firstName} ${item.createdBy.lastName}`.trim() : "Unknown user", createdAt: item.createdAt.toISOString() })) satisfies ReportRow[];
  return base("tasks", query, { tasks: rows.length, open: rows.filter((row) => row.status === "OPEN").length, completed: rows.filter((row) => row.status === "COMPLETED").length, overdue: rows.filter((row) => row.overdue === true).length }, rows);
}

export async function getReport(workspaceId: string, report: ReportKey, query: ReportQuery): Promise<ReportData> {
  if (report === "overview") return overview(workspaceId, query);
  if (report === "campaigns") return campaigns(workspaceId, query);
  if (report === "conversations") return conversations(workspaceId, query);
  if (report === "contacts") return contacts(workspaceId, query);
  if (report === "automations") return automations(workspaceId, query);
  if (report === "templates") return templates(workspaceId, query);
  return tasks(workspaceId, query);
}

function csvValue(value: ReportValue) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
export function reportCsv(data: ReportData) {
  const rows: ReportRow[] = data.rows.length ? data.rows : Object.entries(data.summary).map(([metric, value]) => ({ metric, value }));
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [columns.map(csvValue).join(","), ...rows.map((row) => columns.map((column) => csvValue(row[column] ?? null)).join(","))].join("\n");
}
