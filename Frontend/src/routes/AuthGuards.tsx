import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Wave } from "@/components/loading-ui/wave";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const sessionLoaderExitDuration = 280;

function useSessionLoadingTransition(loading: boolean) {
  const [visible, setVisible] = useState(loading);

  useEffect(() => {
    if (loading) {
      setVisible(true);
      return;
    }
    if (!visible) return;
    const timeout = window.setTimeout(() => {
      setVisible(false);
    }, sessionLoaderExitDuration);
    return () => window.clearTimeout(timeout);
  }, [loading, visible]);

  return { visible, exiting: visible && !loading };
}

function SessionLoading({ exiting = false }: { exiting?: boolean }) {
  return (
    <main
      className={cn(
        "fixed inset-0 z-[1000] flex h-dvh items-center justify-center bg-white transition-opacity duration-300 ease-out will-change-[opacity]",
        exiting ? "opacity-0" : "opacity-100",
      )}
      aria-live="polite"
      data-exiting={exiting || undefined}
    >
      <Wave
        aria-label="Checking your session"
        className={cn(
          "h-12 w-24 text-[var(--brand)] transition-[opacity,transform,filter] duration-300 ease-out will-change-[opacity,transform]",
          exiting && "scale-90 opacity-0 blur-[1px]",
        )}
      />
    </main>
  );
}

export function ProtectedRoute() {
  const { status, user } = useAuth();
  const location = useLocation();
  const loadingTransition = useSessionLoadingTransition(status === "loading");

  if (status === "loading") return <SessionLoading />;
  if (loadingTransition.visible) {
    const revealProtectedContent = status === "authenticated" && Boolean(user?.emailVerifiedAt);
    return <>{revealProtectedContent && <Outlet />}<SessionLoading exiting={loadingTransition.exiting} /></>;
  }
  if (status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (!user?.emailVerifiedAt) return <Navigate to="/verify-email" replace />;
  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { status, user } = useAuth();
  const location = useLocation();
  const loadingTransition = useSessionLoadingTransition(status === "loading");
  const invitation = new URLSearchParams(location.search).get("invitation");
  const invitationPath = invitation ? `/invitations/accept?token=${encodeURIComponent(invitation)}` : null;
  if (status === "loading") return <SessionLoading />;
  if (loadingTransition.visible) {
    return <>{status === "unauthenticated" && <Outlet />}<SessionLoading exiting={loadingTransition.exiting} /></>;
  }
  if (status === "authenticated") {
    return <Navigate to={user?.emailVerifiedAt ? invitationPath ?? "/dashboard" : invitation ? `/verify-email?invitation=${encodeURIComponent(invitation)}` : "/verify-email"} replace />;
  }
  return <Outlet />;
}

export function getSafeRedirectPath(state: unknown): string {
  if (!state || typeof state !== "object" || !("from" in state)) return "/dashboard";
  const from = (state as { from?: { pathname?: unknown; search?: unknown } }).from;
  if (
    !from ||
    typeof from.pathname !== "string" ||
    !from.pathname.startsWith("/") ||
    from.pathname.startsWith("//")
  ) {
    return "/dashboard";
  }
  const search = typeof from.search === "string" ? from.search : "";
  return `${from.pathname}${search}`;
}
