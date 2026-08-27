import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Archive,
  ArrowLeft,
  Ban,
  CalendarClock,
  CheckCheck,
  ChevronDown,
  CircleAlert,
  Clock3,
  Inbox as InboxIcon,
  Mail,
  MessageCircle,
  MessageSquare,
  Megaphone,
  MoreHorizontal,
  Paperclip,
  PhoneCall,
  Search,
  Send,
  Smile,
  Star,
  Tag,
  UserRound,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, apiRequest } from "@/lib/api";
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
  contact: { id: string; name: string; profileName: string | null };
};
type Message = {
  id: string;
  direction: "INCOMING" | "OUTGOING";
  type: string;
  status: string;
  text: string | null;
  sentAt: string;
};
type PageResponse<T> = {
  items: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

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

export function Inbox() {
  const { accessToken, user } = useAuth();
  const workspaceId = getActiveMembership(user)?.workspace.id;
  const permissions = getActiveMembership(user)?.role.permissions ?? [];
  const canRead = permissions.includes("inbox.read");
  const canReply = permissions.includes("conversations.reply");
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
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [messageError, setMessageError] = useState("");

  const selected = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const loadConversations = useCallback(async () => {
    if (!workspaceId || !accessToken || !canRead) {
      setConversations([]);
      setSelectedId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
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
      setLoading(false);
    }
  }, [accessToken, canRead, channelFilter, folder, search, workspaceId]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!selected || !workspaceId || !accessToken) {
      setMessages([]);
      return;
    }
    let active = true;
    setMessagesLoading(true);
    setMessageError("");
    void apiRequest<PageResponse<Message>>(
      `/workspaces/${workspaceId}/contacts/${selected.contactId}/conversations/${selected.id}/messages?page=1&pageSize=100`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    )
      .then((result) => {
        if (active) setMessages(result.items);
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
  }, [accessToken, selected, workspaceId]);

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || !selected || !workspaceId || !accessToken || !canReply) return;
    setSending(true);
    setMessageError("");
    try {
      const result = await apiRequest<{ message: Message }>(
        `/workspaces/${workspaceId}/contacts/${selected.contactId}/conversations/${selected.id}/messages`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ direction: "OUTGOING", type: "TEXT", status: "SENT", text: draft.trim() }),
        },
      );
      setMessages((current) => [...current, result.message]);
      setDraft("");
      void loadConversations();
    } catch (caughtError) {
      setMessageError(friendlyError(caughtError, "Your message could not be sent."));
    } finally {
      setSending(false);
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
      <main className="min-h-0 flex-1">
        <section className="grid h-full min-h-0 grid-cols-1 overflow-hidden bg-white lg:grid-cols-[184px_minmax(300px,370px)_minmax(0,1fr)]">
          <aside className="scrollbar-subtle hidden min-h-0 overflow-y-auto border-r border-[var(--border-soft)] bg-[#fbfcfc] px-3 py-4 lg:block">
            <div className="mb-3 flex h-9 items-center gap-2 px-2.5 text-[13px] font-semibold text-[var(--brand)]"><InboxIcon size={16} /> Inbox</div>
            <nav aria-label="Inbox filters" className="space-y-5">
              <div className="-mx-3 border-y border-[var(--border-soft)] px-3 py-2">
                <button type="button" aria-expanded={channelsOpen} onClick={() => setChannelsOpen((current) => !current)} className="mb-1 flex h-9 w-full items-center justify-between gap-2 rounded-md px-2.5 text-left text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><span>Channels</span><ChevronDown className={cn("shrink-0 text-[var(--text-secondary)] transition-transform", channelsOpen && "rotate-180")} size={15} /></button>
                {channelsOpen && <div className="space-y-0.5">
                  {channels.map(({ label, value, icon: Icon }) => <button key={value} type="button" onClick={() => setChannelFilter(value)} className={cn("flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] font-medium transition-colors", channelFilter === value ? "bg-[var(--brand)] text-white" : "text-[var(--text-primary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]")}><Icon size={16} />{label}</button>)}
                </div>}
              </div>
              <div>
                <div className="space-y-0.5">
                  {chatFilters.map(({ label, status, icon: Icon }) => <button key={label} type="button" onClick={() => { setFolder(status); setActiveFilter(label); }} className={cn("flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] font-medium transition-colors", activeFilter === label ? "bg-[var(--brand)] text-white" : "text-[var(--text-primary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]")}><Icon size={16} />{label}{label === "All chats" && <span className={cn("ml-auto text-[10px]", activeFilter === label ? "text-white/75" : "text-[var(--text-muted)]")}>{conversations.length || ""}</span>}</button>)}
                </div>
              </div>
              <div>
                <button type="button" aria-expanded={moreFiltersOpen} onClick={() => setMoreFiltersOpen((current) => !current)} className="mb-1 flex h-9 w-full items-center justify-between gap-2 rounded-md px-2.5 text-left text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><span>More filters</span><ChevronDown className={cn("shrink-0 text-[var(--text-secondary)] transition-transform", moreFiltersOpen && "rotate-180")} size={15} /></button>
                {moreFiltersOpen && <div className="space-y-0.5">
                  {advancedFilters.map(({ label, status, icon: Icon }) => <button key={label} type="button" onClick={() => { if (status !== undefined) { setFolder(status); setActiveFilter(label); } }} className={cn("flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] font-medium transition-colors", activeFilter === label ? "bg-[var(--brand)] text-white" : "text-[var(--text-primary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]")}><Icon size={16} />{label}</button>)}
                </div>}
              </div>
            </nav>
            <div className="mt-5 flex items-center justify-between border-t border-[var(--border-soft)] px-2 pt-4 text-[11px]"><span className="font-medium text-[var(--text-secondary)]">{conversations.length} Chats</span><span className="text-[var(--text-muted)]">{conversations.filter((item) => item.unreadCount > 0).length} Unread</span></div>
          </aside>
          <section className={cn("flex min-h-0 flex-col border-r border-[var(--border-soft)]", selected && "hidden lg:flex")} aria-label="Conversation list">
            <div className="flex flex-none items-center justify-between border-b border-[var(--border-soft)] px-4 py-3"><div><h2 className="text-sm font-semibold text-[var(--text-primary)]">{activeFilter}</h2><div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{loading ? "Loading..." : `${conversations.length} chats`}</div></div><button type="button" aria-label="Conversation options" className="text-[var(--text-secondary)]"><MoreHorizontal size={17} /></button></div>
            <div className="flex-none border-b border-[var(--border-soft)] p-3"><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 text-[var(--text-muted)]" size={15} /><input aria-label="Search conversations" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" className="h-9 w-full rounded-md border border-[var(--border)] bg-[#fbfcfc] pl-8 pr-3 text-xs outline-none focus:border-[var(--brand)]" /></div></div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {error && <div role="alert" className="m-3 rounded-md border border-red-100 bg-red-50 p-3 text-xs text-[var(--danger)]">{error}</div>}
              {loading ? <div className="p-5 text-center text-xs text-[var(--text-secondary)]">Loading conversations...</div> : conversations.length === 0 ? <div className="p-8 text-center"><Users className="mx-auto text-[var(--text-muted)]" size={24} /><div className="mt-3 text-sm font-medium">No conversations yet</div><div className="mt-1 text-xs text-[var(--text-secondary)]">Incoming WhatsApp conversations will appear here.</div></div> : conversations.map((conversation) => <button key={conversation.id} type="button" onClick={() => setSelectedId(conversation.id)} className={cn("w-full border-b border-[var(--border-soft)] px-4 py-3 text-left hover:bg-[var(--brand-soft)]/45", selectedId === conversation.id && "bg-[var(--brand-soft)]")}><div className="flex items-start gap-2.5"><div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[11px] font-semibold text-[var(--brand)]">{initials(conversation.contact.name)}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className={cn("truncate text-xs", conversation.unreadCount ? "font-semibold text-[var(--text-primary)]" : "font-medium text-[var(--text-secondary)]")}>{conversation.contact.name}</span><span className="shrink-0 text-[10px] text-[var(--text-muted)]">{formatTime(conversation.lastMessageAt)}</span></div><div className="mt-1 truncate text-[11px] text-[var(--text-secondary)]">{conversation.lastMessagePreview || "No messages yet"}</div>{conversation.unreadCount > 0 && <span className="mt-1 inline-flex rounded-full bg-[var(--brand)] px-1.5 py-0.5 text-[9px] font-semibold text-white">{conversation.unreadCount} unread</span>}</div></div></button>)}
            </div>
          </section>
          <section className={cn("min-h-0 flex-col", selected ? "flex" : "hidden lg:flex")} aria-label="Conversation thread">
            {selected ? <><div className="flex flex-none items-center justify-between border-b border-[var(--border-soft)] px-4 py-3 sm:px-5"><div className="flex min-w-0 items-center gap-3"><button type="button" aria-label="Back to conversations" onClick={() => setSelectedId(null)} className="text-[var(--text-secondary)] hover:text-[var(--brand)] lg:hidden"><ArrowLeft size={18} /></button><div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xs font-semibold text-[var(--brand)]">{initials(selected.contact.name)}</div><div className="min-w-0"><h2 className="truncate text-sm font-semibold text-[var(--text-primary)]">{selected.contact.name}</h2><div className="truncate text-[11px] text-[var(--text-secondary)]">{selected.contact.profileName || "WhatsApp contact"}</div></div></div><div className="flex items-center gap-1"><button type="button" aria-label="Archive conversation" className="flex size-8 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><Archive size={16} /></button><button type="button" aria-label="More conversation actions" className="flex size-8 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><MoreHorizontal size={17} /></button></div></div><div className="min-h-0 flex-1 overflow-y-auto bg-[#f8faf9] px-4 py-5 sm:px-8">{messagesLoading ? <div className="text-center text-xs text-[var(--text-secondary)]">Loading messages...</div> : messageError ? <div role="alert" className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-[var(--danger)]">{messageError}</div> : messages.length === 0 ? <div className="flex h-full items-center justify-center text-center"><div><Mail className="mx-auto text-[var(--text-muted)]" size={26} /><div className="mt-3 text-sm font-medium">No messages in this conversation</div><div className="mt-1 text-xs text-[var(--text-secondary)]">Start the conversation below.</div></div></div> : <div className="mx-auto flex max-w-2xl flex-col gap-3">{messages.map((message) => <div key={message.id} className={cn("flex", message.direction === "OUTGOING" ? "justify-end" : "justify-start")}><div className={cn("max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm shadow-[0_1px_2px_rgba(30,40,55,.05)]", message.direction === "OUTGOING" ? "rounded-br-sm bg-[var(--brand)] text-white" : "rounded-bl-sm border border-[var(--border-soft)] bg-white text-[var(--text-primary)]")}><div className="whitespace-pre-wrap">{message.text || `[${message.type.toLowerCase()} message]`}</div><div className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", message.direction === "OUTGOING" ? "text-white/70" : "text-[var(--text-muted)]")}>{formatTime(message.sentAt)}{message.direction === "OUTGOING" && <CheckCheck size={12} />}</div></div></div>)}</div>}</div><form onSubmit={sendMessage} className="flex flex-none items-end gap-2 border-t border-[var(--border-soft)] bg-white p-3 sm:p-4"><div className="flex flex-1 items-center rounded-md border border-[var(--border)] bg-[#fbfcfc] px-2"><button type="button" aria-label="Attach file" className="flex size-8 items-center justify-center text-[var(--text-muted)] hover:text-[var(--brand)]"><Paperclip size={16} /></button><textarea aria-label="Message" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!canReply || sending} placeholder={canReply ? "Write a message..." : "You do not have reply permission"} rows={1} className="max-h-28 min-h-9 flex-1 resize-y border-0 bg-transparent px-1 py-2 text-sm outline-none" /><button type="button" aria-label="Add emoji" className="flex size-8 items-center justify-center text-[var(--text-muted)] hover:text-[var(--brand)]"><Smile size={16} /></button></div><button type="submit" disabled={!canReply || sending || !draft.trim()} className="flex h-9 items-center gap-1.5 rounded-md bg-[var(--brand)] px-3 text-xs font-semibold text-white hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-50">{sending ? "Sending" : "Send"}<Send size={14} /></button></form></> : <div className="flex h-full items-center justify-center p-8 text-center"><div><InboxIcon className="mx-auto text-[var(--brand)]/60" size={34} /><h2 className="mt-4 text-sm font-semibold text-[var(--text-primary)]">Select a conversation</h2><div className="mt-1 text-xs text-[var(--text-secondary)]">Choose a conversation to view the full thread.</div></div></div>}
          </section>
        </section>
      </main>
    </div>
  );
}
