import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest, downloadApiFile } from "@/lib/api";
import { Inbox } from "@/pages/Inbox";

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  apiRequest: vi.fn(),
  downloadApiFile: vi.fn(),
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
const manageAuth: AuthContextValue = {
  ...auth,
  user: auth.user && {
    ...auth.user,
    memberships: [{ ...auth.user.memberships[0], role: { ...auth.user.memberships[0].role, permissions: [...inboxPermission, "conversations.manage"] } }],
  },
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

const olderConversation = {
  ...conversation,
  id: "conversation-older",
  contactId: "contact-older",
  lastMessagePreview: "An older conversation",
  lastMessageAt: "2026-08-26T06:00:00.000Z",
  contact: { id: "contact-older", name: "Older Customer", profileName: "Older", profileImageUrl: null },
};

function renderPage(value = auth) {
  return render(<AuthContext.Provider value={value}><MemoryRouter><Inbox /></MemoryRouter></AuthContext.Provider>);
}

describe("Inbox", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiRequest).mockImplementation(async (path, options = {}) => {
      if (String(path).includes("/messages") && options.method === "DELETE") return undefined as never;
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
    expect(screen.getByRole("button", { name: "Conversation list options" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Conversation list options" }));
    expect(screen.getByRole("button", { name: "Channels" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "More filters" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "All chats" })).toHaveClass("bg-[var(--brand-soft)]");
    expect(screen.getByRole("button", { name: "Assigned to me" })).not.toHaveClass("bg-[var(--brand-soft)]");
    expect(screen.getByRole("button", { name: "Unassigned" })).not.toHaveClass("bg-[var(--brand-soft)]");
    fireEvent.click(screen.getByRole("button", { name: "Unassigned" }));
    fireEvent.click(screen.getByRole("button", { name: "Conversation list options" }));
    expect(screen.getByRole("button", { name: "Unassigned" })).toHaveClass("bg-[var(--brand-soft)]");
    expect(screen.getByRole("button", { name: "All chats" })).not.toHaveClass("bg-[var(--brand-soft)]");
    fireEvent.click(screen.getByRole("button", { name: "Channels" }));
    expect(screen.getByRole("button", { name: "All Channels" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Aarav Sharma/ })).toBeInTheDocument();
    expect(await screen.findByText("Can you share the pricing?")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/conversations?page=1&pageSize=25&search=",
      { headers: { authorization: "Bearer access-token" } },
    );
  });

  it("shows chat actions and persists pin, clear, and delete choices", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path, options = {}) => {
      if (String(path).endsWith("/pin")) return { isPinned: true } as never;
      if (String(path).endsWith("/clear")) return { clearedAt: "2026-08-27T06:05:00.000Z" } as never;
      if (String(path).includes("/conversations/conversation-1") && options.method === "DELETE") return undefined as never;
      if (String(path).includes("/messages")) return { items: [{ id: "message-1", direction: "INCOMING", type: "TEXT", status: "READ", text: "Can you share the pricing?", sentAt: "2026-08-27T06:00:00.000Z" }], pagination: {} } as never;
      return { items: [conversation], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } } as never;
    });
    renderPage(manageAuth);
    await screen.findByText("Can you share the pricing?");
    fireEvent.click(screen.getByRole("button", { name: "Open chat actions" }));
    expect(screen.getByRole("menuitem", { name: "Pin chat" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Clear chat" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete chat" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Pin chat" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/contacts/contact-1/conversations/conversation-1/pin",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ pinned: true }) }),
    ));
    expect(screen.getByTestId("pinned-chat-icon")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open chat actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear chat" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/contacts/contact-1/conversations/conversation-1/clear",
      expect.objectContaining({ method: "POST" }),
    ));
    fireEvent.click(screen.getByRole("button", { name: "Open chat actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete chat" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/contacts/contact-1/conversations/conversation-1",
      expect.objectContaining({ method: "DELETE" }),
    ));
    expect(screen.queryByRole("button", { name: /Aarav Sharma/ })).not.toBeInTheDocument();
  });

  it("renders the WhatsApp-style chat shell and conversation controls", async () => {
    renderPage();
    await screen.findByText("Can you share the pricing?");
    expect(screen.getByTestId("inbox-shell")).toHaveClass("grid", "min-h-0", "overflow-hidden");
    expect(screen.getByPlaceholderText("Search or start new chat")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "Aarav Sharma profile" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Start video call" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start phone call" })).not.toBeInTheDocument();
    expect(screen.getByTestId("inbox-message-region")).toHaveClass("overflow-y-auto");
    expect(screen.getByTestId("inbox-message-region")).toHaveStyle({ backgroundColor: "#efeae2" });
    await waitFor(() => expect(within(screen.getByTestId("inbox-message-region")).getByText("Can you share the pricing?")).toHaveClass("break-words", "[overflow-wrap:anywhere]"));
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveAttribute("placeholder", "Type a message");
  });

  it("labels the connected WhatsApp number as You in the chat list", async () => {
    const ownConversation = { ...conversation, contact: { ...conversation.contact, name: "My WhatsApp number", phoneE164: "+919876543210" }, phoneNumber: { displayPhoneNumber: "+91 9876543210" } };
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (String(path).includes("/messages")) return { items: [], pagination: {} } as never;
      return { items: [ownConversation], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } } as never;
    });
    renderPage();
    expect(await screen.findByText("+919876543210")).toBeInTheDocument();
    expect(screen.getByText("(You)")).toBeInTheDocument();
  });

  it("searches messages through the in-chat drawer", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path, options = {}) => {
      if (String(path).includes("search=pricing")) return { items: [{ id: "message-search", direction: "INCOMING", type: "TEXT", status: "READ", text: "Pricing details", sentAt: "2026-08-27T06:00:00.000Z" }], pagination: {} } as never;
      if (String(path).includes("/messages") && options.method === "POST") return { message: {} } as never;
      if (String(path).includes("/messages")) return { items: [{ id: "message-1", direction: "INCOMING", type: "TEXT", status: "READ", text: "Can you share the pricing?", sentAt: "2026-08-27T06:00:00.000Z" }], pagination: {} } as never;
      return { items: [conversation], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } } as never;
    });
    renderPage();
    await screen.findByText("Can you share the pricing?");
    fireEvent.click(screen.getByRole("button", { name: "Search in conversation" }));
    expect(screen.getByTestId("conversation-search-drawer")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search messages" }), { target: { value: "pricing" } });
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/contacts/contact-1/conversations/conversation-1/messages?page=1&pageSize=50&latest=true&search=pricing",
      { headers: { authorization: "Bearer access-token" } },
    ));
    expect(await screen.findByText("Pricing details")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close message search" }));
    expect(screen.queryByTestId("conversation-search-drawer")).not.toBeInTheDocument();
  });

  it("loads older conversations as the conversation list reaches the bottom", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path, options = {}) => {
      if (String(path).includes("/messages") && options.method === "POST") return { message: {} } as never;
      if (String(path).includes("/messages")) return { items: [], pagination: {} } as never;
      if (String(path).includes("page=2")) return { items: [olderConversation], pagination: { page: 2, pageSize: 25, total: 2, totalPages: 2, hasNext: false } } as never;
      return { items: [conversation], pagination: { page: 1, pageSize: 25, total: 2, totalPages: 2, hasNext: true } } as never;
    });
    renderPage();
    const list = await screen.findByTestId("inbox-conversation-list");
    await screen.findByRole("button", { name: /Aarav Sharma/ });
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 500 });
    Object.defineProperty(list, "scrollTop", { configurable: true, writable: true, value: 500 });
    fireEvent.scroll(list);
    expect(await screen.findByRole("button", { name: /Older Customer/ })).toBeInTheDocument();
    expect(screen.getByTestId("contact-avatar-fallback")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/conversations?page=2&pageSize=25&search=",
      { headers: { authorization: "Bearer access-token" } },
    );
  });

  it("loads older messages when scrolling to the top of a thread", async () => {
    const olderMessage = { id: "message-older", direction: "INCOMING", type: "TEXT", status: "READ", text: "An older message", sentAt: "2026-08-26T06:00:00.000Z" };
    vi.mocked(apiRequest).mockImplementation(async (path, options = {}) => {
      if (String(path).includes("/messages") && options.method === "POST") return { message: {} } as never;
      if (String(path).includes("/messages")) {
        return String(path).includes("page=2")
          ? { items: [olderMessage], pagination: { page: 2, pageSize: 50, total: 2, totalPages: 2, hasPrevious: false } }
          : { items: [{ id: "message-1", direction: "INCOMING", type: "TEXT", status: "READ", text: "Latest message", sentAt: "2026-08-27T06:00:00.000Z" }], pagination: { page: 1, pageSize: 50, total: 2, totalPages: 2, hasPrevious: true } };
      }
      return { items: [conversation], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1, hasNext: false } } as never;
    });
    renderPage();
    const region = await screen.findByTestId("inbox-message-region");
    await screen.findByText("Latest message");
    Object.defineProperty(region, "scrollTop", { configurable: true, writable: true, value: 0 });
    Object.defineProperty(region, "scrollHeight", { configurable: true, value: 1200 });
    fireEvent.scroll(region);
    expect(await screen.findByText("An older message")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/contacts/contact-1/conversations/conversation-1/messages?page=2&pageSize=50&latest=true",
      { headers: { authorization: "Bearer access-token" } },
    );
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

  it("opens WhatsApp-style message actions and performs reply, copy, forward, and delete", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path, options = {}) => {
      if (String(path).includes("/messages") && options.method === "DELETE") return undefined as never;
      if (String(path).includes("/messages") && options.method === "POST") return { message: { id: "forwarded-message", direction: "OUTGOING", type: "TEXT", status: "SENT", text: "Can you share the pricing?", sentAt: "2026-08-27T06:02:00.000Z" } } as never;
      if (String(path).includes("/messages")) return { items: [{ id: "message-1", direction: "INCOMING", type: "TEXT", status: "READ", text: "Can you share the pricing?", sentAt: "2026-08-27T06:00:00.000Z" }], pagination: {} } as never;
      if (String(path).endsWith("/read")) return { readAt: "2026-08-27T06:02:00.000Z" } as never;
      return { items: [conversation, olderConversation], pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 } } as never;
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage(manageAuth);
    const region = await screen.findByTestId("inbox-message-region");
    await screen.findByText("Can you share the pricing?");
    const trigger = await screen.findByRole("button", { name: /Message actions for Can you share/ });
    expect(trigger).toHaveClass("group-hover/message:opacity-100");

    fireEvent.click(trigger);
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "true"));
    expect(screen.getByRole("menu", { name: "Message actions" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Can you share the pricing?"));

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Reply" }));
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Can you share the pricing?");

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Forward" }));
    const dialog = await screen.findByRole("dialog", { name: "Forward message" });
    expect(dialog).not.toHaveTextContent("Can you share the pricing?");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Search users to forward to" }), { target: { value: "Older" } });
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/conversations/forward-targets?page=1&pageSize=25&search=Older",
      { headers: { authorization: "Bearer access-token" } },
    ));
    fireEvent.click(within(dialog).getByRole("button", { name: /Older Customer/ }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/contacts/contact-older/conversations/conversation-older/messages",
      expect.objectContaining({ method: "POST", body: expect.stringContaining("Can you share the pricing?") }),
    ));

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/contacts/contact-1/conversations/conversation-1/messages/message-1",
      expect.objectContaining({ method: "DELETE" }),
    ));
    await waitFor(() => expect(within(region).getByText("This message was deleted")).toBeInTheDocument());
  });

  it("downloads an attachment from the message action menu", async () => {
    vi.mocked(downloadApiFile).mockResolvedValue(new Blob(["image-data"], { type: "image/jpeg" }));
    vi.mocked(apiRequest).mockImplementation(async (path, options = {}) => {
      if (String(path).includes("/messages") && options.method === "POST") return { message: {} } as never;
      if (String(path).includes("/messages")) return { items: [{ id: "message-image", direction: "INCOMING", type: "IMAGE", status: "READ", text: null, mediaId: "media-1", mediaUrl: "data:image/png;base64,ZmFrZQ==", sentAt: "2026-08-27T06:00:00.000Z" }], pagination: {} } as never;
      if (String(path).endsWith("/read")) return { readAt: "2026-08-27T06:02:00.000Z" } as never;
      return { items: [conversation], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 } } as never;
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:attachment");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderPage();
    await screen.findByAltText("Attached image");
    fireEvent.click(screen.getByRole("button", { name: /Message actions for image/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Download" }));
    await waitFor(() => expect(downloadApiFile).toHaveBeenCalledWith(
      "/workspaces/workspace-1/contacts/contact-1/conversations/conversation-1/messages/message-image/media",
      "access-token",
    ));
    expect(click).toHaveBeenCalled();
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
    const image = await screen.findByAltText("Attached image");
    expect(image).toHaveAttribute("src", "data:image/png;base64,ZmFrZQ==");
    fireEvent.click(screen.getByRole("button", { name: "Open attached image" }));
    const preview = screen.getByRole("dialog", { name: "Image preview" });
    expect(preview).toBeInTheDocument();
    expect(preview.parentElement).toHaveClass("z-[1400]");
    expect(screen.getByAltText("Attached image preview")).toHaveAttribute("src", "data:image/png;base64,ZmFrZQ==");
    fireEvent.click(screen.getByRole("button", { name: "Close image preview" }));
    expect(screen.queryByRole("dialog", { name: "Image preview" })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Conversation list options" }));
    fireEvent.click(screen.getByRole("button", { name: "Active chats" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/conversations?page=1&pageSize=25&search=&status=OPEN",
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
