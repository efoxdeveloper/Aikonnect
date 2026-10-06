import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import * as controller from "./plans.controller.js";

export const plansRouter = Router();
plansRouter.get("/", asyncHandler(controller.list));
