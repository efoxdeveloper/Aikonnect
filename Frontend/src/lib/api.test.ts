import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  apiRequest,
  configureAuthSession,
  downloadApiFile,
  setApiAccessToken,
} from "@/lib/api";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  setApiAccessToken(null);
  configureAuthSession({});
});

describe("authenticated API requests", () => {
  it("automatically attaches the active access token when a request does not provide headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ success: true, data: { loaded: true } }));
    setApiAccessToken("active-token");

    await expect(apiRequest<{ loaded: boolean }>("/admin/workspaces")).resolves.toEqual({ loaded: true });

    expect(new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).get("authorization")).toBe("Bearer active-token");
  });

  it("does not attach an existing access token to login or refresh requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ success: true, data: { accessToken: "new-token" } }));
    setApiAccessToken("old-token");

    await apiRequest("/auth/login", { method: "POST", body: "{}" });
    await apiRequest("/auth/refresh", { method: "POST" });

    expect(new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).get("authorization")).toBeNull();
    expect(new Headers((fetchMock.mock.calls[1]?.[1] as RequestInit).headers).get("authorization")).toBeNull();
  });

  it("refreshes an expired access token and retries the original request", async () => {
    const refreshed = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ error: { code: "ACCESS_TOKEN_INVALID", message: "Expired" } }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { accessToken: "fresh-token" } }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { value: "loaded" } }));
    configureAuthSession({ onAccessTokenRefreshed: refreshed });
    setApiAccessToken("expired-token");

    await expect(apiRequest<{ value: string }>("/workspaces/workspace-1", {
      headers: { authorization: "Bearer expired-token" },
    })).resolves.toEqual({ value: "loaded" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/auth/refresh");
    expect(new Headers((fetchMock.mock.calls[2]?.[1] as RequestInit).headers).get("authorization")).toBe("Bearer fresh-token");
    expect(refreshed).toHaveBeenCalledWith("fresh-token");
  });

  it("shares one refresh request when several API calls expire together", async () => {
    let protectedRequests = 0;
    let refreshRequests = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        refreshRequests += 1;
        await Promise.resolve();
        return jsonResponse({ success: true, data: { accessToken: "fresh-token" } });
      }
      protectedRequests += 1;
      if (protectedRequests <= 2) return jsonResponse({ error: { code: "ACCESS_TOKEN_INVALID" } }, 401);
      return jsonResponse({ success: true, data: { ok: true } });
    });
    setApiAccessToken("expired-token");

    const results = await Promise.all([
      apiRequest<{ ok: boolean }>("/one", { headers: { authorization: "Bearer expired-token" } }),
      apiRequest<{ ok: boolean }>("/two", { headers: { authorization: "Bearer expired-token" } }),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(refreshRequests).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("does not refresh unauthenticated 401 responses", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED", message: "Sign in required" } }, 401));

    await expect(apiRequest("/public")).rejects.toMatchObject({
      status: 401,
      code: "AUTHENTICATION_REQUIRED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears the authenticated session when the refresh cookie is invalid", async () => {
    const authenticationLost = vi.fn();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ error: { code: "ACCESS_TOKEN_INVALID", message: "Expired" } }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: { code: "REFRESH_TOKEN_INVALID", message: "Refresh expired" } }, 401));
    configureAuthSession({ onAuthenticationLost: authenticationLost });
    setApiAccessToken("expired-token");

    await expect(apiRequest("/private", {
      headers: { authorization: "Bearer expired-token" },
    })).rejects.toBeInstanceOf(ApiError);

    expect(authenticationLost).toHaveBeenCalledOnce();
  });

  it("applies the same refresh behavior to file downloads", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { accessToken: "fresh-token" } }))
      .mockResolvedValueOnce(new Response("file contents", { status: 200 }));
    setApiAccessToken("expired-token");

    await expect(downloadApiFile("/reports/export", "expired-token")).resolves.toBeInstanceOf(Blob);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(new Headers((fetchMock.mock.calls[2]?.[1] as RequestInit).headers).get("authorization")).toBe("Bearer fresh-token");
  });
});
