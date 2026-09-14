import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  Archive,
  ArrowLeft,
  Ban,
  Check,
  CalendarClock,
  CheckCheck,
  Copy,
  ChevronDown,
  CircleAlert,
  Clock3,
  Download,
  Eraser,
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
  Forward,
  Paperclip,
  PhoneCall,
  Pin,
  Search,
  Send,
  Smile,
  Star,
  Tag,
  RefreshCw,
  Reply,
  Trash2,
  UserRound,
  UserX,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, apiRequest, downloadApiFile, getWebSocketUrl } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";
import { notifyInboxUnreadCountChanged } from "@/hooks/use-inbox-unread-count";
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
  isPinned?: boolean;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  phoneNumber?: { displayPhoneNumber: string } | null;
  contact: { id: string; name: string; profileName: string | null; profileImageUrl?: string | null; phoneE164?: string | null };
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
  deletedAt?: string | null;
  sentAt: string;
};
type PageResponse<T> = {
  items: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number; hasNext?: boolean; hasPrevious?: boolean };
};
type SyncResponse = { syncRequestIds: string[]; syncWarnings: string[] };

const CONVERSATION_PAGE_SIZE = 25;
const MESSAGE_PAGE_SIZE = 50;

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

function ContactAvatar({ name, imageUrl, className }: { name: string; imageUrl?: string | null; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(imageUrl && imageUrl !== failedUrl);
  return <div className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-full", showImage ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "bg-[#dfe5e7] text-white", className)}>{showImage ? <img src={imageUrl ?? undefined} alt={`${name} profile`} className="size-full object-cover" onError={() => setFailedUrl(imageUrl ?? null)} /> : <UserRound data-testid="contact-avatar-fallback" aria-label={`${name} default profile`} size={Math.max(16, 22)} strokeWidth={1.7} />}</div>;
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
  const merged = new Map(current.map((message) => [message.id, message]));
  for (const message of persisted) {
    const existingKey = merged.has(message.id)
      ? message.id
      : message.metaMessageId && [...merged.values()].find((item) => item.metaMessageId === message.metaMessageId)?.id;
    const existing = existingKey ? merged.get(existingKey) : undefined;
    if (existingKey && existingKey !== message.id) merged.delete(existingKey);
    merged.set(message.id, existing && (messageStatusRank[existing.status] ?? 0) > (messageStatusRank[message.status] ?? 0) ? { ...message, status: existing.status } : message);
  }
  return [...merged.values()].sort((left, right) => new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime());
}

function mergeConversations(incoming: Conversation[], current: Conversation[]) {
  const merged = new Map(current.map((conversation) => [conversation.id, conversation]));
  incoming.forEach((conversation) => merged.set(conversation.id, conversation));
  return [...merged.values()].sort((left, right) => {
    if (Boolean(left.isPinned) !== Boolean(right.isPinned)) return left.isPinned ? -1 : 1;
    const leftTime = left.lastMessageAt ? new Date(left.lastMessageAt).getTime() : 0;
    const rightTime = right.lastMessageAt ? new Date(right.lastMessageAt).getTime() : 0;
    return rightTime - leftTime || right.id.localeCompare(left.id);
  });
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
  const [previewOpen, setPreviewOpen] = useState(false);
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
  if (message.type === "IMAGE") return <>
    <button type="button" aria-label="Open attached image" onClick={() => setPreviewOpen(true)} className="mb-1 block max-w-full cursor-zoom-in rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]">
      <img src={source} alt="Attached image" className="max-h-72 max-w-full rounded-md object-cover" />
    </button>
    {previewOpen && <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/85 p-4 sm:p-8" role="presentation" onClick={() => setPreviewOpen(false)}>
      <section role="dialog" aria-modal="true" aria-label="Image preview" className="relative flex h-full w-full items-center justify-center" onClick={(event) => event.stopPropagation()}>
        <img src={source} alt="Attached image preview" className="max-h-full max-w-full rounded-md object-contain" />
        <div className="absolute right-0 top-0 flex items-center gap-2">
          <a href={source} download aria-label="Download image" className="flex size-10 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65"><Download size={18} /></a>
          <button type="button" aria-label="Close image preview" onClick={() => setPreviewOpen(false)} className="flex size-10 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65"><X size={20} /></button>
        </div>
      </section>
    </div>}
  </>;
  if (message.type === "VIDEO") return <video src={source} controls className="mb-1 max-h-72 max-w-full rounded-md" />;
  if (message.type === "AUDIO") return <audio src={source} controls className="mb-1 max-w-full" />;
  return <a href={source} download className="mb-1 flex items-center gap-2 rounded-md bg-black/5 px-3 py-2 text-xs underline-offset-2 hover:underline"><FileText size={18} /><span className="max-w-52 truncate">Download document</span><Download size={14} /></a>;
}

function MessageActionMenu({ message, open, canDelete, onToggle, onReply, onCopy, onDownload, onForward, onDelete }: {
  message: Message;
  open: boolean;
  canDelete: boolean;
  onToggle: () => void;
  onReply: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onForward: () => void;
  onDelete: () => void;
}) {
  const hasText = Boolean(message.text?.trim());
  const hasAttachment = Boolean(message.mediaId || message.mediaUrl);
  return <>
    <button type="button" aria-label={`Message actions for ${message.text ? message.text.slice(0, 30) : message.type.toLowerCase()}`} aria-expanded={open} onClick={(event) => { event.stopPropagation(); onToggle(); }} className="absolute right-1 top-1 z-10 flex size-6 items-center justify-center rounded-full bg-black/10 text-current opacity-0 transition-opacity hover:bg-black/20 focus:opacity-100 group-hover/message:opacity-100"><ChevronDown size={14} /></button>
    {open && <div role="menu" aria-label="Message actions" className="absolute right-1 top-8 z-30 min-w-36 overflow-hidden rounded-md border border-[var(--border)] bg-white py-1 text-[var(--text-primary)] shadow-[0_8px_24px_rgba(16,24,20,.16)]" onClick={(event) => event.stopPropagation()}>
      <button type="button" role="menuitem" disabled={!hasText} onClick={onReply} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--brand-soft)] disabled:cursor-not-allowed disabled:opacity-40"><Reply size={14} />Reply</button>
      <button type="button" role="menuitem" disabled={!hasText} onClick={onCopy} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--brand-soft)] disabled:cursor-not-allowed disabled:opacity-40"><Copy size={14} />Copy</button>
      {hasAttachment && <button type="button" role="menuitem" onClick={onDownload} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--brand-soft)]"><Download size={14} />Download</button>}
      <button type="button" role="menuitem" onClick={onForward} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--brand-soft)]"><Forward size={14} />Forward</button>
      {canDelete && <button type="button" role="menuitem" onClick={onDelete} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--danger)] hover:bg-red-50"><Trash2 size={14} />Delete</button>}
    </div>}
  </>;
}

