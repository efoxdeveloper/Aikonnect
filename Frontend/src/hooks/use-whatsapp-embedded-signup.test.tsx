import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { toast } from "react-toastify";
import { apiRequest } from "@/lib/api";
import { loadFacebookSdk } from "@/lib/meta-embedded-signup";
import { useWhatsAppEmbeddedSignup } from "./use-whatsapp-embedded-signup";

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code = "API_ERROR", public details?: unknown) {
      super(message);
    }
  },
}));
vi.mock("@/lib/meta-embedded-signup", () => ({ loadFacebookSdk: vi.fn() }));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

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

test("keeps a successful connection when the workspace status refresh fails", async () => {
  const onConnected = vi.fn().mockRejectedValue(new Error("refresh failed"));
  const { result } = renderHook(() => useWhatsAppEmbeddedSignup({ workspaceId: "workspace-1", accessToken: "access-token", onConnected }));
  await result.current.start();
  login.mock.calls[0]?.[0]({ authResponse: { code: "signup-code" } });
  window.dispatchEvent(new MessageEvent("message", {
    origin: "https://www.facebook.com",
    data: JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", data: { waba_id: "waba-1" } }),
  }));

  await waitFor(() => expect(onConnected).toHaveBeenCalledOnce());
  expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  expect(vi.mocked(toast.success)).toHaveBeenCalledWith("WhatsApp Business account connected successfully.");
});

test.each([
  ["META_NETWORK_ERROR", "The server could not reach Meta while exchanging the signup code. The connection to Meta timed out. Please try again."],
  ["META_API_ERROR", "Meta rejected the request while loading the WhatsApp phone number: (#100) Tried accessing nonexisting field (messaging_limit)"],
  ["META_COEXISTENCE_INCOMPLETE", "Meta has not confirmed that this WhatsApp Business App number is connected to Cloud API. Complete the coexistence connection in WhatsApp Business App, then launch signup again."],
])("shows the backend reason for %s", async (code, message) => {
  const { ApiError } = await import("@/lib/api");
  vi.mocked(apiRequest).mockRejectedValueOnce(new ApiError(code === "META_COEXISTENCE_INCOMPLETE" ? 422 : 502, message, code));
  const { result } = renderHook(() => useWhatsAppEmbeddedSignup({ workspaceId: "workspace-1", accessToken: "access-token" }));

  await result.current.start();
  login.mock.calls[0]?.[0]({ authResponse: { code: "signup-code" } });
  window.dispatchEvent(new MessageEvent("message", {
    origin: "https://www.facebook.com",
    data: JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", data: { waba_id: "waba-1" } }),
  }));

  await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledWith(message));
  expect(result.current.error).toBe(message);
});

test("shows post-setup warnings in one successful connection notification", async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce({ syncWarnings: ["Meta rejected the request while subscribing the app to WhatsApp webhooks: Permission denied."] });
  const { result } = renderHook(() => useWhatsAppEmbeddedSignup({ workspaceId: "workspace-1", accessToken: "access-token" }));

  await result.current.start();
  login.mock.calls[0]?.[0]({ authResponse: { code: "signup-code" } });
  window.dispatchEvent(new MessageEvent("message", {
    origin: "https://www.facebook.com",
    data: JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", data: { waba_id: "waba-1" } }),
  }));

  await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
    "WhatsApp Business account connected successfully. Optional setup needs attention: Meta rejected the request while subscribing the app to WhatsApp webhooks: Permission denied.",
  ));
  expect(vi.mocked(toast.success)).toHaveBeenCalledOnce();
  expect(vi.mocked(toast.warn)).not.toHaveBeenCalled();
  expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
});
