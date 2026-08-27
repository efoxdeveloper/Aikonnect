const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1").replace(/\/$/, "");

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
}
