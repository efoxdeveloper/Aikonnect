import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Onboarding } from "@/pages/Onboarding";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  apiRequest: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

vi.mock("@/hooks/use-workspace-setup", () => ({
  useWorkspaceSetup: () => ({
    data: { whatsapp: { status: "DISCONNECTED", accounts: [] } },
  }),
}));

const baseOnboarding: {
  name: string;
  companyName: string;
  country: string;
  timezone: string;
  onboardingStep: number;
  data: { channel: "whatsapp"; state: string; objectives: string[]; integrations: string[]; [key: string]: unknown };
} = {
  name: "Acme Support",
  companyName: "Acme Support",
  country: "India",
  timezone: "Asia/Kolkata",
  onboardingStep: 0,
  data: { channel: "whatsapp", state: "Delhi", objectives: [], integrations: [] },
};

function authValue(): AuthContextValue {
  return {
    status: "authenticated",
    user: {
      id: "user-1",
      email: "owner@example.com",
      firstName: "Workspace",
      lastName: "Owner",
      emailVerifiedAt: "2026-09-24T00:00:00.000Z",
      memberships: [{
        id: "membership-1",
        workspace: { id: "workspace-1", name: "Acme Support", slug: "acme-support", country: "India", timezone: "Asia/Kolkata", onboardingCompletedAt: null },
        role: { id: "role-1", name: "Owner", slug: "owner", permissions: ["workspace.update"] },
      }],
    },
    accessToken: "access-token",
    login: vi.fn(),
    register: vi.fn(),
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
    changeEmail: vi.fn(),
    refreshUser: vi.fn(),
    logout: vi.fn(),
  };
}

function renderOnboarding(response = baseOnboarding) {
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path.endsWith("/onboarding")) return response;
    return undefined;
  });
  return render(<AuthContext.Provider value={authValue()}><MemoryRouter><Onboarding /></MemoryRouter></AuthContext.Provider>);
}

describe("Onboarding", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the saved step and prevents moving past incomplete required answers", async () => {
    renderOnboarding();
    expect(await screen.findByRole("heading", { name: "Which industry does your business belong to?" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("h-dvh", "overflow-y-auto");
    expect(screen.getByTitle("Marento onboarding introduction")).toHaveAttribute("src", "https://www.youtube.com/embed/59fdY8aGPDE?si=1m8QpGckk1EZvDFH");
    expect(screen.getByText("Get started with Marento")).toBeInTheDocument();
    expect(screen.getByText("Tell us about your business")).toBeInTheDocument();
    expect(screen.getByText("Complete your setup checks")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Select your industry");
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
  });

  it("changes sub-category options with the selected industry", async () => {
    renderOnboarding({ ...baseOnboarding, data: { ...baseOnboarding.data, industry: "technology", industrySubcategory: "B2B services" } });
    expect(await screen.findByRole("heading", { name: "Which industry does your business belong to?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retail" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Sub-category" }));
    expect(screen.getByRole("option", { name: "D2C / online store" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "B2B services" })).not.toBeInTheDocument();
  });

  it("saves an optional step when the user skips it", async () => {
    renderOnboarding({ ...baseOnboarding, onboardingStep: 2, data: { ...baseOnboarding.data, industry: "technology", industrySubcategory: "B2B services", objectives: ["automated-notifications"] } });
    expect(await screen.findByRole("heading", { name: "Looking to integrate with a software tool?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/onboarding",
      expect.objectContaining({ method: "PATCH", body: expect.stringContaining('"step":3') }),
    ));
  });

  it("renders integrations in grouped branded cards", async () => {
    renderOnboarding({ ...baseOnboarding, onboardingStep: 2, data: { ...baseOnboarding.data, industry: "technology", industrySubcategory: "B2B services" } });
    expect(await screen.findByRole("heading", { name: "Looking to integrate with a software tool?" })).toBeInTheDocument();
    expect(screen.getByText("Custom Integration")).toBeInTheDocument();
    expect(screen.getByText("Popular Tools")).toBeInTheDocument();
    expect(screen.getByText("Payment Provider")).toBeInTheDocument();
    const shopify = screen.getByRole("button", { name: "Shopify" });
    expect(shopify).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(shopify);
    expect(shopify).toHaveAttribute("aria-pressed", "true");
  });

  it("renders business objectives as descriptive selection cards", async () => {
    renderOnboarding({ ...baseOnboarding, onboardingStep: 1, data: { ...baseOnboarding.data, industry: "technology", industrySubcategory: "B2B services" } });
    expect(await screen.findByRole("heading", { name: "What are your business objectives?" })).toBeInTheDocument();
    const updates = screen.getByRole("button", { name: /Send Project Updates & Technical Alerts/ });
    expect(updates).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(updates);
    expect(updates).toHaveAttribute("aria-pressed", "true");
  });

  it("completes the final verification step and opens the dashboard", async () => {
    const auth = authValue();
    const refreshUser = vi.mocked(auth.refreshUser);
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (path.endsWith("/onboarding")) return {
        ...baseOnboarding,
        onboardingStep: 3,
        data: { ...baseOnboarding.data, industry: "technology", industrySubcategory: "B2B services", objectives: ["automated-notifications"] },
      };
      return undefined;
    });
    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <Onboarding />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(await screen.findByRole("heading", { name: "A Few Quick Checks Before We Begin" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    const firstYes = screen.getAllByRole("radio", { name: "Yes" })[0];
    fireEvent.click(firstYes);
    expect(firstYes).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    const completionStatus = await screen.findByRole("status");
    expect(completionStatus).toBeInTheDocument();
    expect(completionStatus).not.toHaveClass("bg-white");
    expect(screen.getByText("Preparing your workspace")).toBeInTheDocument();
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/onboarding/complete",
      expect.objectContaining({ method: "POST", body: expect.stringContaining('"industry":"technology"') }),
    ));
    expect(refreshUser).toHaveBeenCalledOnce();
  });
});
