import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  Archive,
  ArrowLeft,
  Ban,
  Check,
  CalendarClock,
  CheckCheck,
  ChevronDown,
  CircleAlert,
  Clock3,
  Download,
  Filter,
  FileText,
  ImagePlus,
  Inbox as InboxIcon,
  Mail,
  Mic,
  MessageCircle,
  MessageSquare,
  Megaphone,
  MoreVertical,
  Paperclip,
  PhoneCall,
  Phone,
  Search,
  Send,
  Smile,
  Star,
  Tag,
  RefreshCw,
  UserRound,
  UserX,
  Users,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, apiRequest, downloadApiFile, getWebSocketUrl } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";
import { cn } from "@/lib/utils";

type ConversationStatus = "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
type InboxFolder = ConversationStatus | "UNREAD" | undefined;
type ChatFilterKey = "All chats" | "Active chats" | "Assigned to me" | "Unassigned" | string;
type ChannelFilter = "all" | "whatsapp" | "instagram" | "messenger" | "whatsapp_calls";
type Conversation = {
  id: string;
  contactId: string;
  status: ConversationStatus;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  contact: { id: string; name: string; profileName: string | null; profileImageUrl?: string | null };
};
type Message = {
  id: string;
  metaMessageId?: string | null;
  direction: "INCOMING" | "OUTGOING";
  type: string;
  status: string;
  text: string | null;
  mediaId?: string | null;
  mediaUrl?: string | null;
  sentAt: string;
};
type PageResponse<T> = {
  items: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};
type SyncResponse = { syncRequestIds: string[]; syncWarnings: string[] };

const channels: Array<{ label: string; value: ChannelFilter; icon: LucideIcon }> = [
  { label: "All Channels", value: "all", icon: InboxIcon },
  { label: "WhatsApp", value: "whatsapp", icon: MessageCircle },
  { label: "Instagram", value: "instagram", icon: MessageSquare },
  { label: "Messenger", value: "messenger", icon: MessageSquare },
  { label: "WhatsApp Calls", value: "whatsapp_calls", icon: PhoneCall },
];
const chatFilters: Array<{ label: string; status: InboxFolder; icon: LucideIcon }> = [
  { label: "All chats", status: undefined, icon: InboxIcon },
  { label: "Active chats", status: "OPEN", icon: MessageCircle },
  { label: "Assigned to me", status: undefined, icon: UserRound },
  { label: "Unassigned", status: undefined, icon: UserX },
];
const advancedFilters: Array<{ label: string; status?: InboxFolder; icon: LucideIcon }> = [
  { label: "Less", icon: CircleAlert },
  { label: "Last 24 Hours", icon: CalendarClock },
  { label: "Favorite only", icon: Star },
  { label: "Open", status: "OPEN", icon: MessageCircle },
  { label: "Pending", status: "PENDING", icon: Clock3 },
  { label: "Solved", status: "RESOLVED", icon: CheckCheck },
  { label: "Expired", icon: Clock3 },
  { label: "Blocked Chats", icon: Ban },
  { label: "Broadcasts", icon: Megaphone },
  { label: "Unread", status: "UNREAD", icon: Mail },
  { label: "CTWA", icon: Tag },
  { label: "G-CTWA", icon: Tag },
  { label: "T-CTWA", icon: Tag },
];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

function ContactAvatar({ name, imageUrl, className, showStatus = false }: { name: string; imageUrl?: string | null; className?: string; showStatus?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(imageUrl && imageUrl !== failedUrl);
  return <div className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--brand-soft)] text-xs font-semibold text-[var(--brand)]", className)}>{showImage ? <img src={imageUrl ?? undefined} alt={`${name} profile`} className="size-full object-cover" onError={() => setFailedUrl(imageUrl ?? null)} /> : initials(name)}{showStatus && <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-white bg-[#28b779]" />}</div>;
}

function formatTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(date);
}

