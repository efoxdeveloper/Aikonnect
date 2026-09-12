import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  contact: { id: "contact-1", name: "Aarav Sharma", profileName: "Aarav", profileImageUrl: "https://cdn.example.com/aarav.jpg" },
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
      if (String(path).includes("/messages") && options.method === "POST") {
        const body = typeof options.body === "string" ? JSON.parse(options.body) as { type?: string; text?: string | null; mediaData?: string } : {};
        return { message: { id: "message-2", metaMessageId: "wamid-message-2", direction: "OUTGOING", type: body.type ?? "TEXT", status: "SENT", text: body.text ?? "Here is the pricing.", mediaId: body.mediaData ? "media-1" : null, mediaUrl: body.mediaData ?? null, sentAt: "2026-08-27T06:01:00.000Z" } } as never;
      }
      if (String(path).includes("/messages")) return { items: [{ id: "message-1", direction: "INCOMING", type: "TEXT", status: "READ", text: "Can you share the pricing?", sentAt: "2026-08-27T06:00:00.000Z" }], pagination: {} } as never;
      if (String(path).endsWith("/read")) return { readAt: "2026-08-27T06:02:00.000Z" } as never;
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

  it("renders the WhatsApp-style chat shell and conversation controls", async () => {
    renderPage();
    await screen.findByText("Can you share the pricing?");
    expect(screen.getByTestId("inbox-shell")).toHaveClass("grid", "min-h-0", "overflow-hidden");
    expect(screen.getByPlaceholderText("Search or start new chat")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "Aarav Sharma profile" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Start video call" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start phone call" })).toBeInTheDocument();
    expect(screen.getByTestId("inbox-message-region")).toHaveClass("overflow-y-auto");
    expect(screen.getByTestId("inbox-message-region")).toHaveStyle({ backgroundColor: "#efeae2" });
    await waitFor(() => expect(within(screen.getByTestId("inbox-message-region")).getByText("Can you share the pricing?")).toHaveClass("break-words", "[overflow-wrap:anywhere]"));
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveAttribute("placeholder", "Type a message");
  });

  it("opens a conversation at the latest message", async () => {
    renderPage();
    const region = await screen.findByTestId("inbox-message-region");
    Object.defineProperty(region, "scrollHeight", { configurable: true, value: 1600 });
    Object.defineProperty(region, "clientHeight", { configurable: true, value: 600 });
    await screen.findByText("Can you share the pricing?");
    await waitFor(() => expect(region.scrollTop).toBe(1600));
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

  it("sends with Enter and keeps a newline with Shift+Enter", async () => {
    renderPage();
    await screen.findByText("Can you share the pricing?");
    const composer = screen.getByRole("textbox", { name: "Message" });
    fireEvent.change(composer, { target: { value: "First line" } });
    fireEvent.keyDown(composer, { key: "Enter", code: "Enter", shiftKey: true });
    expect(composer).toHaveValue("First line");
    fireEvent.change(composer, { target: { value: "First line\nSecond line" } });
    fireEvent.keyDown(composer, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/contacts/contact-1/conversations/conversation-1/messages",
      expect.objectContaining({ method: "POST", body: expect.stringContaining("First line\\nSecond line") }),
    ));
  });

  it("previews and sends an image attachment with an optional caption", async () => {
    renderPage();
    await screen.findByText("Can you share the pricing?");
    const image = new File(["fake-image"], "pricing.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Choose media"), { target: { files: [image] } });
    expect(await screen.findByAltText("Attachment preview")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "Pricing image" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/contacts/contact-1/conversations/conversation-1/messages",
      expect.objectContaining({ method: "POST", body: expect.stringContaining('"type":"IMAGE"') }),
    ));
    expect(await screen.findByAltText("Attached image")).toBeInTheDocument();
    expect(screen.getByText("Pricing image")).toBeInTheDocument();
  });

  it("rejects unsupported media and files larger than the attachment limit", async () => {
    renderPage();
    await screen.findByText("Can you share the pricing?");
    const input = screen.getByLabelText("Choose media");
    fireEvent.change(input, { target: { files: [new File(["archive"], "archive.zip", { type: "application/zip" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose an image, video, audio");
    const oversized = new File([new Uint8Array(6_000_001)], "large.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [oversized] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Media files must be 6 MB or smaller");
  });

  it("renders an incoming image media URL in the message thread", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path, options = {}) => {
      if (String(path).includes("/messages") && options.method === "POST") return { message: {} } as never;
      if (String(path).includes("/messages")) return { items: [{ id: "message-image", direction: "INCOMING", type: "IMAGE", status: "READ", text: null, mediaId: "media-1", mediaUrl: "data:image/png;base64,ZmFrZQ==", sentAt: "2026-08-27T06:00:00.000Z" }], pagination: {} } as never;
      return { items: [conversation], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } } as never;
    });
    renderPage();
    expect(await screen.findByAltText("Attached image")).toHaveAttribute("src", "data:image/png;base64,ZmFrZQ==");
  });

  it("shows WhatsApp message ticks as delivery status changes", async () => {
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
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "Here is the pricing." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByLabelText("Message sent")).toBeInTheDocument());
    const socket = FakeWebSocket.instances[0];
    act(() => socket.onmessage?.({ data: JSON.stringify({ type: "inbox.message_status", workspaceId: "workspace-1", conversationId: "conversation-1", messageId: "wamid-message-2", status: "DELIVERED" }) }));
    expect(await screen.findByLabelText("Message delivered")).toBeInTheDocument();
    act(() => socket.onmessage?.({ data: JSON.stringify({ type: "inbox.message_status", workspaceId: "workspace-1", conversationId: "conversation-1", messageId: "wamid-message-2", status: "READ" }) }));
    expect(await screen.findByLabelText("Message read")).toBeInTheDocument();
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

  it("marks an opened unread conversation as read", async () => {
    renderPage();
    await screen.findByText("Can you share the pricing?");
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/contacts/contact-1/conversations/conversation-1/read",
      { method: "POST", headers: { authorization: "Bearer access-token" } },
    ));
    expect(screen.getByRole("button", { name: /Aarav Sharma/ })).not.toHaveTextContent("1 unread");
  });

  it("does not reload the selected thread when the inbox list refreshes", async () => {
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
    const messageCallsBeforeRefresh = vi.mocked(apiRequest).mock.calls.filter(([path, options]) => String(path).includes("/messages") && options?.method !== "POST").length;
    const socket = FakeWebSocket.instances[0];
    act(() => socket.onmessage?.({ data: JSON.stringify({ type: "inbox.refresh", workspaceId: "workspace-1" }) }));
    await waitFor(() => expect(vi.mocked(apiRequest).mock.calls.filter(([path, options]) => String(path).includes("/messages") && options?.method !== "POST").length).toBe(messageCallsBeforeRefresh));
    expect(screen.getAllByText("Can you share the pricing?").length).toBeGreaterThan(0);
  });

  it("keeps the realtime connection when switching to Active chats", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Active chats" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/conversations?page=1&pageSize=100&search=&status=OPEN",
      { headers: { authorization: "Bearer access-token" } },
    ));
    expect(FakeWebSocket.instances).toHaveLength(1);
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
