import type { CookieOptions, Request, Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "../../middleware/error-handler.js";
import { env } from "../../config/env.js";
import { requireAuth } from "../../middleware/authenticate.js";
import { generateSecureToken } from "../../utils/crypto.js";
import * as authService from "./auth.service.js";
import { createAuthorizationUrl, exchangeCode, type GoogleOAuthState } from "./google-oauth.service.js";

const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  path: `${env.API_PREFIX}/auth`,
};
const googleStateCookieName = `${env.AUTH_COOKIE_NAME}_google`;
const googleStateCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  path: `${env.API_PREFIX}/auth/google`,
};
const googleStateTtlMs = 10 * 60 * 1000;

function requestMetadata(request: Request) {
  return { ipAddress: request.ip, userAgent: request.get("user-agent") };
}

function setRefreshCookie(response: Response, token: string, expiresAt: Date): void {
  response.cookie(env.AUTH_COOKIE_NAME, token, {
    ...refreshCookieOptions,
    expires: expiresAt,
  });
}

function queryValue(request: Request, name: string): string | undefined {
  const value = request.query[name];
  return typeof value === "string" ? value : undefined;
}

function safeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

function encodeGoogleState(state: GoogleOAuthState & { codeVerifier: string }): string {
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  const signature = createHmac("sha256", env.ACCESS_TOKEN_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function decodeGoogleState(value: string | undefined): (GoogleOAuthState & { codeVerifier: string }) | null {
  if (!value) return null;
  try {
    const [payload, signature] = value.split(".");
    if (!payload || !signature) return null;
    const expectedSignature = createHmac("sha256", env.ACCESS_TOKEN_SECRET).update(payload).digest("base64url");
    const actualBuffer = Buffer.from(signature, "base64url");
    const expectedBuffer = Buffer.from(expectedSignature, "base64url");
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<GoogleOAuthState & { codeVerifier: string }>;
    if (typeof parsed.state !== "string" || typeof parsed.nonce !== "string" || typeof parsed.codeVerifier !== "string" || typeof parsed.returnTo !== "string") return null;
    return parsed as GoogleOAuthState & { codeVerifier: string };
  } catch {
    return null;
  }
}

function googleFailureRedirect(code: string): string {
  const url = new URL("/login", env.APP_URL);
  url.searchParams.set("google_error", code);
  return url.toString();
}

export async function googleStart(request: Request, response: Response) {
  const state: GoogleOAuthState = {
    state: generateSecureToken(32),
    nonce: generateSecureToken(32),
    returnTo: safeReturnTo(queryValue(request, "returnTo")),
  };
  const authorization = await createAuthorizationUrl(state);
  response.cookie(
    googleStateCookieName,
    encodeGoogleState({ ...state, codeVerifier: authorization.codeVerifier }),
    { ...googleStateCookieOptions, maxAge: googleStateTtlMs },
  );
  response.redirect(authorization.url);
}

export async function googleCallback(request: Request, response: Response) {
  const storedState = decodeGoogleState(request.cookies[googleStateCookieName] as string | undefined);
  response.clearCookie(googleStateCookieName, googleStateCookieOptions);

  try {
    const returnedState = queryValue(request, "state");
    if (!storedState || !returnedState || storedState.state !== returnedState) {
      throw new AppError(401, "Google sign-in could not be verified", "GOOGLE_STATE_INVALID");
    }
    if (queryValue(request, "error")) {
      response.redirect(googleFailureRedirect("GOOGLE_SIGNIN_CANCELLED"));
      return;
    }
    const code = queryValue(request, "code");
    if (!code) throw new AppError(401, "Google did not return an authorization code", "GOOGLE_CODE_MISSING");

    const identity = await exchangeCode(code, storedState.codeVerifier, storedState.nonce);
    const result = await authService.loginWithGoogle(identity, requestMetadata(request));
    setRefreshCookie(response, result.refreshToken, result.refreshExpiresAt);
    response.redirect(new URL(storedState.returnTo, env.APP_URL).toString());
  } catch (error) {
    const code = error instanceof AppError ? error.code : "GOOGLE_AUTH_FAILED";
    response.redirect(googleFailureRedirect(code));
  }
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