function friendlyError(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

const messageStatusRank: Record<string, number> = { SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };

function mergeMessages(persisted: Message[], current: Message[]) {
  const persistedIds = new Set(persisted.map((message) => message.id));
  const persistedMetaIds = new Set(persisted.map((message) => message.metaMessageId).filter(Boolean));
  const localByKey = new Map(current.filter((message) => message.direction === "OUTGOING").map((message) => [message.metaMessageId || message.id, message]));
  const merged = persisted.map((message) => {
    const local = localByKey.get(message.metaMessageId || message.id);
    return local && (messageStatusRank[local.status] ?? 0) > (messageStatusRank[message.status] ?? 0) ? { ...message, status: local.status } : message;
  });
  const localOutgoing = current.filter((message) => message.direction === "OUTGOING" && !persistedIds.has(message.id) && (!message.metaMessageId || !persistedMetaIds.has(message.metaMessageId)));
  return [...merged, ...localOutgoing].sort((left, right) => new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime());
}

function MessageTicks({ status }: { status: string }) {
  if (status === "FAILED") return <CircleAlert aria-label="Message failed" className="text-[#ffb4b4]" size={12} />;
  if (status === "DELIVERED" || status === "READ") {
    return <CheckCheck aria-label={status === "READ" ? "Message read" : "Message delivered"} className={status === "READ" ? "text-[#53bdeb]" : "text-white/70"} size={13} />;
  }
  return <Check aria-label="Message sent" className="text-white/70" size={12} />;
}

function MessageMedia({ message, accessToken, workspaceId, contactId, conversationId }: { message: Message; accessToken: string | null | undefined; workspaceId: string | undefined; contactId: string; conversationId: string }) {
  const [source, setSource] = useState(message.mediaUrl ?? null);
  useEffect(() => {
    if (!accessToken || !workspaceId || message.mediaUrl || !message.mediaId) return;
    let active = true;
    let objectUrl: string | undefined;
    void downloadApiFile(`/workspaces/${workspaceId}/contacts/${contactId}/conversations/${conversationId}/messages/${message.id}/media`, accessToken)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setSource(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accessToken, contactId, conversationId, message.id, message.mediaId, message.mediaUrl, workspaceId]);

  if (!source) return <div className="mb-1 flex h-24 w-40 items-center justify-center rounded-md bg-black/5 text-[10px] text-[var(--text-muted)]">Loading media…</div>;
  if (message.type === "IMAGE") return <img src={source} alt="Attached image" className="mb-1 max-h-72 max-w-full rounded-md object-cover" />;
  if (message.type === "VIDEO") return <video src={source} controls className="mb-1 max-h-72 max-w-full rounded-md" />;
  if (message.type === "AUDIO") return <audio src={source} controls className="mb-1 max-w-full" />;
  return <a href={source} download className="mb-1 flex items-center gap-2 rounded-md bg-black/5 px-3 py-2 text-xs underline-offset-2 hover:underline"><FileText size={18} /><span className="max-w-52 truncate">Download document</span><Download size={14} /></a>;
}

type SelectedAttachment = { dataUrl: string; fileName: string; mimeType: string; messageType: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" };

function attachmentType(file: File): SelectedAttachment["messageType"] | null {
  if (file.type.startsWith("image/")) return "IMAGE";
  if (file.type.startsWith("video/")) return "VIDEO";
  if (file.type.startsWith("audio/")) return "AUDIO";
  if (file.type === "application/pdf" || file.type.includes("document") || file.type.includes("spreadsheet") || file.type.includes("presentation") || file.name.match(/\.(pdf|docx?|xlsx?|pptx?|txt|csv)$/i)) return "DOCUMENT";
  return null;
}

export function Inbox() {
  const { accessToken, user } = useAuth();
  const workspaceId = getActiveMembership(user)?.workspace.id;
  const permissions = getActiveMembership(user)?.role.permissions ?? [];
  const canRead = permissions.includes("inbox.read");
  const canReply = permissions.includes("conversations.reply");
  const canSync = permissions.includes("whatsapp.manage");
  const [folder, setFolder] = useState<InboxFolder>(undefined);
  const [activeFilter, setActiveFilter] = useState<ChatFilterKey>("All chats");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<SelectedAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [messageError, setMessageError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  const selected = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );
  const selectedContactId = selected?.contactId;
  const selectedUnreadCount = selected?.unreadCount ?? 0;
  const selectedIdRef = useRef(selectedId);
  const messagesRef = useRef(messages);
  const messageRegionRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  useEffect(() => {
    selectedIdRef.current = selectedId;
    stickToBottomRef.current = true;
  }, [selectedId]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!selectedId || messagesLoading || !messages.length || !stickToBottomRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const region = messageRegionRef.current;
      if (region) region.scrollTop = region.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages.length, messagesLoading, selectedId]);

  const loadConversations = useCallback(async (showLoading = true) => {
    if (!workspaceId || !accessToken || !canRead) {
      setConversations([]);
      setSelectedId(null);
      setLoading(false);
      return;
    }
    if (showLoading) {
      setLoading(true);
      setError("");
    }
    const parameters = new URLSearchParams({ page: "1", pageSize: "100", search });
    if (channelFilter !== "all") parameters.set("channelKey", channelFilter);
    if (folder === "UNREAD") parameters.set("unreadOnly", "true");
    else if (folder) parameters.set("status", folder);
    try {
      const result = await apiRequest<PageResponse<Conversation>>(
        `/workspaces/${workspaceId}/conversations?${parameters.toString()}`,
        { headers: { authorization: `Bearer ${accessToken}` } },
      );
      setConversations(result.items);
      setSelectedId((current) =>
        result.items.some((item) => item.id === current) ? current : result.items[0]?.id ?? null,
      );
    } catch (caughtError) {
      setError(friendlyError(caughtError, "Unable to load your inbox."));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [accessToken, canRead, channelFilter, folder, search, workspaceId]);

  const loadConversationsRef = useRef(loadConversations);
  useEffect(() => {
    loadConversationsRef.current = loadConversations;
  }, [loadConversations]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId || !selectedContactId || !workspaceId || !accessToken) {
      setMessages([]);
      return;
    }
    let active = true;
    setMessages([]);
    setMessagesLoading(true);
    setMessageError("");
    void apiRequest<PageResponse<Message>>(
      `/workspaces/${workspaceId}/contacts/${selectedContactId}/conversations/${selectedId}/messages?page=1&pageSize=100`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    )
      .then((result) => {
        if (!active) return;
        setMessages((current) => mergeMessages(result.items, current));
        if (selectedUnreadCount > 0) {
          void apiRequest<{ readAt: string }>(
            `/workspaces/${workspaceId}/contacts/${selectedContactId}/conversations/${selectedId}/read`,
            { method: "POST", headers: { authorization: `Bearer ${accessToken}` } },
          )
            .then(() => {
              if (active) setConversations((current) => current.map((conversation) => conversation.id === selectedId ? { ...conversation, unreadCount: 0 } : conversation));
            })
            .catch((caughtError) => {
              if (active) setMessageError(friendlyError(caughtError, "Unable to mark this conversation as read."));
            });
        }
      })
      .catch((caughtError) => {
        if (active) setMessageError(friendlyError(caughtError, "Unable to load this conversation."));
      })
      .finally(() => {
        if (active) setMessagesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, selectedContactId, selectedId, workspaceId]);

  useEffect(() => {
    if (!selectedId || !selectedContactId || !workspaceId || !accessToken) return;
    const interval = window.setInterval(() => {
      const hasPendingStatus = messagesRef.current.some((message) => message.direction === "OUTGOING" && message.metaMessageId && (message.status === "SENT" || message.status === "DELIVERED"));
      if (!hasPendingStatus) return;
      void apiRequest<PageResponse<Message>>(
        `/workspaces/${workspaceId}/contacts/${selectedContactId}/conversations/${selectedId}/messages?page=1&pageSize=100`,
        { headers: { authorization: `Bearer ${accessToken}` } },
      ).then((result) => setMessages((current) => mergeMessages(result.items, current))).catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(interval);
  }, [accessToken, selectedContactId, selectedId, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !accessToken || !canRead || typeof WebSocket === "undefined") return;
    let stopped = false;
    let retryTimer: number | undefined;
    let socket: WebSocket | null = null;

    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(getWebSocketUrl("/ws/inbox", accessToken, { workspaceId }));
      socket.onopen = () => {
        if (!stopped) setRealtimeConnected(true);
      };
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as { type?: string; workspaceId?: string; conversationId?: string; messageId?: string; status?: Message["status"] };
          if (payload.type === "inbox.refresh" && payload.workspaceId === workspaceId) void loadConversationsRef.current(false);
          if (payload.type === "inbox.message_status" && payload.workspaceId === workspaceId && payload.conversationId === selectedIdRef.current && payload.messageId && payload.status) {
            setMessages((current) => current.map((message) => message.metaMessageId === payload.messageId || message.id === payload.messageId ? { ...message, status: payload.status ?? message.status } : message));
          }
        } catch {
          // Ignore malformed realtime payloads; polling remains the fallback.
        }
      };
      socket.onclose = () => {
        if (stopped) return;
        setRealtimeConnected(false);
        retryTimer = window.setTimeout(connect, 3_000);
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      stopped = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      socket?.close();
      setRealtimeConnected(false);
    };
  }, [accessToken, canRead, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !accessToken || !canRead) return;
    const interval = window.setInterval(() => void loadConversationsRef.current(false), realtimeConnected ? 30_000 : 5_000);
    return () => window.clearInterval(interval);
  }, [accessToken, canRead, realtimeConnected, workspaceId]);

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if ((!draft.trim() && !attachment) || !selected || !workspaceId || !accessToken || !canReply) return;
    const text = draft.trim();
    const currentAttachment = attachment;
    const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticMessage: Message = { id: pendingId, metaMessageId: null, direction: "OUTGOING", type: currentAttachment?.messageType ?? "TEXT", status: "SENT", text: text || null, mediaUrl: currentAttachment?.dataUrl ?? null, sentAt: new Date().toISOString() };
    stickToBottomRef.current = true;
    setMessages((current) => [...current, optimisticMessage]);
    setDraft("");
    setAttachment(null);
    setSending(true);
    setMessageError("");
    try {
      const result = await apiRequest<{ message: Message }>(
        `/workspaces/${workspaceId}/contacts/${selected.contactId}/conversations/${selected.id}/messages`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ direction: "OUTGOING", type: currentAttachment?.messageType ?? "TEXT", status: "SENT", text: text || null, ...(currentAttachment ? { mediaData: currentAttachment.dataUrl, mediaFileName: currentAttachment.fileName } : {}) }),
        },
      );
      setMessages((current) => current.map((message) => message.id === pendingId ? { ...result.message, mediaUrl: result.message.mediaUrl ?? currentAttachment?.dataUrl ?? null } : message));
      void loadConversations(false);
    } catch (caughtError) {
      setMessages((current) => current.map((message) => message.id === pendingId ? { ...message, status: "FAILED" } : message));
      setMessageError(friendlyError(caughtError, "Your message could not be sent."));
    } finally {
      setSending(false);
    }
  };

  const chooseAttachment = () => fileInputRef.current?.click();

  const handleAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const messageType = attachmentType(file);
    if (!messageType) {
      setMessageError("Choose an image, video, audio, PDF, document, spreadsheet, presentation, text, or CSV file.");
      return;
    }
    if (file.size > 6_000_000) {
      setMessageError("Media files must be 6 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setMessageError("");
        setAttachment({ dataUrl: reader.result, fileName: file.name, mimeType: file.type || "application/octet-stream", messageType });
      }
    };
    reader.onerror = () => setMessageError("The selected media could not be read.");
    reader.readAsDataURL(file);
  };

  const handleMessageKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const syncNow = async () => {
    if (!workspaceId || !accessToken || !canSync || syncing) return;
    setSyncing(true);
    setError("");
    try {
      const result = await apiRequest<SyncResponse>(`/workspaces/${workspaceId}/whatsapp/sync`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      await loadConversations();
      if (result.syncWarnings.length) setError(result.syncWarnings.join(" "));
    } catch (caughtError) {
      setError(friendlyError(caughtError, "Unable to sync WhatsApp conversations."));
    } finally {
      setSyncing(false);
    }
  };

  if (!canRead) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--page-background)] p-6">
        <section className="max-w-md rounded-xl border border-[var(--border)] bg-white p-8 text-center">
          <InboxIcon className="mx-auto text-[var(--brand)]" size={28} />
          <h1 className="mt-4 text-lg font-semibold">Inbox access is restricted</h1>
          <div className="mt-2 text-sm text-[var(--text-secondary)]">You do not have permission to view conversations in this workspace.</div>
        </section>
      </div>
    );
  }

  return (
    <div data-testid="inbox-page" className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--page-background)]">
      <main className="min-h-0 flex-1 overflow-hidden p-0 lg:p-3">
        <section data-testid="inbox-shell" className="grid h-full min-h-0 grid-cols-1 overflow-hidden bg-white lg:grid-cols-[minmax(340px,410px)_minmax(0,1fr)] lg:rounded-lg lg:border lg:border-[var(--border)] lg:shadow-[0_2px_10px_rgba(30,40,55,.04)]">
          <section className={cn("flex min-h-0 flex-col border-r border-[var(--border)] bg-white", selected && "hidden lg:flex")} aria-label="Conversation list">
            <header className="flex flex-none items-center justify-between border-b border-[var(--border-soft)] bg-[var(--surface-subtle)] px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-semibold text-white">{initials(getActiveMembership(user)?.workspace.name ?? "Inbox")}</div>
                <div className="min-w-0"><h2 className="truncate text-[15px] font-semibold text-[var(--text-primary)]">{activeFilter}</h2><div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--text-muted)]"><span>{loading ? "Loading..." : `${conversations.length} chats`}</span><span data-testid="inbox-connection-status" className={cn("inline-flex items-center gap-1", realtimeConnected ? "text-[#16845f]" : "text-[var(--text-muted)]")}><span className={cn("size-1.5 rounded-full", realtimeConnected ? "bg-[#16845f]" : "bg-[#a7adb4]")} />{realtimeConnected ? "Live" : "Polling"}</span></div></div>
              </div>
              <div className="flex items-center gap-1"><button type="button" aria-label="Refresh conversations" onClick={() => void loadConversations()} className="flex size-8 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><RefreshCw size={16} /></button><button type="button" aria-label="Conversation list options" className="flex size-8 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><MoreVertical size={17} /></button></div>
            </header>

            <div className="flex-none border-b border-[var(--border-soft)] bg-white p-3">
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 text-[var(--text-muted)]" size={15} /><input aria-label="Search conversations" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search or start new chat" className="h-9 w-full rounded-md border border-transparent bg-[var(--surface-subtle)] pl-9 pr-3 text-xs text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--brand-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--brand-accent)]/10" /><button type="button" aria-label="Open filters" className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><Filter size={14} /></button></div>
              <nav aria-label="Inbox filters" className="scrollbar-subtle mt-3 flex gap-1 overflow-x-auto pb-0.5">
                {chatFilters.map(({ label, status, icon: Icon }) => <button key={label} type="button" onClick={() => { setFolder(status); setActiveFilter(label); }} className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium transition-colors", activeFilter === label ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:bg-[var(--brand-subtle)] hover:text-[var(--brand)]")}><Icon size={13} />{label}{label === "All chats" && conversations.length > 0 && <span className="text-[10px] opacity-70">{conversations.length}</span>}</button>)}
              </nav>
              <div className="mt-2 flex items-center gap-2"><button type="button" aria-expanded={channelsOpen} onClick={() => setChannelsOpen((current) => !current)} className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--border)] px-2.5 text-[10px] font-medium text-[var(--text-secondary)] hover:border-[var(--brand)]/40 hover:text-[var(--brand)]">Channels<ChevronDown className={cn("transition-transform", channelsOpen && "rotate-180")} size={12} /></button><button type="button" aria-expanded={moreFiltersOpen} onClick={() => setMoreFiltersOpen((current) => !current)} className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--border)] px-2.5 text-[10px] font-medium text-[var(--text-secondary)] hover:border-[var(--brand)]/40 hover:text-[var(--brand)]">More filters<ChevronDown className={cn("transition-transform", moreFiltersOpen && "rotate-180")} size={12} /></button>{channelFilter !== "all" && <span className="text-[10px] text-[var(--brand)]">{channels.find((channel) => channel.value === channelFilter)?.label}</span>}</div>
              {channelsOpen && <div className="mt-2 grid grid-cols-2 gap-1 rounded-md border border-[var(--border-soft)] bg-[var(--surface-subtle)] p-1.5">{channels.map(({ label, value, icon: Icon }) => <button key={value} type="button" onClick={() => setChannelFilter(value)} className={cn("flex h-8 items-center gap-1.5 rounded px-2 text-left text-[10px] font-medium", channelFilter === value ? "bg-white text-[var(--brand)] shadow-sm" : "text-[var(--text-secondary)] hover:bg-white")}><Icon size={13} />{label}</button>)}</div>}
              {moreFiltersOpen && <div className="mt-2 grid grid-cols-2 gap-1 rounded-md border border-[var(--border-soft)] bg-[var(--surface-subtle)] p-1.5">{advancedFilters.filter(({ label }) => label !== "Less").map(({ label, status, icon: Icon }) => <button key={label} type="button" onClick={() => { if (status !== undefined) { setFolder(status); setActiveFilter(label); } }} className={cn("flex h-8 items-center gap-1.5 rounded px-2 text-left text-[10px] font-medium", activeFilter === label ? "bg-white text-[var(--brand)] shadow-sm" : "text-[var(--text-secondary)] hover:bg-white")}><Icon size={13} />{label}</button>)}</div>}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {error && <div role="alert" className="m-3 rounded-md border border-[#f5dada] bg-[var(--danger-soft)] p-3 text-xs text-[var(--danger)]">{error}</div>}
              {loading ? <div className="p-8 text-center text-xs text-[var(--text-secondary)]">Loading conversations...</div> : conversations.length === 0 ? <div className="p-8 text-center"><Users className="mx-auto text-[var(--text-muted)]" size={28} /><div className="mt-3 text-sm font-medium">No conversations yet</div><div className="mt-1 text-xs text-[var(--text-secondary)]">Your WhatsApp conversations will appear here.</div>{activeFilter === "All chats" && canSync && <button type="button" onClick={() => void syncNow()} disabled={syncing} className="mx-auto mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--brand)] px-3 text-xs font-semibold text-white hover:bg-[var(--brand-hover)] disabled:cursor-wait disabled:opacity-60"><RefreshCw size={14} className={syncing ? "animate-spin" : undefined} />{syncing ? "Syncing..." : "Sync now"}</button>}</div> : conversations.map((conversation) => <button key={conversation.id} type="button" onClick={() => setSelectedId(conversation.id)} className={cn("relative flex w-full items-center gap-3 border-b border-[var(--border-soft)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-subtle)]", selectedId === conversation.id && "bg-[var(--brand-soft)]/55 before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1 before:bg-[var(--brand)]")}><ContactAvatar name={conversation.contact.name} imageUrl={conversation.contact.profileImageUrl} className="size-11" showStatus={conversation.status === "OPEN"} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className={cn("truncate text-[13px]", conversation.unreadCount ? "font-semibold text-[var(--text-primary)]" : "font-medium text-[var(--text-primary)]")}>{conversation.contact.name}</span><span className={cn("shrink-0 text-[10px]", conversation.unreadCount ? "font-medium text-[var(--brand)]" : "text-[var(--text-muted)]")}>{formatTime(conversation.lastMessageAt)}</span></div><div className="mt-1 flex items-center gap-1.5"><span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-secondary)]">{conversation.lastMessagePreview || "No messages yet"}</span>{conversation.unreadCount > 0 && <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-[9px] font-semibold text-white">{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</span>}</div></div></button>)}
            </div>
            <footer className="flex flex-none items-center justify-between border-t border-[var(--border-soft)] bg-[var(--surface-subtle)] px-4 py-2 text-[10px] text-[var(--text-muted)]"><span>{conversations.length} chats</span><span>{conversations.filter((item) => item.unreadCount > 0).length} unread</span></footer>
          </section>

          <section className={cn("min-h-0 flex-col bg-[var(--page-background)]", selected ? "flex" : "hidden lg:flex")} aria-label="Conversation thread">
            {selected ? <>
              <header className="flex flex-none items-center justify-between border-b border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-2.5 sm:px-5"><div className="flex min-w-0 items-center gap-3"><button type="button" aria-label="Back to conversations" onClick={() => setSelectedId(null)} className="flex size-8 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] lg:hidden"><ArrowLeft size={18} /></button><ContactAvatar name={selected.contact.name} imageUrl={selected.contact.profileImageUrl} className="size-10" showStatus={selected.status === "OPEN"} /><div className="min-w-0"><h2 className="truncate text-[15px] font-semibold text-[var(--text-primary)]">{selected.contact.name}</h2><div className="truncate text-[11px] text-[var(--text-secondary)]">{selected.contact.profileName || "WhatsApp contact"} · {selected.status === "OPEN" ? "active now" : selected.status.toLowerCase()}</div></div></div><div className="flex items-center gap-0.5"><button type="button" aria-label="Search in conversation" className="hidden size-8 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] sm:flex"><Search size={16} /></button><button type="button" aria-label="Start video call" className="hidden size-8 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] sm:flex"><Video size={17} /></button><button type="button" aria-label="Start phone call" className="hidden size-8 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] sm:flex"><Phone size={16} /></button><button type="button" aria-label="Archive conversation" className="flex size-8 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><Archive size={16} /></button><button type="button" aria-label="More conversation actions" className="flex size-8 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><MoreVertical size={17} /></button></div></header>
              <div data-testid="inbox-message-region" ref={messageRegionRef} onScroll={(event) => { const region = event.currentTarget; stickToBottomRef.current = region.scrollHeight - region.scrollTop - region.clientHeight < 120; }} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8" style={{ backgroundColor: "#efeae2", backgroundImage: "radial-gradient(rgba(84, 74, 60, .08) .7px, transparent .7px)", backgroundSize: "18px 18px" }}>{messagesLoading ? <div className="text-center text-xs text-[var(--text-secondary)]">Loading messages...</div> : messageError ? <div role="alert" className="rounded-md border border-[#f5dada] bg-[var(--danger-soft)] p-3 text-xs text-[var(--danger)]">{messageError}</div> : messages.length === 0 ? <div className="flex h-full items-center justify-center text-center"><div className="rounded-xl border border-[var(--border-soft)] bg-white/80 px-6 py-5"><Mail className="mx-auto text-[var(--text-muted)]" size={26} /><div className="mt-3 text-sm font-medium">No messages in this conversation</div><div className="mt-1 text-xs text-[var(--text-secondary)]">Start the conversation below.</div></div></div> : <div className="mx-auto flex max-w-3xl flex-col gap-2.5"><div className="mx-auto mb-2 rounded-full border border-[var(--border-soft)] bg-white/85 px-3 py-1 text-[10px] font-medium text-[var(--text-secondary)] shadow-sm">Today</div>{messages.map((message) => <div key={message.id} className={cn("flex", message.direction === "OUTGOING" ? "justify-end" : "justify-start")}><div className={cn("relative max-w-[82%] rounded-lg px-3 py-2 text-[13px] leading-5 shadow-[0_1px_1px_rgba(4,45,29,.08)] sm:max-w-[68%]", message.direction === "OUTGOING" ? "rounded-br-sm bg-[var(--brand)] text-white" : "rounded-bl-sm border border-[var(--border-soft)] bg-white text-[var(--text-primary)]")}>{(message.mediaId || message.mediaUrl) && <MessageMedia message={message} accessToken={accessToken} workspaceId={workspaceId} contactId={selected.contactId} conversationId={selected.id} />}{message.text ? <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] pr-14">{message.text}</div> : !message.mediaId && !message.mediaUrl && <div className="pr-14">[{message.type.toLowerCase()} message]</div>}<div className={cn("absolute bottom-1 right-2 flex items-center gap-1 text-[9px]", message.direction === "OUTGOING" ? "text-white/70" : "text-[var(--text-muted)]")}>{formatTime(message.sentAt)}{message.direction === "OUTGOING" && <MessageTicks status={message.status} />}</div></div></div>)}</div>}</div>
              <form onSubmit={sendMessage} className="flex flex-none items-end gap-2 border-t border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2.5 sm:px-4"><input ref={fileInputRef} type="file" aria-label="Choose media" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" onChange={handleAttachmentChange} className="sr-only" />{attachment && <div className="flex max-w-40 shrink-0 items-center gap-1 rounded-md border border-[var(--border)] bg-white px-1.5 py-1 text-[10px] text-[var(--text-secondary)]">{attachment.messageType === "IMAGE" ? <img src={attachment.dataUrl} alt="Attachment preview" className="size-7 rounded object-cover" /> : <FileText size={16} />}<span className="truncate">{attachment.fileName}</span><button type="button" aria-label="Remove attachment" onClick={() => setAttachment(null)} className="flex size-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><X size={13} /></button></div>}<button type="button" aria-label="Add emoji" className="mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><Smile size={20} /></button><button type="button" aria-label="Attach file" onClick={chooseAttachment} className="mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><Paperclip size={19} /></button><div className="flex min-w-0 flex-1 items-center rounded-lg border border-[var(--border)] bg-white px-3 focus-within:border-[var(--brand-accent)] focus-within:ring-2 focus-within:ring-[var(--brand-accent)]/10"><textarea aria-label="Message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleMessageKeyDown} disabled={!canReply} placeholder={canReply ? "Type a message" : "You do not have reply permission"} rows={1} className="max-h-28 min-h-9 flex-1 resize-y border-0 bg-transparent py-2 text-sm outline-none placeholder:text-[var(--text-muted)]" /><button type="button" aria-label="Add image" onClick={chooseAttachment} className="hidden size-8 shrink-0 items-center justify-center text-[var(--text-muted)] hover:text-[var(--brand)] sm:flex"><ImagePlus size={17} /></button></div><button type="submit" aria-label={draft.trim() || attachment ? "Send" : "Voice message"} disabled={!canReply || (!draft.trim() && !attachment)} className="mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white transition-colors hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:bg-[var(--border-strong)]">{draft.trim() || attachment ? <Send size={16} /> : <Mic size={18} />}<span className="sr-only">{sending ? "Sending" : draft.trim() || attachment ? "Send" : "Voice message"}</span></button></form>
            </> : <div className="flex h-full items-center justify-center p-8 text-center"><div><InboxIcon className="mx-auto text-[var(--brand)]/60" size={38} /><h2 className="mt-4 text-[15px] font-semibold text-[var(--text-primary)]">Select a conversation</h2><div className="mt-1 text-xs text-[var(--text-secondary)]">Choose a chat to view the full thread.</div></div></div>}
          </section>
        </section>
      </main>
    </div>
  );
}
