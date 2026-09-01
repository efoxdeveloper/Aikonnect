import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "react-toastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { WorkflowBuilder } from "@/pages/WorkflowBuilder";
import { Workflows } from "@/pages/Workflows";

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  apiRequest: vi.fn(),
}));
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const permissions = ["automations.read", "automations.manage"];
const auth: AuthContextValue = {
  status: "authenticated",
  accessToken: "access-token",
  user: {
    id: "user-1",
    email: "owner@example.com",
    firstName: "Workspace",
    lastName: "Owner",
    emailVerifiedAt: null,
    memberships: [
      {
        id: "membership-1",
        workspace: {
          id: "workspace-1",
          name: "Acme",
          slug: "acme",
          country: "India",
          timezone: "Asia/Kolkata",
          onboardingCompletedAt: null,
        },
        role: { id: "role-1", name: "Owner", slug: "owner", permissions },
      },
    ],
  },
  login: vi.fn(),
  register: vi.fn(),
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
  changeEmail: vi.fn(),
  refreshUser: vi.fn(),
  logout: vi.fn(),
};
const restrictedAuth: AuthContextValue = {
  ...auth,
  user: auth.user
    ? {
        ...auth.user,
        memberships: auth.user.memberships.map((membership) => ({
          ...membership,
          role: { ...membership.role, permissions: ["automations.read"] },
        })),
      }
    : null,
};
const workflow = {
  id: "workflow-1",
  workspaceId: "workspace-1",
  name: "New Lead Nurture",
  description: "Guide new leads",
  status: "ACTIVE",
  trigger: { type: "CONTACT_CREATED", config: {} },
  conditions: [],
  steps: [
    {
      id: "step-1",
      type: "SEND_MESSAGE",
      branch: "YES",
      order: 1,
      config: { message: "Welcome" },
    },
  ],
  edges: [],
  runCount: 18,
  enrolledCount: 7,
  lastRunAt: null,
  createdAt: "2026-08-29T08:00:00.000Z",
  updatedAt: "2026-08-29T08:00:00.000Z",
  createdBy: { id: "user-1", firstName: "Workspace", lastName: "Owner" },
} as const;

