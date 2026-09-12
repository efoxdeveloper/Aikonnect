import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { validateBody } from "../../middleware/validate.js";
import { env } from "../../config/env.js";
import { createRateLimiter } from "../../config/rate-limit.js";
import * as controller from "./auth.controller.js";
import {
  changePasswordSchema,
  changeEmailSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "./auth.schemas.js";

export const authRouter = Router();

const credentialRateLimit = createRateLimiter({ windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.RATE_LIMIT_MAX });

authRouter.post("/register", credentialRateLimit, validateBody(registerSchema), asyncHandler(controller.register));
authRouter.post("/login", credentialRateLimit, validateBody(loginSchema), asyncHandler(controller.login));
authRouter.get("/google", asyncHandler(controller.googleStart));
authRouter.get("/google/callback", asyncHandler(controller.googleCallback));
authRouter.post("/refresh", asyncHandler(controller.refresh));
authRouter.post("/logout", asyncHandler(controller.logout));
authRouter.post("/forgot-password", credentialRateLimit, validateBody(forgotPasswordSchema), asyncHandler(controller.forgotPassword));
authRouter.post("/reset-password", credentialRateLimit, validateBody(resetPasswordSchema), asyncHandler(controller.resetPassword));
authRouter.post("/verify-email", validateBody(verifyEmailSchema), asyncHandler(controller.verifyEmail));
authRouter.post("/resend-verification", credentialRateLimit, authenticate, asyncHandler(controller.resendVerification));
authRouter.patch("/email", credentialRateLimit, authenticate, validateBody(changeEmailSchema), asyncHandler(controller.changeEmail));
authRouter.get("/me", authenticate, asyncHandler(controller.me));
authRouter.post("/logout-all", authenticate, asyncHandler(controller.logoutAll));
authRouter.post("/change-password", authenticate, validateBody(changePasswordSchema), asyncHandler(controller.changePassword));
