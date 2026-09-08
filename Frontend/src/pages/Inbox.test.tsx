import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { Inbox } from "@/pages/Inbox";

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  apiRequest: vi.fn(),
  getWebSocketUrl: vi.fn(() => "ws://localhost:5006/api/v1/ws/inbox"),
}));

const inboxPermission = ["inbox.read", "conversations.reply", "whatsapp.manage"];
const auth: AuthContextValue = {
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
      role: { id: "role-1", name: "Agent", slug: "agent", permissions: inboxPermission },
    }],
  },
  accessToken: "access-token",
  login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(),
  changeEmail: vi.fn(), refreshUser: vi.fn(), logout: vi.fn(),
};

const conversation = {
  id: "conversation-1",
  contactId: "contact-1",
  status: "OPEN",
  unreadCount: 1,
  lastMessagePreview: "Can you share the pricing?",
  lastMessageAt: "2026-08-27T06:00:00.000Z",
  contact: { id: "contact-1", name: "Aarav Sharma", profileName: "Aarav" },
};

function renderPage(value = auth) {
  return render(<AuthContext.Provider value={value}><MemoryRouter><Inbox /></MemoryRouter></AuthContext.Provider>);
}

describe("Inbox", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiRequest).mockImplementation(async (path, options = {}) => {
      if (String(path).includes("/messages") && options.method === "POST") return { message: { id: "message-2", direction: "OUTGOING", type: "TEXT", status: "SENT", text: "Here is the pricing.", sentAt: "2026-08-27T06:01:00.000Z" } } as never;
      if (String(path).includes("/messages")) return { items: [{ id: "message-1", direction: "INCOMING", type: "TEXT", status: "READ", text: "Can you share the pricing?", sentAt: "2026-08-27T06:00:00.000Z" }], pagination: {} } as never;
      return { items: [conversation], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } } as never;
    });
  });

  it("renders the shadcn mail-style panes and loads a workspace conversation", async () => {
    renderPage();
    expect(screen.getByTestId("inbox-page")).toHaveClass("h-full", "overflow-hidden");
    expect(screen.getByRole("heading", { name: "All chats" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Channels" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "More filters" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "All chats" })).toHaveClass("bg-[var(--brand-soft)]");
    expect(screen.getByRole("button", { name: "Assigned to me" })).not.toHaveClass("bg-[var(--brand-soft)]");
    expect(screen.getByRole("button", { name: "Unassigned" })).not.toHaveClass("bg-[var(--brand-soft)]");
    fireEvent.click(screen.getByRole("button", { name: "Unassigned" }));
    expect(screen.getByRole("button", { name: "Unassigned" })).toHaveClass("bg-[var(--brand-soft)]");
    expect(screen.getByRole("button", { name: "All chats" })).not.toHaveClass("bg-[var(--brand-soft)]");
    fireEvent.click(screen.getByRole("button", { name: "Channels" }));
    expect(screen.getByRole("button", { name: "All Channels" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Aarav Sharma/ })).toBeInTheDocument();
    expect(await screen.findByText("Can you share the pricing?")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/conversations?page=1&pageSize=100&search=",
      { headers: { authorization: "Bearer access-token" } },
    );
  });

  it("sends a reply through the selected workspace conversation", async () => {
    renderPage();
    await screen.findByText("Can you share the pricing?");
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "Here is the pricing." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByText("Here is the pricing.")).toBeInTheDocument());
    expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/contacts/contact-1/conversations/conversation-1/messages",
      expect.objectContaining({ method: "POST", body: expect.stringContaining("Here is the pricing.") }),
    );
  });

  it("requests a WhatsApp sync from the empty All chats state", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path, options = {}) => {
      if (String(path).includes("/whatsapp/sync")) return { syncRequestIds: ["sync-1"], syncWarnings: [] } as never;
      return { items: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 1 } } as never;
    });
    renderPage();
    const syncButton = await screen.findByRole("button", { name: "Sync now" });
    fireEvent.click(syncButton);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/whatsapp/sync",
      { method: "POST", headers: { authorization: "Bearer access-token" } },
    ));
    expect(syncButton).toBeEnabled();
  });

  it("shows Meta sync warnings after a rejected sync request", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (String(path).includes("/whatsapp/sync")) return { syncRequestIds: [], syncWarnings: ["Meta did not allow message history synchronization."] } as never;
      return { items: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 1 } } as never;
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Sync now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Meta did not allow message history synchronization.");
  });

  it("refreshes the inbox when a realtime event arrives", async () => {
    class FakeWebSocket {
      static instances: FakeWebSocket[] = [];
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public readonly url: string) { FakeWebSocket.instances.push(this); }
      close() { this.onclose?.(); }
    }
    vi.stubGlobal("WebSocket", FakeWebSocket);
    renderPage();
    await screen.findByText("Can you share the pricing?");
    const socket = FakeWebSocket.instances[0];
    expect(socket).toBeDefined();
    act(() => socket.onopen?.());
    expect(screen.getByTestId("inbox-connection-status")).toHaveTextContent("Live");
    const callsBeforeEvent = vi.mocked(apiRequest).mock.calls.length;
    act(() => socket.onmessage?.({ data: JSON.stringify({ type: "inbox.refresh", workspaceId: "workspace-1" }) }));
    await waitFor(() => expect(vi.mocked(apiRequest).mock.calls.length).toBeGreaterThan(callsBeforeEvent));
  });

  it("polls the inbox when realtime is unavailable", async () => {
    vi.stubGlobal("WebSocket", undefined);
    vi.useFakeTimers();
    renderPage();
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("inbox-connection-status")).toHaveTextContent("Polling");
    const callsBeforePoll = vi.mocked(apiRequest).mock.calls.length;
    act(() => vi.advanceTimersByTime(5_000));
    expect(vi.mocked(apiRequest).mock.calls.length).toBeGreaterThan(callsBeforePoll);
  });

  it("protects the inbox from roles without inbox permission", () => {
    renderPage({ ...auth, user: auth.user && { ...auth.user, memberships: [{ ...auth.user.memberships[0], role: { ...auth.user.memberships[0].role, permissions: [] } }] } });
    expect(screen.getByRole("heading", { name: "Inbox access is restricted" })).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
