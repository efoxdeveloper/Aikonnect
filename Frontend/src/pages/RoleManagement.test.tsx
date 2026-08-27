import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { RoleManagement } from "@/pages/RoleManagement";

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

const permissionCatalog = [
  { key: "contacts.read", label: "Access Contact Hub", description: "View contacts.", group: "contacts" },
  { key: "contacts.export", label: "Export contacts", description: "Export contact lists.", group: "contacts" },
  { key: "contacts.phone.view", label: "View contact phone numbers", description: "Show phone numbers.", group: "contact-data" },
  { key: "workspace.read", label: "View workspace settings", description: "View workspace details.", group: "workspace" },
];

const initialRoles = [
  { id: "owner-role", name: "Owner", slug: "owner", description: "Full access", isSystem: true, memberCount: 1, permissions: permissionCatalog.map(({ key }) => key) },
  { id: "admin-role", name: "Admin", slug: "admin", description: "Workspace administrator", isSystem: true, memberCount: 0, permissions: ["contacts.read", "workspace.read"] },
  { id: "teammate-role", name: "Teammate", slug: "teammate", description: "Standard access", isSystem: true, memberCount: 0, permissions: ["contacts.read", "contacts.phone.view", "workspace.read"] },
];

function auth(canManage = true): AuthContextValue {
  return {
    status: "authenticated",
    user: {
      id: "user-1",
      email: "owner@example.com",
      firstName: "Workspace",
      lastName: "Owner",
      emailVerifiedAt: "2026-08-22T00:00:00.000Z",
      memberships: [{
        id: "membership-1",
        workspace: { id: "workspace-1", name: "Acme", slug: "acme", country: "India", timezone: "Asia/Kolkata", onboardingCompletedAt: "2026-08-22T00:00:00.000Z" },
        role: { id: "current-role", name: canManage ? "Owner" : "Admin", slug: canManage ? "owner" : "admin", permissions: canManage ? ["roles.read", "roles.manage"] : ["roles.read"] },
      }],
    },
    accessToken: "access-token",
    login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(),
    changeEmail: vi.fn(), refreshUser: vi.fn(), logout: vi.fn(),
  };
}

function renderPage(value = auth()) {
  render(<AuthContext.Provider value={value}><RoleManagement /></AuthContext.Provider>);
}

describe("RoleManagement", () => {
  let roles: typeof initialRoles;

  beforeEach(() => {
    roles = initialRoles.map((role) => ({ ...role, permissions: [...role.permissions] }));
    vi.mocked(apiRequest).mockImplementation(async (path: string, options?: RequestInit) => {
      if (path.endsWith("/permissions")) return permissionCatalog;
      if (path.endsWith("/roles") && options?.method === "POST") {
        const body = JSON.parse(String(options.body)) as { name: string; description?: string; permissions: string[] };
        const created = { id: "custom-role", name: body.name, slug: "support-specialist", description: body.description ?? "", isSystem: false, memberCount: 0, permissions: body.permissions };
        roles = [...roles, created];
        return created;
      }
      if (path.endsWith("/roles")) return roles;
      if (options?.method === "PATCH") {
        const roleId = path.split("/").at(-1);
        const body = JSON.parse(String(options.body)) as { permissions: string[] };
        roles = roles.map((role) => role.id === roleId ? { ...role, permissions: body.permissions } : role);
        return {};
      }
      throw new Error(`Unexpected API request: ${path}`);
    });
  });

  it("shows role tabs and keeps the Owner permission set read-only", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Roles and permissions" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Owner/ })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(screen.getByRole("switch", { name: "Export contacts for Owner" })).toBeChecked());
    expect(screen.getByRole("switch", { name: "Export contacts for Owner" })).toBeDisabled();
  });

  it("saves changed permissions for a configurable built-in role", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Admin/ }));
    const exportSwitch = screen.getByRole("switch", { name: "Export contacts for Admin" });
    expect(exportSwitch).not.toBeChecked();
    fireEvent.click(exportSwitch);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/roles/admin-role",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining("contacts.export"),
      }),
    ));
    expect(await screen.findByText("Permissions saved successfully.")).toBeInTheDocument();
  });

  it("creates a custom role from the Teammate permission template", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Create role" }));
    fireEvent.change(screen.getByLabelText("Role name"), { target: { value: "Support Specialist" } });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: "Handles customer conversations" } });
    fireEvent.click(screen.getByRole("button", { name: "Create custom role" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/roles",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Support Specialist",
          description: "Handles customer conversations",
          permissions: initialRoles[2].permissions,
        }),
      }),
    ));
    expect(await screen.findByRole("tab", { name: /Support Specialist/ })).toHaveAttribute("aria-selected", "true");
  });

  it("renders permissions read-only when the current member cannot manage roles", async () => {
    renderPage(auth(false));
    expect(await screen.findByRole("heading", { name: "Roles and permissions" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create role" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Access Contact Hub for Owner" })).toBeDisabled();
  });
});
