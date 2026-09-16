import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Check, LoaderCircle, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ApiError, apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";

type LibraryButton = { type?: string; text?: string; url?: string };
export type MetaTemplateLibraryItem = {
  id: string | null;
  name: string;
  language: string;
  category: string;
  topic: string | null;
  industry: string | null;
  usecase: string | null;
  body: string;
  parameters: unknown;
  buttons: unknown[];
  components: unknown[];
};
type LibraryResponse = { items: MetaTemplateLibraryItem[]; paging?: { cursors?: { after?: string } } };

const categoryOptions = [
  ["", "All categories"],
  ["UTILITY", "Utility"],
  ["MARKETING", "Marketing"],
  ["AUTHENTICATION", "Authentication"],
] as const;
const topicOptions = ["", "ACCOUNT_OR_PRODUCT_PROTECTION", "ACCOUNT_UPDATES", "AI_AGENTS", "CALL_PERMISSIONS", "CONTACT_REQUEST", "CUSTOMER_FEEDBACK", "CUSTOMER_RE_ENGAGEMENT", "EVENT_REMINDER", "FIXED_TEMPLATE_PRICE_TEST", "GROUP_INVITE_LINK", "IDENTITY_VERIFICATION", "LEGAL_REGULATORY_COMPLIANCE", "ORDER_MANAGEMENT", "PAYMENTS", "PUBLIC_ANNOUNCEMENTS", "PUBLIC_DISRUPTION", "PUBLIC_SAFETY", "PUBLIC_SERVICE", "REGULATORY_COMPLIANCE"];
const industryOptions = ["", "E_COMMERCE", "RETAIL", "FINANCIAL_SERVICES", "HEALTHCARE", "TRAVEL"];

function displayValue(value: string | null | undefined) {
  return value ? value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "—";
}

function libraryButton(value: unknown): LibraryButton {
  return value && typeof value === "object" && !Array.isArray(value) ? value as LibraryButton : {};
}

