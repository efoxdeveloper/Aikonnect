import { z } from "zod";
import { PERMISSIONS } from "./permissions.js";

const optionalText = (maximum: number) => z.string().trim().max(maximum).optional();
const permissionValues = Object.values(PERMISSIONS) as [string, ...string[]];

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(160),
  companyName: optionalText(160),
  companyWebsite: z.union([z.url().max(500), z.literal("")]).optional(),
  companyLocation: optionalText(200),
  annualRevenue: optionalText(50),
});

const validTimezone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
};

export const updateWorkspaceSchema = createWorkspaceSchema.partial().extend({
  logoData: z.union([z.string().max(2_500_000), z.literal("")]).optional(),
  country: optionalText(100),
  timezone: z.string().trim().max(100).refine(validTimezone, "Select a valid time zone").optional(),
}).refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required",
);

export const completeWorkspaceOnboardingSchema = z.object({
  name: z.string().trim().min(1).max(160),
  country: z.string().trim().min(2).max(100),
  timezone: z.string().trim().min(1).max(100).refine(validTimezone, "Select a valid time zone"),
});

export const inviteMemberSchema = z.object({
  email: z.email().max(320).transform((value) => value.trim().toLowerCase()),
  roleId: z.uuid(),
});

export const acceptInvitationSchema = z.object({ token: z.string().min(32) });

export const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: optionalText(255),
  permissions: z.array(z.enum(permissionValues)).min(1).max(permissionValues.length),
});

export const updateRoleSchema = createRoleSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required",
);

export const changeMemberRoleSchema = z.object({ roleId: z.uuid() });
export const changeMemberStatusSchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]) });

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type CompleteWorkspaceOnboardingInput = z.infer<typeof completeWorkspaceOnboardingSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type ChangeMemberStatusInput = z.infer<typeof changeMemberStatusSchema>;
