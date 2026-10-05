import type { AuthUser } from "@/contexts/AuthContext";

const ACTIVE_WORKSPACE_KEY = "interakt.activeWorkspaceId";
const ONBOARDING_WORKSPACE_KEY = "interakt.workspaceOnboardingPrompt";

export function setActiveWorkspaceId(workspaceId: string) {
  window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId);
}

export function getActiveMembership(user: AuthUser | null) {
  if (!user) return undefined;
  const activeId = window.localStorage.getItem(ACTIVE_WORKSPACE_KEY);
  return user.memberships.find(({ workspace }) => workspace.id === activeId) ?? user.memberships[0];
}

export function needsWorkspaceOnboarding(user: AuthUser | null) {
  const membership = getActiveMembership(user);
  if (!membership || membership.role.slug !== "owner") return false;

  const tenantId = membership.workspace.tenantId;
  const organizationOnboarded = user?.memberships.some(({ workspace }) =>
    workspace.onboardingCompletedAt != null &&
    (tenantId ? workspace.tenantId === tenantId : workspace.id === membership.workspace.id),
  );

  return !organizationOnboarded;
}

export function markWorkspaceForOnboarding(workspaceId: string) {
  window.sessionStorage.setItem(ONBOARDING_WORKSPACE_KEY, workspaceId);
}

export function shouldPromptWorkspaceOnboarding(user: AuthUser | null, workspaceId: string) {
  if (!user) return false;
  const membership = user.memberships.find(({ workspace }) => workspace.id === workspaceId);
  if (!membership) return false;
  const tenantId = membership.workspace.tenantId;
  const organizationOnboarded = user.memberships.some(({ workspace }) =>
    workspace.onboardingCompletedAt != null &&
    (tenantId ? workspace.tenantId === tenantId : workspace.id === workspaceId),
  );
  if (organizationOnboarded) return false;
  return user.memberships.length === 1 || window.sessionStorage.getItem(ONBOARDING_WORKSPACE_KEY) === workspaceId;
}

export function clearWorkspaceOnboardingPrompt(workspaceId: string) {
  if (window.sessionStorage.getItem(ONBOARDING_WORKSPACE_KEY) === workspaceId) window.sessionStorage.removeItem(ONBOARDING_WORKSPACE_KEY);
}
