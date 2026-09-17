import { describe, expect, it, vi } from "vitest";
import { logGoogleOAuthEvent } from "@/lib/google-oauth-debug";

describe("Google OAuth diagnostics", () => {
  it("logs only the supplied non-sensitive diagnostic metadata", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logGoogleOAuthEvent("oauth_start", {
      apiOrigin: "https://example.com",
      sameOrigin: true,
      returnTo: "/dashboard",
    });

    expect(info).toHaveBeenCalledWith("[Google OAuth]", expect.objectContaining({
      event: "oauth_start",
      apiOrigin: "https://example.com",
      sameOrigin: true,
      returnTo: "/dashboard",
    }));
    expect(info.mock.calls[0]?.[1]).not.toHaveProperty("state");
    expect(info.mock.calls[0]?.[1]).not.toHaveProperty("code");
    info.mockRestore();
  });
});