function ConversationActionMenu({ conversation, open, canDelete, busy, onToggle, onPin, onClear, onDelete }: {
  conversation: Conversation;
  open: boolean;
  canDelete: boolean;
  busy: boolean;
  onToggle: () => void;
  onPin: () => void;
  onClear: () => void;
  onDelete: () => void;
}) {
  return <>
    <button type="button" aria-label="Open chat actions" aria-expanded={open} onClick={(event) => { event.stopPropagation(); onToggle(); }} className="absolute right-2 top-2 z-10 flex size-6 items-center justify-center rounded-full bg-white/90 text-[var(--text-secondary)] opacity-0 shadow-sm transition-opacity hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] focus:opacity-100 group-hover/chat:opacity-100"><ChevronDown size={14} /></button>
    {open && <div role="menu" aria-label={`Actions for ${conversation.contact.name}`} className="absolute right-2 top-9 z-40 min-w-36 overflow-hidden rounded-md border border-[var(--border)] bg-white py-1 text-[var(--text-primary)] shadow-[0_8px_24px_rgba(16,24,20,.16)]" onClick={(event) => event.stopPropagation()}>
      <button type="button" role="menuitem" disabled={busy} onClick={onPin} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--brand-soft)] disabled:cursor-wait disabled:opacity-50"><Pin size={14} />{conversation.isPinned ? "Unpin chat" : "Pin chat"}</button>
      <button type="button" role="menuitem" disabled={busy} onClick={onClear} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--brand-soft)] disabled:cursor-wait disabled:opacity-50"><Eraser size={14} />Clear chat</button>
      <button type="button" role="menuitem" disabled={busy || !canDelete} onClick={onDelete} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--danger)] hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={14} />Delete chat</button>
    </div>}
  </>;
}

function ConversationRow({ conversation, selected, menuOpen, busy, canDelete, onSelect, onToggleMenu, onPin, onClear, onDelete }: {
  conversation: Conversation;
  selected: boolean;
  menuOpen: boolean;
  busy: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onToggleMenu: () => void;
  onPin: () => void;
  onClear: () => void;
  onDelete: () => void;
}) {
  const ownNumber = conversation.phoneNumber?.displayPhoneNumber?.replace(/\D/g, "");
  const contactNumber = conversation.contact.phoneE164?.replace(/\D/g, "");
  const isOwnNumber = Boolean(ownNumber && contactNumber && ownNumber === contactNumber);
  const displayName = isOwnNumber ? conversation.contact.phoneE164 : conversation.contact.name;
  return <div className={cn("group/chat relative border-b border-[var(--border-soft)]", selected && "bg-[var(--brand-soft)]/55 before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1 before:bg-[var(--brand)]")}>
    <button type="button" onClick={onSelect} className="flex w-full items-center gap-3 px-4 py-3 pr-12 text-left transition-colors hover:bg-[var(--surface-subtle)]"><ContactAvatar name={conversation.contact.name} imageUrl={conversation.contact.profileImageUrl} className="size-11" /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className={cn("flex min-w-0 items-center gap-1.5 truncate text-[13px]", conversation.unreadCount ? "font-semibold text-[var(--text-primary)]" : "font-medium text-[var(--text-primary)]")}>{conversation.isPinned && <Pin data-testid="pinned-chat-icon" aria-label="Pinned chat" size={12} className="shrink-0 rotate-45 text-[var(--brand)]" />}{displayName}{isOwnNumber && <span className="shrink-0 text-[11px] font-medium text-[var(--brand)]">(You)</span>}</span><span className={cn("shrink-0 text-[10px]", conversation.unreadCount ? "font-medium text-[var(--brand)]" : "text-[var(--text-muted)]")}>{formatTime(conversation.lastMessageAt)}</span></div><div className="mt-1 flex items-center gap-1.5"><span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-secondary)]">{conversation.lastMessagePreview || "No messages yet"}</span>{conversation.unreadCount > 0 && <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-[9px] font-semibold text-white">{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</span>}</div></div></button>
    <ConversationActionMenu conversation={conversation} open={menuOpen} canDelete={canDelete} busy={busy} onToggle={onToggleMenu} onPin={onPin} onClear={onClear} onDelete={onDelete} />
  </div>;
}

