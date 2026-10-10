import { prisma } from "../../database/prisma.js";
import type { UpdateAutomationSettingsInput } from "./automation-settings.schemas.js";

const defaults = { timezone: "Asia/Kolkata", sendWindowStart: "09:00", sendWindowEnd: "18:00", sendDays: [1, 2, 3, 4, 5], retryLimit: 3 };

export async function getAutomationSettings(workspaceId: string) {
  const [settings, workspace] = await Promise.all([
    prisma.workspaceAutomationSettings.findUnique({ where: { workspaceId } }),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { timezone: true } }),
  ]);
  const resolved = settings ?? defaults;
  return { ...resolved, timezone: settings?.timezone ?? workspace?.timezone ?? defaults.timezone, sendDays: Array.isArray(resolved.sendDays) ? resolved.sendDays as number[] : defaults.sendDays };
}

export function updateAutomationSettings(workspaceId: string, input: UpdateAutomationSettingsInput) {
  return prisma.workspaceAutomationSettings.upsert({
    where: { workspaceId },
    create: { workspaceId, ...input },
    update: input,
  });
}