export function MetaTemplateLibrary({ workspaceId, accessToken, onAdded }: { workspaceId?: string; accessToken?: string | null; onAdded: () => void }) {
  const [search, setSearch] = useState("");
  const [language, setLanguage] = useState("en_US");
  const [category, setCategory] = useState("");
  const [topic, setTopic] = useState("");
  const [industry, setIndustry] = useState("");
  const [items, setItems] = useState<MetaTemplateLibraryItem[]>([]);
  const [selected, setSelected] = useState<MetaTemplateLibraryItem | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [buttonInputs, setButtonInputs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [addError, setAddError] = useState("");

  const loadLibrary = useCallback(async () => {
    if (!workspaceId || !accessToken) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ language, limit: "25" });
    if (search.trim()) params.set("search", search.trim());
    if (category) params.set("category", category);
    if (topic) params.set("topic", topic);
    if (industry) params.set("industry", industry);
    try {
      const result = await apiRequest<LibraryResponse>(`/workspaces/${workspaceId}/templates/library?${params.toString()}`, { headers: { authorization: `Bearer ${accessToken}` } });
      setItems(result.items);
    } catch (caughtError) {
      setItems([]);
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load Meta's template library.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, category, industry, language, search, topic, workspaceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLibrary(), search.trim() ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [loadLibrary, search]);

  const selectTemplate = (item: MetaTemplateLibraryItem) => {
    setSelected(item);
    setTemplateName(item.name);
    setButtonInputs(item.buttons.map(() => ""));
    setAddError("");
  };

  const addTemplate = async () => {
    if (!selected || !workspaceId || !accessToken || adding) return;
    setAdding(true);
    setAddError("");
    const values = buttonInputs.map((value, index) => {
      const button = libraryButton(selected.buttons[index]);
      return { type: button.type, value: value.trim() };
    }).filter((item): item is { type: "URL" | "PHONE_NUMBER"; value: string } => (item.type === "URL" || item.type === "PHONE_NUMBER") && Boolean(item.value));
    try {
      await apiRequest(`/workspaces/${workspaceId}/templates/library/add`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ libraryTemplateName: selected.name, name: templateName.trim(), language: selected.language, category: selected.category, ...(values.length ? { libraryTemplateButtonInputs: values } : {}) }),
      });
      setSelected(null);
      onAdded();
    } catch (caughtError) {
      setAddError(caughtError instanceof ApiError ? caughtError.message : "Unable to add this template to the customer WABA.");
    } finally {
      setAdding(false);
    }
  };

  const cards = useMemo(() => items.map((item) => ({ ...item, buttons: Array.isArray(item.buttons) ? item.buttons : [] })), [items]);
  const missingButtonInput = selected?.buttons.some((value, index) => {
    const button = libraryButton(value);
    return (button.type === "URL" || button.type === "PHONE_NUMBER") && !buttonInputs[index]?.trim();
  }) ?? false;
  return <>
    <section data-testid="meta-template-library" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[var(--border)] bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border-soft)] p-4">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-[var(--text-muted)]" />
          <Input aria-label="Search Meta template library" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search library templates" className="h-10 pl-9 text-[13px]" />
        </div>
        <select aria-label="Filter Meta templates by language" value={language} onChange={(event) => setLanguage(event.target.value)} className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--brand)]"><option value="en_US">English (US)</option><option value="en_GB">English (UK)</option><option value="hi">Hindi</option></select>
        <select aria-label="Filter Meta templates by category" value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--brand)]">{categoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select aria-label="Filter Meta templates by topic" value={topic} onChange={(event) => setTopic(event.target.value)} className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--brand)]">{topicOptions.map((value) => <option key={value} value={value}>{value ? displayValue(value) : "All topics"}</option>)}</select>
        <select aria-label="Filter Meta templates by industry" value={industry} onChange={(event) => setIndustry(event.target.value)} className="h-10 rounded-md border border-[var(--border)] bg-white px-3 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--brand)]">{industryOptions.map((value) => <option key={value} value={value}>{value ? displayValue(value) : "All industries"}</option>)}</select>
      </div>
      {error && <div role="alert" className="m-4 rounded-md border border-red-100 bg-red-50 px-4 py-3 text-xs text-[var(--danger)]">{error}</div>}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {loading ? <div className="flex min-h-[260px] items-center justify-center text-xs text-[var(--text-secondary)]"><LoaderCircle className="mr-2 size-4 animate-spin" />Loading Meta template library...</div> : cards.length === 0 ? <div className="flex min-h-[260px] flex-col items-center justify-center text-center text-xs text-[var(--text-secondary)]"><BookOpen className="mb-3 size-7 text-[var(--text-muted)]" />No Meta library templates match these filters.</div> : <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{cards.map((item) => <button key={`${item.id ?? item.name}-${item.language}`} type="button" onClick={() => selectTemplate(item)} className="group rounded-lg border border-[var(--border)] bg-white p-4 text-left transition-colors hover:border-[var(--brand)]/50 hover:bg-[var(--brand-soft)]/20"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-medium text-[var(--text-primary)]">{displayValue(item.name)}</div><div className="mt-1 text-[11px] text-[var(--text-muted)]">{displayValue(item.category)} · {displayValue(item.language)}</div></div><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><Plus className="size-4" /></span></div><div className="mt-3 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-[var(--text-secondary)]">{item.body || "No preview available."}</div><div className="mt-3 flex flex-wrap gap-1.5">{[item.topic, item.industry, item.usecase].filter(Boolean).map((value) => <span key={value} className="rounded-full bg-[var(--page-background)] px-2 py-1 text-[10px] text-[var(--text-muted)]">{displayValue(value)}</span>)}</div></button>)}</div>}
      </div>
    </section>
    <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      <SheetContent side="right" closeLabel="Close Meta template details" className="inset-y-0 right-0 flex h-full w-full max-w-[480px] flex-col overflow-hidden sm:max-w-[480px]">
        {selected && <><div className="flex-none border-b border-[var(--border-soft)] px-5 py-5 pr-16"><div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--brand)]"><BookOpen className="size-3.5" />Meta Template Library</div><SheetTitle className="mt-2 text-lg font-medium text-[var(--text-primary)]">{displayValue(selected.name)}</SheetTitle><SheetDescription className="mt-1 text-xs text-[var(--text-muted)]">Add this predefined template to the connected customer WABA.</SheetDescription></div><div className="min-h-0 flex-1 overflow-y-auto px-5 py-5"><div className="grid grid-cols-2 gap-4 border-b border-[var(--border-soft)] pb-5 text-xs"><div><div className="text-[11px] text-[var(--text-muted)]">Category</div><div className="mt-1 font-medium text-[var(--text-primary)]">{displayValue(selected.category)}</div></div><div><div className="text-[11px] text-[var(--text-muted)]">Language</div><div className="mt-1 font-medium text-[var(--text-primary)]">{displayValue(selected.language)}</div></div><div><div className="text-[11px] text-[var(--text-muted)]">Topic</div><div className="mt-1 font-medium text-[var(--text-primary)]">{displayValue(selected.topic)}</div></div><div><div className="text-[11px] text-[var(--text-muted)]">Industry</div><div className="mt-1 font-medium text-[var(--text-primary)]">{displayValue(selected.industry)}</div></div></div><div className="border-b border-[var(--border-soft)] py-5"><h3 className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">Message preview</h3><div className="mt-3 rounded-lg border border-[#cddbd2] bg-[#e7f0e9] p-3"><div className="rounded-lg rounded-tl-none bg-white px-3 py-2.5 text-sm leading-5 text-[#27332e] shadow-[0_1px_2px_rgba(0,0,0,.08)]">{selected.body || "No preview available."}</div></div></div><div className="space-y-4 py-5"><div><label htmlFor="library-template-name" className="text-xs font-medium text-[var(--text-primary)]">Name in your WABA</label><Input id="library-template-name" value={templateName} onChange={(event) => setTemplateName(event.target.value)} className="mt-2 h-10 text-sm" /></div>{selected.buttons.map((value, index) => { const button = libraryButton(value); const requiresInput = button.type === "URL" || button.type === "PHONE_NUMBER"; return requiresInput ? <div key={`${button.type}-${index}`}><label htmlFor={`library-button-input-${index}`} className="text-xs font-medium text-[var(--text-primary)]">{button.type === "URL" ? "Button URL" : "Button phone number"}</label><Input id={`library-button-input-${index}`} value={buttonInputs[index] ?? ""} onChange={(event) => setButtonInputs((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={button.type === "URL" ? "https://example.com" : "+91..."} className="mt-2 h-10 text-sm" /></div> : null; })}</div>{addError && <div role="alert" className="rounded-md border border-red-100 bg-red-50 px-3 py-2.5 text-xs text-[var(--danger)]">{addError}</div>}</div><div className="flex flex-none items-center justify-end gap-2 border-t border-[var(--border-soft)] bg-white px-5 py-4"><Button variant="outline" onClick={() => setSelected(null)} className="h-9 text-xs"><X className="size-3.5" />Cancel</Button><Button onClick={() => void addTemplate()} disabled={adding || !templateName.trim() || missingButtonInput} className="h-9 bg-[var(--brand)] text-xs hover:bg-[var(--brand-hover)]">{adding ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} {adding ? "Adding..." : "Add to my templates"}</Button></div></>}
      </SheetContent>
    </Sheet>
  </>;
}
