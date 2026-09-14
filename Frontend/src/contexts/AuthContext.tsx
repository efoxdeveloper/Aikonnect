import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiRequest, configureAuthSession, getApiAccessToken, refreshAccessToken, setApiAccessToken } from "@/lib/api";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerifiedAt: string | null;
  memberships: Array<{
    id: string;
    workspace: {
      id: string;
      name: string;
      slug: string;
      country: string | null;
      timezone: string | null;
      onboardingCompletedAt: string | null;
      logoData?: string | null;
    };
    role: { id: string; name: string; slug: string; permissions: string[] };
  }>;
};

type LoginResponse = { accessToken: string };

export type RegisterRequest = {
  email: string;
  password: string;
  invitationToken?: string;
  firstName: string;
  lastName: string;
  phone: string;
  companyName: string;
  industry?: string;
  companyWebsite?: string;
  companyLocation: string;
  annualRevenue: string;
};

export type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterRequest) => Promise<void>;
  verifyEmail: (token: string) => Promise<void>;
  resendVerification: () => Promise<{ emailSent: boolean; verificationUrl?: string }>;
  changeEmail: (email: string, password: string) => Promise<{ email: string; emailSent: boolean }>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const bootstrapStarted = useRef(false);
  const bootstrapPromise = useRef<Promise<void> | null>(null);

  const handleAccessTokenRefreshed = useCallback((refreshedToken: string) => {
    accessTokenRef.current = refreshedToken;
    setAccessToken(refreshedToken);
  }, []);

  const handleAuthenticationLost = useCallback(() => {
    accessTokenRef.current = null;
    setApiAccessToken(null);
    setAccessToken(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  useEffect(() => configureAuthSession({
    onAccessTokenRefreshed: handleAccessTokenRefreshed,
    onAuthenticationLost: handleAuthenticationLost,
  }), [handleAccessTokenRefreshed, handleAuthenticationLost]);

  const loadUser = useCallback(async (token: string) => {
    setApiAccessToken(token);
    const currentUser = await apiRequest<AuthUser>("/auth/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    const effectiveToken = getApiAccessToken() ?? token;
    accessTokenRef.current = effectiveToken;
    setAccessToken(effectiveToken);
    setUser(currentUser);
    setStatus("authenticated");
  }, []);

  useEffect(() => {
    if (bootstrapStarted.current) return;
    bootstrapStarted.current = true;

    bootstrapPromise.current = apiRequest<LoginResponse>("/auth/refresh", { method: "POST" })
      .then(({ accessToken: refreshedToken }) => loadUser(refreshedToken))
      .catch(() => {
        accessTokenRef.current = null;
        setApiAccessToken(null);
        setAccessToken(null);
        setUser(null);
        setStatus("unauthenticated");
    });
    void bootstrapPromise.current;
  }, [loadUser]);

  useEffect(() => {
    if (!accessToken) return;

    let expiryTimer: number | undefined;
    try {
      const encodedPayload = accessToken.split(".")[1];
      const normalizedPayload = encodedPayload
        ?.replace(/-/g, "+")
        .replace(/_/g, "/");
      const payload = encodedPayload
        ? JSON.parse(atob((normalizedPayload ?? "") + "=".repeat((4 - (normalizedPayload?.length ?? 0) % 4) % 4))) as { exp?: unknown }
        : null;
      if (typeof payload?.exp === "number") {
        const refreshInMs = Math.max(1_000, payload.exp * 1_000 - Date.now() - 60_000);
        expiryTimer = window.setTimeout(() => {
          void refreshAccessToken().catch(() => undefined);
        }, refreshInMs);
      }
    } catch {
      // The API retry path still refreshes tokens if a token cannot be decoded here.
    }

    return () => {
      if (expiryTimer !== undefined) window.clearTimeout(expiryTimer);
    };
  }, [accessToken]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await loadUser(result.accessToken);
    },
    [loadUser],
  );

  const register = useCallback(
    async (input: RegisterRequest) => {
      const result = await apiRequest<LoginResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      });
      await loadUser(result.accessToken);
    },
    [loadUser],
  );

  const verifyEmail = useCallback(
    async (token: string) => {
      await apiRequest<void>("/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      await bootstrapPromise.current?.catch(() => undefined);
      if (accessTokenRef.current) await loadUser(accessTokenRef.current);
    },
    [loadUser],
  );

  const resendVerification = useCallback(async () => {
    if (!accessToken) throw new Error("Authentication is required to resend verification");
    return apiRequest<{ emailSent: boolean; verificationUrl?: string }>("/auth/resend-verification", {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }, [accessToken]);

  const changeEmail = useCallback(
    async (email: string, password: string) => {
      if (!accessToken) throw new Error("Authentication is required to change email");
      const result = await apiRequest<{ email: string; emailSent: boolean }>("/auth/email", {
        method: "PATCH",
        headers: { authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ email, password }),
      });
      await loadUser(accessToken);
      return result;
    },
    [accessToken, loadUser],
  );

  const refreshUser = useCallback(async () => {
    const token = accessTokenRef.current;
    if (!token) throw new Error("Authentication is required to refresh the current user");
    await loadUser(token);
  }, [loadUser]);

  const logout = useCallback(async () => {
    try {
      await apiRequest<void>("/auth/logout", { method: "POST" });
    } finally {
      accessTokenRef.current = null;
      setApiAccessToken(null);
      setAccessToken(null);
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, accessToken, login, register, verifyEmail, resendVerification, changeEmail, refreshUser, logout }),
    [accessToken, changeEmail, login, logout, refreshUser, register, resendVerification, status, user, verifyEmail],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
