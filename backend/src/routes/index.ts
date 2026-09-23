import { Router } from "express";
import { authRouter } from "../modules/auth/auth.routes.js";
import { adminRouter } from "../modules/admin/admin.routes.js";
import { healthRouter } from "../modules/health/health.routes.js";
import { workspaceRouter } from "../modules/workspaces/workspace.routes.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/workspaces", workspaceRouter);
