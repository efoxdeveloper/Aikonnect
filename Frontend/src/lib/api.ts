import { beginRequest, endRequest } from "@/lib/request-events";

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:5006/api/v1").replace(/\/$/, "");

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

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");

  beginRequest();
  try {
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
        credentials: "include",
      });
    } catch {
      throw new ApiError(0, "Unable to connect to the server. Please try again.", "NETWORK_ERROR");
    }

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
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, { headers: { authorization: `Bearer ${accessToken}` }, credentials: "include" });
    } catch {
      throw new ApiError(0, "Unable to connect to the server. Please try again.", "NETWORK_ERROR");
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as ErrorEnvelope;
      throw new ApiError(response.status, payload.error?.message ?? "The file could not be downloaded.", payload.error?.code);
    }
    return response.blob();
  } finally { endRequest(); }
}
