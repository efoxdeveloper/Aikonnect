import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { ApiWebhooks } from "@/pages/ApiWebhooks";

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  apiRequest: vi.fn(),
}));

const key = {
  id: "key-1",
  name: "Shopify integration",
  keyPrefix: "sk_live_abc123…",
  scopes: ["contacts.read", "messages.send"],
  lastUsedAt: "2026-09-10T00:00:00.000Z",
  expiresAt: null,
  revokedAt: null,
  createdAt: "2026-09-01T00:00:00.000Z",
};

function auth(
  permissions = ["workspace.read", "workspace.update"],
): AuthContextValue {
  return {
    status: "authenticated",
    user: {
      id: "owner-1",
      email: "owner@example.com",
      firstName: "Workspace",
      lastName: "Owner",
      emailVerifiedAt: "2026-09-01T00:00:00.000Z",
      memberships: [
        {
          id: "membership-1",
          workspace: {
            id: "workspace-1",
            name: "Acme",
            slug: "acme",
            country: "India",
            timezone: "Asia/Kolkata",
            onboardingCompletedAt: "2026-09-01T00:00:00.000Z",
          },
          role: { id: "role-1", name: "Owner", slug: "owner", permissions },
        },
      ],
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

function renderPage(value = auth()) {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter>
        <ApiWebhooks />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("ApiWebhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiRequest).mockImplementation(async (path) =>
      String(path).includes("/webhooks")
        ? ({ items: [] } as never)
        : ({ items: [key] } as never),
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it("shows API keys, authentication instructions, and webhook security guidance", async () => {
    renderPage();
    expect(screen.getByTestId("api-webhooks-page")).toHaveClass(
      "overflow-hidden",
    );
    expect(await screen.findByText("Shopify integration")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "API Keys" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("button", { name: /generate api key/i }),
    ).toBeDisabled();
    expect(screen.queryByTestId("api-docs-section")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "API Docs" }));
    expect(screen.getByTestId("api-docs-section")).toHaveTextContent(
      "Authorization: Bearer sk_live_...",
    );
    expect(screen.getByTestId("api-endpoint-docs")).toBeInTheDocument();
    expect(screen.getByTestId("api-doc-contacts")).toHaveTextContent(
      "contacts.write",
    );
    expect(screen.getByTestId("api-doc-events")).toHaveTextContent(
      "Idempotency-Key",
    );
    expect(screen.getByTestId("api-doc-template-messages")).toHaveTextContent(
      "approved WhatsApp template",
    );
    expect(screen.getByTestId("api-doc-conversations")).toHaveTextContent(
      "conversations.read",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Webhooks" }));
    expect(screen.getByTestId("webhooks-section")).toHaveTextContent(
      "verify the HMAC signature",
    );
  });

  it("creates a key and displays its secret only in the creation result", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path, options = {}) => {
      if (String(path).includes("/webhooks")) return { items: [] } as never;
      if (options.method === "POST")
        return { apiKey: key, secret: "sk_live_new-secret" } as never;
      return { items: [] } as never;
    });
    renderPage();
    fireEvent.change(screen.getByLabelText("Key name"), {
      target: { value: "Backend sync" },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate api key/i }));
    expect(
      await screen.findByDisplayValue("sk_live_new-secret"),
    ).toBeInTheDocument();
    expect(screen.getByText(/will not be shown again/i)).toBeInTheDocument();
    expect(apiRequest).toHaveBeenLastCalledWith(
      "/workspaces/workspace-1/api-keys",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Backend sync" }),
      }),
    );
  });

  it("revokes an active key after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(apiRequest).mockImplementation(async (path, options = {}) => {
      if (String(path).includes("/webhooks")) return { items: [] } as never;
      if (options.method === "DELETE") return undefined as never;
      return { items: [key] } as never;
    });
    renderPage();
    await screen.findByText("Shopify integration");
    fireEvent.click(screen.getByRole("button", { name: /revoke/i }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenLastCalledWith(
        "/workspaces/workspace-1/api-keys/key-1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(await screen.findByText("Revoked")).toBeInTheDocument();
  });

  it("creates an HTTPS webhook and displays its signing secret once", async () => {
    const webhook = {
      id: "webhook-1",
      name: "Production app",
      url: "https://example.com/webhooks",
      events: ["message.received"],
      active: true,
      lastDeliveredAt: null,
      createdAt: "2026-09-01T00:00:00.000Z",
    };
    vi.mocked(apiRequest).mockImplementation(async (path, options = {}) => {
      if (String(path).includes("/webhooks") && options.method === "POST")
        return { webhook, secret: "whsec_new-secret" } as never;
      if (String(path).includes("/webhooks")) return { items: [] } as never;
      return { items: [] } as never;
    });
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Webhooks" }));
    fireEvent.change(screen.getByLabelText("Endpoint name"), {
      target: { value: "Production app" },
    });
    fireEvent.change(screen.getByLabelText("HTTPS endpoint URL"), {
      target: { value: "https://example.com/webhooks" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add endpoint" }));
    expect(
      await screen.findByDisplayValue("whsec_new-secret"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("https://example.com/webhooks"),
    ).toBeInTheDocument();
  });

  it("keeps key management disabled for users without workspace update permission", async () => {
    renderPage(auth(["workspace.read"]));
    expect(
      await screen.findByText(/only workspace administrators/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /generate api key/i }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: /revoke/i })).toBeDisabled();
  });
});
