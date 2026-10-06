import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateBody, validateParams } from "../../middleware/validate.js";
import { requireWorkspacePermission } from "../../middleware/workspace-access.js";
import { PERMISSIONS } from "../workspaces/permissions.js";
import * as controller from "./assignment-rule.controller.js";
import { assignmentRuleInputSchema, assignmentRuleParamsSchema, assignmentRuleWorkspaceParamsSchema, reorderAssignmentRulesSchema } from "./assignment-rule.schemas.js";

export const assignmentRuleRouter = Router({ mergeParams: true });
assignmentRuleRouter.get("/options", requireWorkspacePermission(PERMISSIONS.CONVERSATIONS_ASSIGN), validateParams(assignmentRuleWorkspaceParamsSchema), asyncHandler(controller.options));
assignmentRuleRouter.get("/", requireWorkspacePermission(PERMISSIONS.CONVERSATIONS_ASSIGN), validateParams(assignmentRuleWorkspaceParamsSchema), asyncHandler(controller.list));
assignmentRuleRouter.post("/", requireWorkspacePermission(PERMISSIONS.CONVERSATIONS_ASSIGN), validateParams(assignmentRuleWorkspaceParamsSchema), validateBody(assignmentRuleInputSchema), asyncHandler(controller.create));
assignmentRuleRouter.put("/reorder", requireWorkspacePermission(PERMISSIONS.CONVERSATIONS_ASSIGN), validateParams(assignmentRuleWorkspaceParamsSchema), validateBody(reorderAssignmentRulesSchema), asyncHandler(controller.reorder));
assignmentRuleRouter.put("/:ruleId", requireWorkspacePermission(PERMISSIONS.CONVERSATIONS_ASSIGN), validateParams(assignmentRuleParamsSchema), validateBody(assignmentRuleInputSchema), asyncHandler(controller.update));
assignmentRuleRouter.delete("/:ruleId", requireWorkspacePermission(PERMISSIONS.CONVERSATIONS_ASSIGN), validateParams(assignmentRuleParamsSchema), asyncHandler(controller.remove));