function renderRoutes(initialEntry: string) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/workflows" element={<Workflows />} />
          <Route path="/workflows/create" element={<WorkflowBuilder />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("Workflow module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiRequest).mockImplementation(async (path, options) => {
      if (options?.method === "POST")
        return {
          ...workflow,
          status: path.includes("/activate") ? "ACTIVE" : "DRAFT",
        } as never;
      if (path.includes("/workflows?") || path.endsWith("/workflows"))
        return {
          items: [workflow],
          pagination: {
            page: 1,
            pageSize: 25,
            total: 1,
            totalPages: 1,
            hasNext: false,
            hasPrevious: false,
          },
        } as never;
      if (path.includes("/contacts/tags")) return [] as never;
      if (path.includes("/members")) return [] as never;
      if (path.includes("/custom-fields")) return [] as never;
      if (path.includes("/templates")) return { items: [] } as never;
      return workflow as never;
    });
  });

  it("renders the workflow list with counts and bounded table scrolling", async () => {
    renderRoutes("/workflows");
    expect(await screen.findByText("New Lead Nurture")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Triggered")).toBeInTheDocument();
    expect(screen.getByText("Finished")).toBeInTheDocument();
    expect(screen.getByText("1", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByTestId("workflows-table-scroll-region")).toHaveClass(
      "min-h-0",
      "overflow-auto",
    );
  });

  it("blocks workflow creation without manage permission", () => {
    render(
      <AuthContext.Provider value={restrictedAuth}>
        <MemoryRouter initialEntries={["/workflows/create"]}>
          <WorkflowBuilder />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(
      screen.getByText("Workflow access is restricted"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Publish" }),
    ).not.toBeInTheDocument();
  });

  it("builds and publishes a non-linear Yes/No workflow", async () => {
    renderRoutes("/workflows/create");
    expect(screen.getByTestId("workflow-flow-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("rf__wrapper")).toHaveAttribute(
      "role",
      "application",
    );
    fireEvent.change(screen.getByLabelText("Workflow Name"), {
      target: { value: "New lead nurture" },
    });
    fireEvent.click(
      screen.getByTestId("workflow-entry-card").querySelector("button")!,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Contact created/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Ask a question/ }));
    await waitFor(() =>
      expect(
        document.querySelector('[data-testid^="workflow-decision-"]'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("workflow-yes-branch")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-no-branch")).toBeInTheDocument();
    fireEvent.click(
      document.querySelector('[data-testid^="workflow-decision-"] button')!,
    );
    fireEvent.change(await screen.findByLabelText("Workflow question"), {
      target: { value: "Would you like a demo?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: /Send a message With no response required/,
      }),
    );
    await waitFor(() =>
      expect(
        document.querySelector('[data-testid^="workflow-action-"]'),
      ).toBeInTheDocument(),
    );
    fireEvent.click(
      document.querySelector('[data-testid^="workflow-action-"] button')!,
    );
    const message = await screen.findByLabelText("Message");
    fireEvent.change(message, { target: { value: "Welcome" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Workflow published."),
    );
    const createCall = vi
      .mocked(apiRequest)
      .mock.calls.find(
        ([, options]) =>
          options?.method === "POST" &&
          !String(options.body).includes("activate"),
      );
    expect(JSON.parse(String(createCall?.[1]?.body)).steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ branch: "YES", type: "SEND_MESSAGE" }),
      ]),
    );
    expect(JSON.parse(String(createCall?.[1]?.body)).edges).toEqual(
      expect.arrayContaining([expect.objectContaining({ condition: "YES" })]),
    );
  }, 10_000);

  it("chains multiple question nodes on the React Flow canvas", async () => {
    renderRoutes("/workflows/create");
    fireEvent.change(screen.getByLabelText("Workflow Name"), {
      target: { value: "Lead qualification chatbot" },
    });
    fireEvent.click(
      screen.getByTestId("workflow-entry-card").querySelector("button")!,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Contact created/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Ask a question/ }));
    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-testid^="workflow-decision-"]'),
      ).toHaveLength(1),
    );
    fireEvent.click(
      document.querySelector('[data-testid^="workflow-decision-"] button')!,
    );
    fireEvent.change(await screen.findByLabelText("Workflow question"), {
      target: { value: "What is your name?" },
    });
    fireEvent.change(screen.getByLabelText("Question response type"), {
      target: { value: "TEXT" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: /Ask a question/ }));
    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-testid^="workflow-decision-"]'),
      ).toHaveLength(2),
    );
    const questions = document.querySelectorAll(
      '[data-testid^="workflow-decision-"]',
    );
    fireEvent.click(questions[1]!.querySelector("button")!);
    fireEvent.change(await screen.findByLabelText("Workflow question"), {
      target: { value: "What is your email address?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Workflow published."),
    );
    const createCall = vi
      .mocked(apiRequest)
      .mock.calls.find(
        ([, options]) =>
          options?.method === "POST" &&
          !String(options.body).includes("activate"),
      );
    const body = JSON.parse(String(createCall?.[1]?.body));
    expect(
      body.steps.filter(
        (step: { type: string }) => step.type === "ASK_QUESTION",
      ),
    ).toHaveLength(2);
    expect(
      body.steps.every(
        (step: { position?: { x?: number; y?: number } }) =>
          typeof step.position?.x === "number" &&
          typeof step.position?.y === "number",
      ),
    ).toBe(true);
    expect(body.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: body.steps[0].id,
          target: body.steps[1].id,
          condition: "NEXT",
        }),
      ]),
    );
  }, 15_000);

  it("supports contact-field conditions with true and false paths", async () => {
    renderRoutes("/workflows/create");
    fireEvent.change(screen.getByLabelText("Workflow Name"), {
      target: { value: "High value lead routing" },
    });
    fireEvent.click(
      screen.getByTestId("workflow-entry-card").querySelector("button")!,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Contact created/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Set a condition/ }));
    await waitFor(() =>
      expect(
        document.querySelector('[data-testid^="workflow-decision-"]'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("workflow-true-branch")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-false-branch")).toBeInTheDocument();
    fireEvent.click(
      document.querySelector('[data-testid^="workflow-decision-"] button')!,
    );
    fireEvent.change(await screen.findByLabelText("Decision field"), {
      target: { value: "contact.custom.lead_score" },
    });
    fireEvent.change(screen.getByLabelText("Decision value"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: /Send a message With no response required/,
      }),
    );
    await waitFor(() =>
      expect(
        document.querySelector('[data-testid^="workflow-action-"]'),
      ).toBeInTheDocument(),
    );
    fireEvent.click(
      document.querySelector('[data-testid^="workflow-action-"] button')!,
    );
    fireEvent.change(await screen.findByLabelText("Message"), {
      target: { value: "Priority support" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Workflow published."),
    );
  }, 10_000);
});
