import { beginRequest, endRequest } from "@/lib/request-events";
import { logGoogleOAuthEvent } from "@/lib/google-oauth-debug";

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:5006/api/v1").replace(/\/$/, "");

type AuthSessionHandlers = {
  onAccessTokenRefreshed?: (accessToken: string) => void;
  onAuthenticationLost?: () => void;
};

let activeAccessToken: string | null = null;
let refreshInFlight: Promise<string> | null = null;
let authSessionHandlers: AuthSessionHandlers = {};

export function setApiAccessToken(accessToken: string | null): void {
  activeAccessToken = accessToken;
}

export function getApiAccessToken(): string | null {
  return activeAccessToken;
}

export function configureAuthSession(handlers: AuthSessionHandlers): () => void {
  authSessionHandlers = handlers;
  return () => {
    if (authSessionHandlers === handlers) authSessionHandlers = {};
  };
}

export function getWebSocketUrl(path: string, accessToken: string, parameters: Record<string, string> = {}) {
  const endpoint = new URL(`${API_BASE_URL}${path}`, window.location.origin);
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  endpoint.searchParams.set("token", accessToken);
  Object.entries(parameters).forEach(([key, value]) => endpoint.searchParams.set(key, value));
  return endpoint.toString();
}

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
};

type ErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "API_ERROR",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isBearerAuthorization(value: string | null): boolean {
  return Boolean(value?.startsWith("Bearer ") && value.slice(7));
}

function isAuthBootstrapPath(path: string): boolean {
  return path === "/auth/login" || path === "/auth/register" || path === "/auth/refresh";
}

function notifyAuthenticationLost(): void {
  activeAccessToken = null;
  authSessionHandlers.onAuthenticationLost?.();
}

function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError
    ? error.status === 401
    : typeof error === "object"
      && error !== null
      && "status" in error
      && error.status === 401;
}

async function refreshAccessTokenRequest(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      logGoogleOAuthEvent("session_refresh_network_error", {
        apiOrigin: new URL(API_BASE_URL, window.location.origin).origin,
        apiPath: `${new URL(API_BASE_URL, window.location.origin).pathname}/auth/refresh`,
      }, "warn");
      throw new ApiError(0, "Unable to connect to the server. Please try again.", "NETWORK_ERROR");
    }

    logGoogleOAuthEvent("session_refresh_response", {
      apiOrigin: new URL(API_BASE_URL, window.location.origin).origin,
      apiPath: `${new URL(API_BASE_URL, window.location.origin).pathname}/auth/refresh`,
      status: response.status,
      ok: response.ok,
      credentialsIncluded: true,
    }, response.ok ? "info" : "warn");

    const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<LoginResponse> & ErrorEnvelope;
    if (!response.ok) {
      throw new ApiError(
        response.status,
        payload.error?.message ?? "Your session could not be refreshed.",
        payload.error?.code ?? "SESSION_REFRESH_FAILED",
        payload.error?.details,
      );
    }

    const refreshedToken = payload.data?.accessToken;
    if (typeof refreshedToken !== "string" || !refreshedToken) {
      throw new ApiError(502, "The server returned an invalid session.", "SESSION_REFRESH_INVALID");
    }

    activeAccessToken = refreshedToken;
    authSessionHandlers.onAccessTokenRefreshed?.(refreshedToken);
    return refreshedToken;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

export async function refreshAccessToken(): Promise<string> {
  try {
    return await refreshAccessTokenRequest();
  } catch (error) {
    if (isUnauthorizedError(error)) notifyAuthenticationLost();
    throw error;
  }
}

async function requestWithAuthRetry(path: string, options: RequestInit, headers: Headers): Promise<Response> {
  const suppliedAuthorization = headers.get("authorization");
  if (!suppliedAuthorization && activeAccessToken && !isAuthBootstrapPath(path)) {
    headers.set("authorization", `Bearer ${activeAccessToken}`);
  } else if (isBearerAuthorization(suppliedAuthorization) && activeAccessToken && suppliedAuthorization !== `Bearer ${activeAccessToken}`) {
    headers.set("authorization", `Bearer ${activeAccessToken}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, credentials: "include" });
  } catch {
    throw new ApiError(0, "Unable to connect to the server. Please try again.", "NETWORK_ERROR");
  }

  const authorization = headers.get("authorization");
  if (response.status !== 401 || !isBearerAuthorization(authorization) || path === "/auth/refresh") return response;

  const failedToken = authorization?.slice(7) ?? "";
  const retryToken = activeAccessToken && activeAccessToken !== failedToken
    ? activeAccessToken
    : await refreshAccessToken();
  const retryHeaders = new Headers(headers);
  retryHeaders.set("authorization", `Bearer ${retryToken}`);

  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers: retryHeaders, credentials: "include" });
  } catch {
    throw new ApiError(0, "Unable to connect to the server. Please try again.", "NETWORK_ERROR");
  }

  if (response.status === 401) notifyAuthenticationLost();
  return response;
}

type LoginResponse = { accessToken: string };

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");

  beginRequest();
  try {
    const response = await requestWithAuthRetry(path, options, headers);

    if (response.status === 204) return undefined as T;
    const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T> & ErrorEnvelope;
    if (!response.ok) {
      throw new ApiError(
        response.status,
        payload.error?.message ?? "The request could not be completed.",
        payload.error?.code,
        payload.error?.details,
      );
    }

    return payload.data;
  } finally {
    endRequest();
  }
}

export async function downloadApiFile(path: string, accessToken: string): Promise<Blob> {
  beginRequest();
  try {
    const response = await requestWithAuthRetry(path, {}, new Headers({ authorization: `Bearer ${accessToken}` }));
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as ErrorEnvelope;
      throw new ApiError(response.status, payload.error?.message ?? "The file could not be downloaded.", payload.error?.code);
    }
    return response.blob();
  } finally { endRequest(); }
}
