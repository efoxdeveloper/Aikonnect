import type { CookieOptions, Request, Response } from "express";
import { env } from "../../config/env.js";
import { requireAuth } from "../../middleware/authenticate.js";
import * as authService from "./auth.service.js";

const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  path: `${env.API_PREFIX}/auth`,
};

function requestMetadata(request: Request) {
  return { ipAddress: request.ip, userAgent: request.get("user-agent") };
}

function setRefreshCookie(response: Response, token: string, expiresAt: Date): void {
  response.cookie(env.AUTH_COOKIE_NAME, token, {
    ...refreshCookieOptions,
    expires: expiresAt,
  });
}

export async function register(request: Request, response: Response) {
  const result = await authService.register(request.body, requestMetadata(request));
  setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
  const { refreshToken: _refreshToken, refreshExpiresAt: _expiresAt, ...data } = result;
  response.status(201).json({ success: true, data });
}

export async function login(request: Request, response: Response) {
  const result = await authService.login(request.body, requestMetadata(request));
  setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
  const { refreshToken: _refreshToken, refreshExpiresAt: _expiresAt, ...data } = result;
  response.status(200).json({ success: true, data });
}

export async function refresh(request: Request, response: Response) {
  const result = await authService.refreshSession(request.cookies[env.AUTH_COOKIE_NAME] as string | undefined);
  setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
  response.status(200).json({ success: true, data: { accessToken: result.accessToken } });
}

export async function logout(request: Request, response: Response) {
  await authService.logout(request.cookies[env.AUTH_COOKIE_NAME] as string | undefined);
  response.clearCookie(env.AUTH_COOKIE_NAME, refreshCookieOptions);
  response.status(204).send();
}

export async function logoutAll(request: Request, response: Response) {
  await authService.logoutAll(requireAuth(request).userId);
  response.clearCookie(env.AUTH_COOKIE_NAME, refreshCookieOptions);
  response.status(204).send();
}

export async function me(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await authService.getCurrentUser(requireAuth(request).userId) });
}

export async function forgotPassword(request: Request, response: Response) {
  const debug = await authService.requestPasswordReset(request.body.email);
  response.status(202).json({
    success: true,
    data: {
      message: "If an account exists for that email, a recovery link has been prepared.",
      ...debug,
    },
  });
}

export async function resetPassword(request: Request, response: Response) {
  await authService.resetPassword(request.body);
  response.status(200).json({ success: true, data: { message: "Password reset successfully" } });
}

export async function verifyEmail(request: Request, response: Response) {
  await authService.verifyEmail(request.body.token);
  response.status(200).json({ success: true, data: { message: "Email verified successfully" } });
}

export async function resendVerification(request: Request, response: Response) {
  const result = await authService.resendVerification(requireAuth(request).userId);
  response.status(202).json({ success: true, data: result });
}

export async function changeEmail(request: Request, response: Response) {
  const result = await authService.changeUnverifiedEmail(requireAuth(request).userId, request.body);
  response.status(200).json({ success: true, data: result });
}

export async function changePassword(request: Request, response: Response) {
  await authService.changePassword(requireAuth(request).userId, request.body);
  response.clearCookie(env.AUTH_COOKIE_NAME, refreshCookieOptions);
  response.status(200).json({ success: true, data: { message: "Password changed; sign in again" } });
}
