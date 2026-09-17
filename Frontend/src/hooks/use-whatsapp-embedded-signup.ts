import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { apiRequest, ApiError } from "@/lib/api";
import { loadFacebookSdk } from "@/lib/meta-embedded-signup";

type SignupData = { businessId?: string; wabaId: string; phoneNumberId?: string };
type EmbeddedSignupResult = { syncWarnings?: string[] };
export type WhatsAppSignupMode = "coexistence" | "new-number";

type UseWhatsAppEmbeddedSignupOptions = {
  workspaceId: string | undefined;
  accessToken: string | null;
  onConnected?: () => void | Promise<void>;
};

export function useWhatsAppEmbeddedSignup({ workspaceId, accessToken, onConnected }: UseWhatsAppEmbeddedSignupOptions) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<string | null>(null);
  const signupDataRef = useRef<SignupData | null>(null);
  const submittedRef = useRef(false);
  const modeRef = useRef<WhatsAppSignupMode>("coexistence");
  const [pinRequired, setPinRequired] = useState(false);

  useEffect(() => {
    const appId = import.meta.env.VITE_META_APP_ID as string | undefined;
    if (appId) void loadFacebookSdk(appId).catch(() => undefined);
  }, []);

  const submitSignup = useCallback(async (registrationPin?: string) => {
    const code = codeRef.current;
    const signupData = signupDataRef.current;
    const mode = modeRef.current;
    if (!workspaceId || !accessToken || !code || !signupData || submittedRef.current) return;
    if (mode === "new-number" && !/^\d{6}$/.test(registrationPin ?? "")) return;
    submittedRef.current = true;
    try {
      const result = await apiRequest<EmbeddedSignupResult>(`/workspaces/${workspaceId}/whatsapp/embedded-signup`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ code, mode, ...signupData, ...(mode === "new-number" ? { pin: registrationPin } : {}) }),
      });
      const warnings = [...new Set(result?.syncWarnings?.filter(Boolean) ?? [])];
      toast.success(warnings.length
        ? `WhatsApp Business account connected successfully. Optional setup needs attention: ${warnings.join(" ")}`
        : "WhatsApp Business account connected successfully.");
      setConnecting(false);
      setPinRequired(false);
    } catch (caughtError) {
      submittedRef.current = false;
      const message = caughtError instanceof ApiError ? caughtError.message : "WhatsApp could not be connected.";
      setError(message);
      toast.error(message);
      setConnecting(false);
      return;
    }
    // A refresh failure must not turn a successful Meta connection into a connection error.
    try { await onConnected?.(); } catch { /* The next page refresh can retry loading workspace status. */ }
  }, [accessToken, onConnected, workspaceId]);

  useEffect(() => {
    const receiveSignupMessage = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      let payload: Record<string, unknown>;
      try {
        payload = typeof event.data === "string" ? JSON.parse(event.data) as Record<string, unknown> : event.data as Record<string, unknown>;
      } catch {
        return;
      }
      if (payload?.type !== "WA_EMBEDDED_SIGNUP") return;
      const eventName = typeof payload.event === "string" ? payload.event : "";
      if (eventName === "CANCEL" || eventName === "ERROR") {
        const details = payload.data as Record<string, unknown> | undefined;
        const providerMessage = typeof details?.error_message === "string" ? details.error_message : undefined;
        setError(providerMessage ?? (eventName === "ERROR" ? "Meta could not complete WhatsApp Business App onboarding." : "WhatsApp Embedded Signup was cancelled."));
        setConnecting(false);
        return;
      }
      if (!eventName.startsWith("FINISH")) return;
      const details = payload.data as Record<string, unknown> | undefined;
      const wabaId = typeof details?.waba_id === "string" ? details.waba_id : undefined;
      const phoneNumberId = typeof details?.phone_number_id === "string" ? details.phone_number_id : undefined;
      if (!wabaId) {
        setError("Meta did not return a WhatsApp Business Account.");
        setConnecting(false);
        return;
      }
      signupDataRef.current = { wabaId, ...(phoneNumberId ? { phoneNumberId } : {}), ...(typeof details?.business_id === "string" ? { businessId: details.business_id } : {}) };
      if (modeRef.current === "new-number") {
        setConnecting(false);
        setPinRequired(true);
        return;
      }
      void submitSignup();
    };
    window.addEventListener("message", receiveSignupMessage);
    return () => window.removeEventListener("message", receiveSignupMessage);
  }, [submitSignup]);

  const start = useCallback(async (mode: WhatsAppSignupMode = "coexistence") => {
    modeRef.current = mode;
    setError(null);
    setConnecting(true);
    setPinRequired(false);
    codeRef.current = null;
    signupDataRef.current = null;
    submittedRef.current = false;
    try {
      const appId = import.meta.env.VITE_META_APP_ID as string | undefined;
      const configId = (mode === "new-number"
        ? import.meta.env.VITE_META_NEW_NUMBER_CONFIG_ID || import.meta.env.VITE_META_CONFIG_ID
        : import.meta.env.VITE_META_CONFIG_ID) as string | undefined;
      if (!appId || !configId) throw new Error("Meta Embedded Signup is not configured for this environment.");
      const facebook = window.FB;
      if (!facebook) throw new Error("Meta SDK is still loading. Please wait a moment and try again.");
      facebook.login((response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setError("Meta sign-in was cancelled or did not return an authorization code.");
          setConnecting(false);
          return;
        }
        codeRef.current = code;
        void submitSignup();
      }, {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: mode === "coexistence"
          ? { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" }
          : { setup: {} },
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Meta Embedded Signup could not be started.");
      setConnecting(false);
    }
  }, [submitSignup]);

  const submitRegistrationPin = useCallback((pin: string) => submitSignup(pin), [submitSignup]);
  const cancelRegistrationPin = useCallback(() => {
    codeRef.current = null;
    signupDataRef.current = null;
    submittedRef.current = false;
    setPinRequired(false);
    setError(null);
  }, []);

  return { connecting, error, pinRequired, submitRegistrationPin, cancelRegistrationPin, start };
}
