import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { authenticateDeveloperApiKey, requireDeveloperScope } from "../../middleware/developer-api-key.js";
import { validateBody } from "../../middleware/validate.js";
import * as controller from "./developer-api.controller.js";
import { sendMessageSchema } from "./developer-api.schemas.js";

export const developerApiRouter = Router();
developerApiRouter.use(authenticateDeveloperApiKey);
developerApiRouter.post("/messages", requireDeveloperScope("messages.send"), validateBody(sendMessageSchema), asyncHandler(controller.sendMessage));
