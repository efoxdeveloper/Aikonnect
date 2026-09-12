import { Router } from "express";
import { authenticate, requireVerifiedEmail } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateBody } from "../../middleware/validate.js";
import { requireWorkspacePermission } from "../../middleware/workspace-access.js";
import { PERMISSIONS } from "./permissions.js";
import * as controller from "./workspace.controller.js";
import {
  acceptInvitationSchema,
  changeMemberRoleSchema,
  changeMemberStatusSchema,
  completeWorkspaceOnboardingSchema,
  createRoleSchema,
  createWorkspaceSchema,
  inviteMemberSchema,
  updateRoleSchema,
  updateWorkspaceSchema,
} from "./workspace.schemas.js";
import { contactRouter } from "../contacts/contact.routes.js";
import { templateRouter } from "../templates/template.routes.js";
import { inboxRouter } from "../conversations/conversation.routes.js";
import { whatsappRouter } from "../whatsapp/whatsapp.routes.js";
import { automationRouter } from "../automations/automation.routes.js";
import { workflowRouter } from "../workflows/workflow.routes.js";
import { campaignRouter } from "../campaigns/campaign.routes.js";
import { reportRouter } from "../reports/report.routes.js";
import { apiKeyRouter } from "../api-keys/api-key.routes.js";
import { webhookRouter } from "../webhooks/webhook.routes.js";

export const workspaceRouter = Router();

workspaceRouter.use(authenticate, requireVerifiedEmail);
workspaceRouter.get("/", asyncHandler(controller.list));
workspaceRouter.post("/", validateBody(createWorkspaceSchema), asyncHandler(controller.create));
workspaceRouter.post("/invitations/accept", validateBody(acceptInvitationSchema), asyncHandler(controller.acceptInvitation));

workspaceRouter.get("/:workspaceId", requireWorkspacePermission(PERMISSIONS.WORKSPACE_READ), asyncHandler(controller.get));
workspaceRouter.get("/:workspaceId/setup", requireWorkspacePermission(PERMISSIONS.WORKSPACE_READ), asyncHandler(controller.setup));
workspaceRouter.patch("/:workspaceId", requireWorkspacePermission(PERMISSIONS.WORKSPACE_UPDATE), validateBody(updateWorkspaceSchema), asyncHandler(controller.update));
workspaceRouter.delete("/:workspaceId", requireWorkspacePermission(PERMISSIONS.WORKSPACE_DELETE), asyncHandler(controller.remove));
workspaceRouter.post("/:workspaceId/onboarding/complete", requireWorkspacePermission(PERMISSIONS.WORKSPACE_UPDATE), validateBody(completeWorkspaceOnboardingSchema), asyncHandler(controller.completeOnboarding));

workspaceRouter.get("/:workspaceId/members", requireWorkspacePermission(PERMISSIONS.MEMBERS_READ), asyncHandler(controller.members));
workspaceRouter.patch("/:workspaceId/members/:membershipId/role", requireWorkspacePermission(PERMISSIONS.MEMBERS_MANAGE), validateBody(changeMemberRoleSchema), asyncHandler(controller.changeMemberRole));
workspaceRouter.patch("/:workspaceId/members/:membershipId/status", requireWorkspacePermission(PERMISSIONS.MEMBERS_MANAGE), validateBody(changeMemberStatusSchema), asyncHandler(controller.changeMemberStatus));
workspaceRouter.delete("/:workspaceId/members/:membershipId", requireWorkspacePermission(PERMISSIONS.MEMBERS_REMOVE), asyncHandler(controller.removeMember));

workspaceRouter.get("/:workspaceId/invitations", requireWorkspacePermission(PERMISSIONS.MEMBERS_READ), asyncHandler(controller.invitations));
workspaceRouter.post("/:workspaceId/invitations", requireWorkspacePermission(PERMISSIONS.MEMBERS_INVITE), validateBody(inviteMemberSchema), asyncHandler(controller.invite));
workspaceRouter.delete("/:workspaceId/invitations/:invitationId", requireWorkspacePermission(PERMISSIONS.MEMBERS_INVITE), asyncHandler(controller.revokeInvitation));

workspaceRouter.get("/:workspaceId/roles", requireWorkspacePermission(PERMISSIONS.ROLES_READ), asyncHandler(controller.roles));
workspaceRouter.get("/:workspaceId/permissions", requireWorkspacePermission(PERMISSIONS.ROLES_READ), asyncHandler(controller.permissions));
workspaceRouter.post("/:workspaceId/roles", requireWorkspacePermission(PERMISSIONS.ROLES_MANAGE), validateBody(createRoleSchema), asyncHandler(controller.createRole));
workspaceRouter.patch("/:workspaceId/roles/:roleId", requireWorkspacePermission(PERMISSIONS.ROLES_MANAGE), validateBody(updateRoleSchema), asyncHandler(controller.updateRole));
workspaceRouter.delete("/:workspaceId/roles/:roleId", requireWorkspacePermission(PERMISSIONS.ROLES_MANAGE), asyncHandler(controller.deleteRole));
workspaceRouter.use("/:workspaceId/contacts", contactRouter);
workspaceRouter.use("/:workspaceId/templates", templateRouter);
workspaceRouter.use("/:workspaceId/conversations", inboxRouter);
workspaceRouter.use("/:workspaceId/whatsapp", whatsappRouter);
workspaceRouter.use("/:workspaceId/automations", automationRouter);
workspaceRouter.use("/:workspaceId/workflows", workflowRouter);
workspaceRouter.use("/:workspaceId/campaigns", campaignRouter);
workspaceRouter.use("/:workspaceId/reports", reportRouter);
workspaceRouter.use("/:workspaceId/api-keys", apiKeyRouter);
workspaceRouter.use("/:workspaceId/webhooks", webhookRouter);
