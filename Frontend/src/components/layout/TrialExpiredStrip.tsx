import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";
import { cn } from "@/lib/utils";

type WorkspacePlanStatus = { status: "NONE" | "ACTIVE" | "TRIALING" | "EXPIRED"; planName: string | null; trialEndsAt: string | null };

export function TrialExpiredStrip({ className }: { className?: string }) {
  const { accessToken, user } = useAuth();
  const { pathname } = useLocation();
  const isAccountEntryPage = /^\/(login|register|forgot-password|reset-password|verify-email)(\/|$)/.test(pathname);
  const membership = getActiveMembership(user);
  const workspaceId = membership?.workspace.id;
  const canReadWorkspace = membership?.role.permissions.includes("workspace.read") ?? false;
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (isAccountEntryPage || !workspaceId || !accessToken || !canReadWorkspace) {
      setExpired(false);
      return;
    }
    let current = true;
    void apiRequest<WorkspacePlanStatus>(`/workspaces/${workspaceId}/plan-status`, {
      headers: { authorization: `Bearer ${accessToken}` },
    }).then((result) => {
      if (current) setExpired(result.status === "EXPIRED");
    }).catch(() => {
      if (current) setExpired(false);
    });
    return () => { current = false; };
  }, [accessToken, canReadWorkspace, isAccountEntryPage, workspaceId]);

  if (!expired || isAccountEntryPage) return null;
  return <div data-testid="trial-expired-navbar-notice" role="alert" className={cn("flex h-8 min-w-0 items-center gap-2 rounded-full border border-[#c8b400] bg-gradient-to-b from-[#fff600] via-[#ffe900] to-[#ffdc00] px-3 text-[11px] font-bold text-black shadow-[0_2px_5px_rgba(91,72,0,.2),inset_0_1px_0_rgba(255,255,255,.75),inset_0_-1px_0_rgba(199,162,0,.28)]", className)}>
    <span className="grid size-[19px] shrink-0 place-items-center rounded-full bg-white/65 shadow-[0_1px_2px_rgba(0,0,0,.18)] ring-1 ring-black/10"><AlertTriangle size={12} className="text-black" aria-hidden="true" /></span>
    <span className="min-w-0 truncate"><strong className="font-bold text-black">Trial ended</strong><span className="hidden xl:inline"> · Workspace is read-only</span></span>
    <Link to="/billing/plans" className="ml-auto inline-flex h-full shrink-0 items-center border-l border-black/25 pl-2.5 text-[10px] font-bold text-black underline-offset-2 hover:underline">View plans</Link>
  </div>;
}