function ForwardMessageDialog({ targets, search, loading, error, working, onClose, onSearch, onForward }: {
  targets: Conversation[];
  search: string;
  loading: boolean;
  error: string;
  working: boolean;
  onClose: () => void;
  onSearch: (value: string) => void;
  onForward: (conversation: Conversation) => void;
}) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--overlay)] px-4" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="forward-message-title" className="flex max-h-[min(560px,calc(100dvh-32px))] w-full max-w-md flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-[0_18px_50px_rgba(16,24,20,.18)]">
      <header className="flex flex-none items-center justify-between border-b border-[var(--border-soft)] px-5 py-4"><h2 id="forward-message-title" className="text-sm font-semibold text-[var(--text-primary)]">Forward message</h2><button type="button" aria-label="Close forward message" onClick={onClose} className="flex size-8 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><X size={16} /></button></header>
      <div className="min-h-0 overflow-y-auto p-3"><div className="relative mb-2"><Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-[var(--text-muted)]" /><input aria-label="Search users to forward to" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search users" className="h-9 w-full rounded-md border border-[var(--border)] bg-white pl-9 pr-3 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]/10" /></div>{error && <div role="alert" className="mb-2 rounded-md border border-[#f5dada] bg-[var(--danger-soft)] p-2 text-xs text-[var(--danger)]">{error}</div>}{loading ? <div role="status" className="p-6 text-center text-xs text-[var(--text-secondary)]">Searching users…</div> : targets.length ? targets.map((conversation) => <button key={conversation.id} type="button" disabled={working} onClick={() => onForward(conversation)} className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left hover:bg-[var(--brand-soft)] disabled:opacity-50"><ContactAvatar name={conversation.contact.name} imageUrl={conversation.contact.profileImageUrl} className="size-9" /><span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-primary)]">{conversation.contact.name}</span><Forward size={15} className="shrink-0 text-[var(--brand)]" /></button>) : <p className="p-6 text-center text-xs text-[var(--text-secondary)]">No users found.</p>}</div>
    </section>
  </div>;
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
  const canManage = permissions.includes("conversations.manage");
  const canSync = permissions.includes("whatsapp.manage");
  const [folder, setFolder] = useState<InboxFolder>(undefined);
  const [activeFilter, setActiveFilter] = useState<ChatFilterKey>("All chats");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [listOptionsOpen, setListOptionsOpen] = useState(false);
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
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [messageError, setMessageError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [conversationMenuId, setConversationMenuId] = useState<string | null>(null);
  const [conversationActionBusy, setConversationActionBusy] = useState<string | null>(null);
  const [messageMenuId, setMessageMenuId] = useState<string | null>(null);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardTargets, setForwardTargets] = useState<Conversation[]>([]);
  const [forwardTargetsLoading, setForwardTargetsLoading] = useState(false);
  const [forwardTargetsError, setForwardTargetsError] = useState("");
  const [messageActionBusy, setMessageActionBusy] = useState<string | null>(null);
  const [messageActionNotice, setMessageActionNotice] = useState("");
  const [conversationSearchOpen, setConversationSearchOpen] = useState(false);
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationSearchResults, setConversationSearchResults] = useState<Message[]>([]);
  const [conversationSearchLoading, setConversationSearchLoading] = useState(false);
  const [conversationSearchError, setConversationSearchError] = useState("");

  const selected = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );
  const selectedContactId = selected?.contactId;
  const selectedUnreadCount = selected?.unreadCount ?? 0;
  const selectedIdRef = useRef(selectedId);
  const messagesRef = useRef(messages);
  const conversationsRef = useRef(conversations);
  const messageRegionRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const conversationPageRef = useRef(1);
  const conversationHasNextRef = useRef(false);
  const messagePageRef = useRef(1);
  const messageHasPreviousRef = useRef(false);
  const loadingOlderMessagesRef = useRef(false);
  const messageScrollHeightRef = useRef<number | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
    stickToBottomRef.current = true;
    setConversationSearchOpen(false);
    setConversationSearch("");
    setConversationSearchResults([]);
    setConversationSearchError("");
  }, [selectedId]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    const previousHeight = messageScrollHeightRef.current;
    if (previousHeight === null) return;
    const frame = window.requestAnimationFrame(() => {
      const region = messageRegionRef.current;
      if (region) region.scrollTop += region.scrollHeight - previousHeight;
      messageScrollHeightRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages.length]);

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
      conversationPageRef.current = 1;
      conversationHasNextRef.current = false;
      setLoading(false);
      return;
    }
    if (showLoading) {
      setLoading(true);
      setError("");
    }
    const parameters = new URLSearchParams({ page: "1", pageSize: String(CONVERSATION_PAGE_SIZE), search });
    if (channelFilter !== "all") parameters.set("channelKey", channelFilter);
    if (folder === "UNREAD") parameters.set("unreadOnly", "true");
    else if (folder) parameters.set("status", folder);
    try {
      const result = await apiRequest<PageResponse<Conversation>>(
        `/workspaces/${workspaceId}/conversations?${parameters.toString()}`,
        { headers: { authorization: `Bearer ${accessToken}` } },
      );
      conversationPageRef.current = 1;
      conversationHasNextRef.current = result.pagination.hasNext ?? result.pagination.totalPages > 1;
      setConversations((current) => showLoading ? result.items : mergeConversations(result.items, current));
      setSelectedId((current) => showLoading
        ? result.items.some((item) => item.id === current) ? current : result.items[0]?.id ?? null
        : current ?? result.items[0]?.id ?? null);
    } catch (caughtError) {
      setError(friendlyError(caughtError, "Unable to load your inbox."));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [accessToken, canRead, channelFilter, folder, search, workspaceId]);

  const loadMoreConversations = useCallback(async () => {
    if (!workspaceId || !accessToken || !canRead || loadingMoreConversations || !conversationHasNextRef.current) return;
    const nextPage = conversationPageRef.current + 1;
    setLoadingMoreConversations(true);
    const parameters = new URLSearchParams({ page: String(nextPage), pageSize: String(CONVERSATION_PAGE_SIZE), search });
    if (channelFilter !== "all") parameters.set("channelKey", channelFilter);
    if (folder === "UNREAD") parameters.set("unreadOnly", "true");
    else if (folder) parameters.set("status", folder);
    try {
      const result = await apiRequest<PageResponse<Conversation>>(
        `/workspaces/${workspaceId}/conversations?${parameters.toString()}`,
        { headers: { authorization: `Bearer ${accessToken}` } },
      );
      conversationPageRef.current = nextPage;
      conversationHasNextRef.current = result.pagination.hasNext ?? nextPage < result.pagination.totalPages;
      setConversations((current) => mergeConversations(result.items, current));
    } catch (caughtError) {
      setError(friendlyError(caughtError, "Unable to load older conversations."));
    } finally {
      setLoadingMoreConversations(false);
    }
  }, [accessToken, canRead, channelFilter, folder, loadingMoreConversations, search, workspaceId]);

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
    messagePageRef.current = 1;
    messageHasPreviousRef.current = false;
    loadingOlderMessagesRef.current = false;
    setMessagesLoading(true);
    setMessageError("");
    void apiRequest<PageResponse<Message>>(
      `/workspaces/${workspaceId}/contacts/${selectedContactId}/conversations/${selectedId}/messages?page=1&pageSize=${MESSAGE_PAGE_SIZE}&latest=true`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    )
      .then((result) => {
        if (!active) return;
        messageHasPreviousRef.current = result.pagination.hasPrevious ?? result.pagination.totalPages > 1;
        setMessages((current) => mergeMessages(result.items, current));
        if (selectedUnreadCount > 0) {
          void apiRequest<{ readAt: string }>(
            `/workspaces/${workspaceId}/contacts/${selectedContactId}/conversations/${selectedId}/read`,
            { method: "POST", headers: { authorization: `Bearer ${accessToken}` } },
          )
            .then(() => {
              notifyInboxUnreadCountChanged();
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
    const searchTerm = conversationSearch.trim();
    if (!conversationSearchOpen || !selectedId || !selectedContactId || !workspaceId || !accessToken || !searchTerm) {
      setConversationSearchResults([]);
      setConversationSearchLoading(false);
      setConversationSearchError("");
      return;
    }
    let active = true;
    setConversationSearchLoading(true);
    setConversationSearchError("");
    const timer = window.setTimeout(() => {
      const parameters = new URLSearchParams({ page: "1", pageSize: String(MESSAGE_PAGE_SIZE), latest: "true", search: searchTerm });
      void apiRequest<PageResponse<Message>>(
        `/workspaces/${workspaceId}/contacts/${selectedContactId}/conversations/${selectedId}/messages?${parameters.toString()}`,
        { headers: { authorization: `Bearer ${accessToken}` } },
      )
        .then((result) => { if (active) setConversationSearchResults(result.items); })
        .catch((caughtError) => { if (active) setConversationSearchError(friendlyError(caughtError, "Unable to search this conversation.")); })
        .finally(() => { if (active) setConversationSearchLoading(false); });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [accessToken, conversationSearch, conversationSearchOpen, selectedContactId, selectedId, workspaceId]);

  const loadOlderMessages = useCallback(async () => {
    if (!selectedId || !selectedContactId || !workspaceId || !accessToken || loadingOlderMessagesRef.current || !messageHasPreviousRef.current) return;
    const region = messageRegionRef.current;
    messageScrollHeightRef.current = region?.scrollHeight ?? null;
    stickToBottomRef.current = false;
    const nextPage = messagePageRef.current + 1;
    loadingOlderMessagesRef.current = true;
    setLoadingOlderMessages(true);
    try {
      const result = await apiRequest<PageResponse<Message>>(
        `/workspaces/${workspaceId}/contacts/${selectedContactId}/conversations/${selectedId}/messages?page=${nextPage}&pageSize=${MESSAGE_PAGE_SIZE}&latest=true`,
        { headers: { authorization: `Bearer ${accessToken}` } },
      );
      messagePageRef.current = nextPage;
      messageHasPreviousRef.current = result.pagination.hasPrevious ?? nextPage < result.pagination.totalPages;
      setMessages((current) => mergeMessages(result.items, current));
    } catch (caughtError) {
      messageScrollHeightRef.current = null;
      setMessageError(friendlyError(caughtError, "Unable to load older messages."));
    } finally {
      loadingOlderMessagesRef.current = false;
      setLoadingOlderMessages(false);
    }
  }, [accessToken, selectedContactId, selectedId, workspaceId]);

  useEffect(() => {
    if (!selectedId || !selectedContactId || !workspaceId || !accessToken) return;
    const interval = window.setInterval(() => {
      const hasPendingStatus = messagesRef.current.some((message) => message.direction === "OUTGOING" && message.metaMessageId && (message.status === "SENT" || message.status === "DELIVERED"));
      if (!hasPendingStatus) return;
      void apiRequest<PageResponse<Message>>(
        `/workspaces/${workspaceId}/contacts/${selectedContactId}/conversations/${selectedId}/messages?page=1&pageSize=${MESSAGE_PAGE_SIZE}&latest=true`,
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
          if (payload.type === "inbox.refresh" && payload.workspaceId === workspaceId) {
            notifyInboxUnreadCountChanged();
            void loadConversationsRef.current(false);
          }
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
      setConversations((current) => current.map((conversation) => conversation.id === selected.id ? { ...conversation, lastMessagePreview: `You: ${text || currentAttachment?.messageType.toLowerCase() || "message"}`, lastMessageAt: result.message.sentAt } : conversation));
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

  useEffect(() => {
    if (!forwardMessage || !workspaceId || !accessToken || !canRead) {
      setForwardTargets([]);
      setForwardTargetsLoading(false);
      setForwardTargetsError("");
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setForwardTargetsLoading(true);
      setForwardTargetsError("");
      const parameters = new URLSearchParams({ page: "1", pageSize: "25", search: forwardSearch });
      void apiRequest<PageResponse<Conversation>>(
        `/workspaces/${workspaceId}/conversations/forward-targets?${parameters.toString()}`,
        { headers: { authorization: `Bearer ${accessToken}` } },
      )
        .then((result) => {
          if (active) setForwardTargets(result.items.filter((conversation) => conversation.id !== selectedId));
        })
        .catch((caughtError) => {
          if (active) setForwardTargetsError(friendlyError(caughtError, "Unable to search users."));
        })
        .finally(() => {
          if (active) setForwardTargetsLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [accessToken, canRead, forwardMessage, forwardSearch, selectedId, workspaceId]);

  const replyToMessage = (message: Message) => {
    if (!message.text?.trim()) return;
    setDraft(message.text);
    setMessageMenuId(null);
  };

  const copyMessage = async (message: Message) => {
    if (!message.text?.trim()) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message.text);
      } else {
        const temporaryInput = document.createElement("textarea");
        temporaryInput.value = message.text;
        temporaryInput.style.position = "fixed";
        temporaryInput.style.opacity = "0";
        document.body.appendChild(temporaryInput);
        temporaryInput.select();
        document.execCommand("copy");
        temporaryInput.remove();
      }
      setMessageActionNotice("Message copied");
      window.setTimeout(() => setMessageActionNotice(""), 2_000);
    } catch {
      setMessageError("The message could not be copied.");
    } finally {
      setMessageMenuId(null);
    }
  };

  const downloadMessageAttachment = async (message: Message) => {
    if (!workspaceId || !accessToken || !selected || (!message.mediaId && !message.mediaUrl) || messageActionBusy) return;
    setMessageActionBusy(message.id);
    setMessageError("");
    try {
      const blob = await downloadApiFile(
        `/workspaces/${workspaceId}/contacts/${selected.contactId}/conversations/${selected.id}/messages/${message.id}/media`,
        accessToken,
      );
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${message.type.toLowerCase()}-${message.id}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setMessageActionNotice("Attachment download started");
      window.setTimeout(() => setMessageActionNotice(""), 2_000);
      setMessageMenuId(null);
    } catch (caughtError) {
      setMessageError(friendlyError(caughtError, "The attachment could not be downloaded."));
    } finally {
      setMessageActionBusy(null);
    }
  };

  const deleteMessage = async (message: Message) => {
    if (!workspaceId || !accessToken || !selected || !canManage || message.id.startsWith("pending-") || messageActionBusy) return;
    if (!window.confirm("Delete this message from the conversation?")) return;
    setMessageActionBusy(message.id);
    setMessageError("");
    try {
      await apiRequest<void>(
        `/workspaces/${workspaceId}/contacts/${selected.contactId}/conversations/${selected.id}/messages/${message.id}`,
        { method: "DELETE", headers: { authorization: `Bearer ${accessToken}` } },
      );
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, deletedAt: new Date().toISOString(), text: null, mediaId: null, mediaUrl: null } : item));
      setMessageMenuId(null);
      notifyInboxUnreadCountChanged();
      void loadConversations(false);
    } catch (caughtError) {
      setMessageError(friendlyError(caughtError, "The message could not be deleted."));
    } finally {
      setMessageActionBusy(null);
    }
  };

  const forwardMessageTo = async (target: Conversation) => {
    if (!forwardMessage || !workspaceId || !accessToken || messageActionBusy) return;
    setMessageActionBusy(forwardMessage.id);
    setMessageError("");
    try {
      await apiRequest(
        `/workspaces/${workspaceId}/contacts/${target.contactId}/conversations/${target.id}/messages`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ direction: "OUTGOING", type: "TEXT", status: "SENT", text: forwardMessage.text || `[${forwardMessage.type.toLowerCase()} message]` }),
        },
      );
      setForwardMessage(null);
      setMessageMenuId(null);
      setMessageActionNotice(`Message forwarded to ${target.contact.name}`);
      window.setTimeout(() => setMessageActionNotice(""), 2_000);
      void loadConversations(false);
    } catch (caughtError) {
      setMessageError(friendlyError(caughtError, "The message could not be forwarded."));
    } finally {
      setMessageActionBusy(null);
    }
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

  const pinChat = async (conversation: Conversation) => {
    if (!workspaceId || !accessToken || conversationActionBusy) return;
    setConversationActionBusy(conversation.id);
    setError("");
    try {
      const result = await apiRequest<{ isPinned?: boolean }>(`/workspaces/${workspaceId}/contacts/${conversation.contactId}/conversations/${conversation.id}/pin`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ pinned: !conversation.isPinned }),
      });
      const isPinned = result.isPinned ?? !conversation.isPinned;
      setConversations((current) => mergeConversations([], current.map((item) => item.id === conversation.id ? { ...item, isPinned } : item)));
      setConversationMenuId(null);
    } catch (caughtError) {
      setError(friendlyError(caughtError, "Unable to update the chat pin."));
    } finally {
      setConversationActionBusy(null);
    }
  };

  const clearChat = async (conversation: Conversation) => {
    if (!workspaceId || !accessToken || conversationActionBusy) return;
    setConversationActionBusy(conversation.id);
    setError("");
    try {
      await apiRequest(`/workspaces/${workspaceId}/contacts/${conversation.contactId}/conversations/${conversation.id}/clear`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      setConversations((current) => current.map((item) => item.id === conversation.id ? { ...item, lastMessagePreview: null, lastMessageAt: null, unreadCount: 0 } : item));
      if (selectedId === conversation.id) setMessages([]);
      notifyInboxUnreadCountChanged();
      setConversationMenuId(null);
    } catch (caughtError) {
      setError(friendlyError(caughtError, "Unable to clear this chat."));
    } finally {
      setConversationActionBusy(null);
    }
  };

  const deleteChat = async (conversation: Conversation) => {
    if (!workspaceId || !accessToken || conversationActionBusy || !canManage) return;
    setConversationActionBusy(conversation.id);
    setError("");
    try {
      await apiRequest(`/workspaces/${workspaceId}/contacts/${conversation.contactId}/conversations/${conversation.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${accessToken}` },
      });
      setConversations((current) => current.filter((item) => item.id !== conversation.id));
      if (selectedId === conversation.id) {
        setSelectedId(null);
        setMessages([]);
      }
      notifyInboxUnreadCountChanged();
      setConversationMenuId(null);
    } catch (caughtError) {
      setError(friendlyError(caughtError, "Unable to delete this chat."));
    } finally {
      setConversationActionBusy(null);
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
                <div className="min-w-0"><h2 className="flex items-center gap-1.5 truncate text-[15px] font-semibold text-[var(--text-primary)]"><span>{activeFilter}</span>{activeFilter === "All chats" && conversations.length > 0 && <span aria-hidden="true" className="text-xs font-medium text-[var(--text-muted)]">{conversations.length}</span>}</h2><div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--text-muted)]"><span>{loading ? "Loading..." : `${conversations.length} chats`}</span><span data-testid="inbox-connection-status" className={cn("inline-flex items-center gap-1", realtimeConnected ? "text-[#16845f]" : "text-[var(--text-muted)]")}><span className={cn("size-1.5 rounded-full", realtimeConnected ? "bg-[#16845f]" : "bg-[#a7adb4]")} />{realtimeConnected ? "Live" : "Polling"}</span></div></div>
              </div>
              <div className="relative flex items-center gap-1"><button type="button" aria-label="Refresh conversations" onClick={() => void loadConversations()} className="flex size-8 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><RefreshCw size={16} /></button><button type="button" aria-label="Conversation list options" aria-expanded={listOptionsOpen} aria-haspopup="menu" onClick={() => setListOptionsOpen((current) => !current)} className="flex size-8 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><MoreVertical size={17} /></button>{listOptionsOpen && <div role="menu" aria-label="Conversation filters" className="absolute right-0 top-10 z-40 w-64 overflow-hidden rounded-lg border border-[var(--border)] bg-white p-1.5 text-[var(--text-primary)] shadow-[0_10px_28px_rgba(16,24,20,.16)]">
                <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Chats</div>
                {chatFilters.map(({ label, status, icon: Icon }) => <button key={label} type="button" onClick={() => { setFolder(status); setActiveFilter(label); setListOptionsOpen(false); }} className={cn("flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-medium", activeFilter === label ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]")}><Icon size={14} />{label}{label === "All chats" && conversations.length > 0 && <span aria-hidden="true" className="ml-auto text-[10px] opacity-70">{conversations.length}</span>}</button>)}
                <div className="my-1 border-t border-[var(--border-soft)]" />
                <button type="button" aria-expanded={channelsOpen} onClick={() => setChannelsOpen((current) => !current)} className="flex h-9 w-full items-center justify-between rounded-md px-2 text-left text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"><span className="flex items-center gap-2"><MessageCircle size={14} />Channels{channelFilter !== "all" && <span className="text-[10px] text-[var(--brand)]">({channels.find((channel) => channel.value === channelFilter)?.label})</span>}</span><ChevronDown className={cn("transition-transform", channelsOpen && "rotate-180")} size={14} /></button>
                {channelsOpen && <div className="grid grid-cols-2 gap-1 px-1 pb-1">{channels.map(({ label, value, icon: Icon }) => <button key={value} type="button" onClick={() => { setChannelFilter(value); setListOptionsOpen(false); setChannelsOpen(false); }} className={cn("flex min-h-8 items-center gap-1.5 rounded px-2 text-left text-[10px] font-medium", channelFilter === value ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]")}><Icon size={13} />{label}</button>)}</div>}
                <button type="button" aria-expanded={moreFiltersOpen} onClick={() => setMoreFiltersOpen((current) => !current)} className="flex h-9 w-full items-center justify-between rounded-md px-2 text-left text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"><span className="flex items-center gap-2"><Filter size={14} />More filters</span><ChevronDown className={cn("transition-transform", moreFiltersOpen && "rotate-180")} size={14} /></button>
                {moreFiltersOpen && <div className="grid grid-cols-2 gap-1 px-1 pb-1">{advancedFilters.filter(({ label }) => label !== "Less").map(({ label, status, icon: Icon }) => <button key={label} type="button" onClick={() => { if (status !== undefined) { setFolder(status); setActiveFilter(label); } setListOptionsOpen(false); setMoreFiltersOpen(false); }} className={cn("flex min-h-8 items-center gap-1.5 rounded px-2 text-left text-[10px] font-medium", activeFilter === label ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]")}><Icon size={13} />{label}</button>)}</div>}
              </div>}</div>
            </header>

            <div className="flex-none border-b border-[var(--border-soft)] bg-white p-3">
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 text-[var(--text-muted)]" size={15} /><input aria-label="Search conversations" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search or start new chat" className="h-9 w-full rounded-md border border-transparent bg-[var(--surface-subtle)] pl-9 pr-3 text-xs text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--brand-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--brand-accent)]/10" /></div>
            </div>

            <div data-testid="inbox-conversation-list" className="min-h-0 flex-1 overflow-y-auto" onScroll={(event) => { const list = event.currentTarget; if (list.scrollTop + list.clientHeight >= list.scrollHeight - 120) void loadMoreConversations(); }}>
              {error && <div role="alert" className="m-3 rounded-md border border-[#f5dada] bg-[var(--danger-soft)] p-3 text-xs text-[var(--danger)]">{error}</div>}
              {loading ? <div className="p-8 text-center text-xs text-[var(--text-secondary)]">Loading conversations...</div> : conversations.length === 0 ? <div className="p-8 text-center"><Users className="mx-auto text-[var(--text-muted)]" size={28} /><div className="mt-3 text-sm font-medium">No conversations yet</div><div className="mt-1 text-xs text-[var(--text-secondary)]">Your WhatsApp conversations will appear here.</div>{activeFilter === "All chats" && canSync && <button type="button" onClick={() => void syncNow()} disabled={syncing} className="mx-auto mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--brand)] px-3 text-xs font-semibold text-white hover:bg-[var(--brand-hover)] disabled:cursor-wait disabled:opacity-60"><RefreshCw size={14} className={syncing ? "animate-spin" : undefined} />{syncing ? "Syncing..." : "Sync now"}</button>}</div> : <>{conversations.map((conversation) => <ConversationRow key={conversation.id} conversation={conversation} selected={selectedId === conversation.id} menuOpen={conversationMenuId === conversation.id} busy={conversationActionBusy === conversation.id} canDelete={canManage} onSelect={() => setSelectedId(conversation.id)} onToggleMenu={() => setConversationMenuId((current) => current === conversation.id ? null : conversation.id)} onPin={() => void pinChat(conversation)} onClear={() => void clearChat(conversation)} onDelete={() => void deleteChat(conversation)} />)}{loadingMoreConversations && <div role="status" className="p-3 text-center text-[10px] text-[var(--text-muted)]">Loading older conversations…</div>}</>}
            </div>
            <footer className="flex flex-none items-center justify-between border-t border-[var(--border-soft)] bg-[var(--surface-subtle)] px-4 py-2 text-[10px] text-[var(--text-muted)]"><span>{conversations.length} chats</span><span>{conversations.filter((item) => item.unreadCount > 0).length} unread</span></footer>
          </section>

          <section className={cn("relative min-h-0 flex-col bg-[var(--page-background)]", selected ? "flex" : "hidden lg:flex")} aria-label="Conversation thread">
            {selected ? <>
              <header className="flex flex-none items-center justify-between border-b border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-2.5 sm:px-5"><div className="flex min-w-0 items-center gap-3"><button type="button" aria-label="Back to conversations" onClick={() => setSelectedId(null)} className="flex size-8 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] lg:hidden"><ArrowLeft size={18} /></button><ContactAvatar name={selected.contact.name} imageUrl={selected.contact.profileImageUrl} className="size-10" /><div className="min-w-0"><h2 className="truncate text-[15px] font-semibold text-[var(--text-primary)]">{selected.contact.name}</h2><div className="truncate text-[11px] text-[var(--text-secondary)]">{selected.contact.profileName || "WhatsApp contact"} · {selected.status === "OPEN" ? "active now" : selected.status.toLowerCase()}</div></div></div><div className="flex items-center gap-0.5"><button type="button" aria-label="Search in conversation" onClick={() => setConversationSearchOpen(true)} className="hidden size-8 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)] sm:flex"><Search size={16} /></button><button type="button" aria-label="Archive conversation" className="flex size-8 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><Archive size={16} /></button><button type="button" aria-label="More conversation actions" className="flex size-8 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><MoreVertical size={17} /></button></div></header>
              {conversationSearchOpen && <aside data-testid="conversation-search-drawer" className="absolute inset-y-0 right-0 z-30 flex w-full max-w-sm flex-col border-l border-[var(--border)] bg-white shadow-[-8px_0_24px_rgba(16,24,20,.12)]"><header className="flex flex-none items-center gap-2 border-b border-[var(--border)] px-3 py-2.5"><button type="button" aria-label="Close message search" onClick={() => { setConversationSearchOpen(false); setConversationSearch(""); }} className="flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><ArrowLeft size={17} /></button><div className="relative min-w-0 flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-[var(--text-muted)]" /><input autoFocus aria-label="Search messages" value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Search messages" className="h-9 w-full rounded-md border border-transparent bg-[var(--surface-subtle)] pl-9 pr-3 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--brand-accent)]/10" /></div></header><div className="min-h-0 flex-1 overflow-y-auto p-2">{!conversationSearch.trim() ? <div className="p-6 text-center text-xs text-[var(--text-secondary)]">Search messages in this chat.</div> : conversationSearchLoading ? <div role="status" className="p-6 text-center text-xs text-[var(--text-secondary)]">Searching messages…</div> : conversationSearchError ? <div role="alert" className="m-2 rounded-md border border-[#f5dada] bg-[var(--danger-soft)] p-2 text-xs text-[var(--danger)]">{conversationSearchError}</div> : conversationSearchResults.length ? conversationSearchResults.map((message) => <button key={message.id} type="button" onClick={() => { setConversationSearchOpen(false); setConversationSearch(""); const target = document.querySelector(`[data-message-id="${message.id}"]`); target?.scrollIntoView?.({ behavior: "smooth", block: "center" }); }} className="flex w-full items-start gap-2 rounded-md p-3 text-left hover:bg-[var(--surface-subtle)]"><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-[var(--text-primary)]">{message.text || `[${message.type.toLowerCase()} message]`}</span><span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">{formatTime(message.sentAt)}</span></span></button>) : <div className="p-6 text-center text-xs text-[var(--text-secondary)]">No messages found.</div>}</div></aside>}
              <div data-testid="inbox-message-region" ref={messageRegionRef} onScroll={(event) => { const region = event.currentTarget; stickToBottomRef.current = region.scrollHeight - region.scrollTop - region.clientHeight < 120; if (region.scrollTop <= 80) void loadOlderMessages(); }} className="relative min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8" style={{ backgroundColor: "#efeae2", backgroundImage: "radial-gradient(rgba(84, 74, 60, .08) .7px, transparent .7px)", backgroundSize: "18px 18px" }}>{loadingOlderMessages && <div data-testid="inbox-older-messages-loading" role="status" className="pointer-events-none absolute inset-x-0 top-2 z-10 text-center text-[10px] text-[var(--text-secondary)]">Loading older messages…</div>}{messagesLoading ? <div className="text-center text-xs text-[var(--text-secondary)]">Loading messages...</div> : messageError ? <div role="alert" className="rounded-md border border-[#f5dada] bg-[var(--danger-soft)] p-3 text-xs text-[var(--danger)]">{messageError}</div> : messages.length === 0 ? <div className="flex h-full items-center justify-center text-center"><div className="rounded-xl border border-[var(--border-soft)] bg-white/80 px-6 py-5"><Mail className="mx-auto text-[var(--text-muted)]" size={26} /><div className="mt-3 text-sm font-medium">No messages in this conversation</div><div className="mt-1 text-xs text-[var(--text-secondary)]">Start the conversation below.</div></div></div> : <div className="mx-auto flex max-w-3xl flex-col gap-2.5"><div className="mx-auto mb-2 rounded-full border border-[var(--border-soft)] bg-white/85 px-3 py-1 text-[10px] font-medium text-[var(--text-secondary)] shadow-sm">Today</div>{messages.map((message) => <div key={message.id} data-message-id={message.id} className={cn("flex", message.direction === "OUTGOING" ? "justify-end" : "justify-start")}><div className={cn("group/message relative max-w-[82%] rounded-lg px-3 py-2 text-[13px] leading-5 shadow-[0_1px_1px_rgba(4,45,29,.08)] sm:max-w-[68%]", message.direction === "OUTGOING" ? "rounded-br-sm bg-[var(--brand)] text-white" : "rounded-bl-sm border border-[var(--border-soft)] bg-white text-[var(--text-primary)]")}>{!message.deletedAt && <MessageActionMenu message={message} open={messageMenuId === message.id} canDelete={canManage && !message.id.startsWith("pending-")} onToggle={() => setMessageMenuId((current) => current === message.id ? null : message.id)} onReply={() => replyToMessage(message)} onCopy={() => void copyMessage(message)} onDownload={() => void downloadMessageAttachment(message)} onForward={() => { setForwardMessage(message); setForwardSearch(""); setForwardTargets([]); setForwardTargetsError(""); setMessageMenuId(null); }} onDelete={() => void deleteMessage(message)} />}{!message.deletedAt && (message.mediaId || message.mediaUrl) && <MessageMedia message={message} accessToken={accessToken} workspaceId={workspaceId} contactId={selected.contactId} conversationId={selected.id} />}{message.deletedAt ? <div className="pr-14 italic opacity-70">This message was deleted</div> : message.text ? <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] pr-14">{message.text}</div> : !message.mediaId && !message.mediaUrl && <div className="pr-14">[{message.type.toLowerCase()} message]</div>}<div className={cn("absolute bottom-1 right-2 flex items-center gap-1 text-[9px]", message.direction === "OUTGOING" ? "text-white/70" : "text-[var(--text-muted)]")}>{formatTime(message.sentAt)}{message.direction === "OUTGOING" && <MessageTicks status={message.status} />}</div></div></div>)}</div>}</div>
              {messageActionNotice && <div role="status" className="absolute bottom-20 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[var(--text-primary)] px-3 py-1.5 text-[11px] text-white shadow-md">{messageActionNotice}</div>}<form onSubmit={sendMessage} className="flex flex-none items-end gap-2 border-t border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2.5 sm:px-4"><input ref={fileInputRef} type="file" aria-label="Choose media" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" onChange={handleAttachmentChange} className="sr-only" />{attachment && <div className="flex max-w-40 shrink-0 items-center gap-1 rounded-md border border-[var(--border)] bg-white px-1.5 py-1 text-[10px] text-[var(--text-secondary)]">{attachment.messageType === "IMAGE" ? <img src={attachment.dataUrl} alt="Attachment preview" className="size-7 rounded object-cover" /> : <FileText size={16} />}<span className="truncate">{attachment.fileName}</span><button type="button" aria-label="Remove attachment" onClick={() => setAttachment(null)} className="flex size-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><X size={13} /></button></div>}<button type="button" aria-label="Add emoji" className="mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><Smile size={20} /></button><button type="button" aria-label="Attach file" onClick={chooseAttachment} className="mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><Paperclip size={19} /></button><div className="flex min-w-0 flex-1 items-center rounded-lg border border-[var(--border)] bg-white px-3 focus-within:border-[var(--brand-accent)] focus-within:ring-2 focus-within:ring-[var(--brand-accent)]/10"><textarea aria-label="Message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleMessageKeyDown} disabled={!canReply} placeholder={canReply ? "Type a message" : "You do not have reply permission"} rows={1} className="max-h-28 min-h-9 flex-1 resize-y border-0 bg-transparent py-2 text-sm outline-none placeholder:text-[var(--text-muted)]" /><button type="button" aria-label="Add image" onClick={chooseAttachment} className="hidden size-8 shrink-0 items-center justify-center text-[var(--text-muted)] hover:text-[var(--brand)] sm:flex"><ImagePlus size={17} /></button></div><button type="submit" aria-label={draft.trim() || attachment ? "Send" : "Voice message"} disabled={!canReply || (!draft.trim() && !attachment)} className="mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white transition-colors hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:bg-[var(--border-strong)]">{draft.trim() || attachment ? <Send size={16} /> : <Mic size={18} />}<span className="sr-only">{sending ? "Sending" : draft.trim() || attachment ? "Send" : "Voice message"}</span></button></form>{forwardMessage && <ForwardMessageDialog targets={forwardTargets} search={forwardSearch} loading={forwardTargetsLoading} error={forwardTargetsError} working={messageActionBusy === forwardMessage.id} onClose={() => { if (!messageActionBusy) setForwardMessage(null); }} onSearch={setForwardSearch} onForward={(target) => void forwardMessageTo(target)} />}
            </> : <div className="flex h-full items-center justify-center p-8 text-center"><div><InboxIcon className="mx-auto text-[var(--brand)]/60" size={38} /><h2 className="mt-4 text-[15px] font-semibold text-[var(--text-primary)]">Select a conversation</h2><div className="mt-1 text-xs text-[var(--text-secondary)]">Choose a chat to view the full thread.</div></div></div>}
          </section>
        </section>
      </main>
    </div>
  );
}
