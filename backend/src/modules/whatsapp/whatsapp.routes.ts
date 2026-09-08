import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateBody, validateParams } from "../../middleware/validate.js";
import { requireWorkspacePermission } from "../../middleware/workspace-access.js";
import { PERMISSIONS } from "../workspaces/permissions.js";
import * as controller from "./whatsapp.controller.js";
import { embeddedSignupSchema, testMessageSchema, whatsappWorkspaceParamsSchema } from "./whatsapp.schemas.js";

export const whatsappRouter = Router({ mergeParams: true });

whatsappRouter.use(validateParams(whatsappWorkspaceParamsSchema));
whatsappRouter.post(
  "/embedded-signup",
  requireWorkspacePermission(PERMISSIONS.WHATSAPP_MANAGE),
  validateBody(embeddedSignupSchema),
  asyncHandler(controller.completeEmbeddedSignup),
);
whatsappRouter.post(
  "/test-message",
  requireWorkspacePermission(PERMISSIONS.WHATSAPP_MANAGE),
  validateBody(testMessageSchema),
  asyncHandler(controller.sendTestMessage),
);
whatsappRouter.post(
  "/sync",
  requireWorkspacePermission(PERMISSIONS.WHATSAPP_MANAGE),
  asyncHandler(controller.sync),
);
whatsappRouter.delete(
  "/connection",
  requireWorkspacePermission(PERMISSIONS.WHATSAPP_MANAGE),
  asyncHandler(controller.disconnect),
);
