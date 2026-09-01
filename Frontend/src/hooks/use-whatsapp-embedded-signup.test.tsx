import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { apiRequest } from "@/lib/api";
import { loadFacebookSdk } from "@/lib/meta-embedded-signup";
import { useWhatsAppEmbeddedSignup } from "./use-whatsapp-embedded-signup";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn(), ApiError: class ApiError extends Error {} }));
vi.mock("@/lib/meta-embedded-signup", () => ({ loadFacebookSdk: vi.fn() }));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const login = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VITE_META_APP_ID", "meta-app-id");
  vi.stubEnv("VITE_META_CONFIG_ID", "818224721365383");
  vi.mocked(loadFacebookSdk).mockResolvedValue({
    init: vi.fn(),
    login,
  });
  window.FB = { init: vi.fn(), login };
  vi.mocked(apiRequest).mockResolvedValue(undefined);
});

afterEach(() => {
  window.FB = undefined;
});

test("launches the Coexistence config and accepts a finish event without a phone id", async () => {
  const { result } = renderHook(() => useWhatsAppEmbeddedSignup({ workspaceId: "workspace-1", accessToken: "access-token" }));
  await waitFor(() => expect(vi.mocked(loadFacebookSdk)).toHaveBeenCalledWith("meta-app-id"));

  await result.current.start();
  expect(login).toHaveBeenCalledTimes(1);
  const options = login.mock.calls[0]?.[1] as FacebookLoginOptions;
  expect(options.config_id).toBe("818224721365383");
  expect(options.extras).toEqual({ setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" });

  login.mock.calls[0]?.[0]({ authResponse: { code: "signup-code" } });
  window.dispatchEvent(new MessageEvent("message", {
    origin: "https://www.facebook.com",
    data: JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", data: { waba_id: "waba-1" } }),
  }));

  await waitFor(() => expect(vi.mocked(apiRequest)).toHaveBeenCalledWith(
    "/workspaces/workspace-1/whatsapp/embedded-signup",
    expect.objectContaining({ method: "POST", body: JSON.stringify({ code: "signup-code", wabaId: "waba-1" }) }),
  ));
});
