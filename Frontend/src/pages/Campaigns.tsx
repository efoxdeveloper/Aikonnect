import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileText,
  Flag,
  Megaphone,
  MessageCircle,
  MoreVertical,
  Plus,
  Search,
  Send,
  Tag,
  UserRound,
  Users,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, apiRequest } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type CampaignStatus =
  "DRAFT" | "SCHEDULED" | "RUNNING" | "COMPLETED" | "PAUSED";
type CampaignKind = "one_time" | "ongoing" | "api";
type Audience = "csv" | "manual" | "segment" | "contacts" | "all";
type LaunchMode = "draft" | "schedule" | "send";

type Campaign = {
  id: string;
  name: string;
  channel: "WhatsApp";
  kind: CampaignKind;
  createdBy: string;
  createdById: string | null;
  category: string;
  template: string;
  audience: string;
  recipientCount: number | null;
  status: CampaignStatus;
  attempted: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  repliedCount: number;
  deliveredRate: number | null;
  readRate: number | null;
  replied: number | null;
  setLiveAt: string | null;
  updatedAt: string;
};

type CampaignTemplate = {
  id: string;
  name: string;
  key: string;
  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "DELETED";
  category: string;
  language: string;
  body: string;
};
type CampaignTemplateListResponse = {
  items: CampaignTemplate[];
};
type CampaignSegment = { id: string; name: string };
type CampaignListResponse = {
  items: unknown[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean };
};
const categoryOptions = ["Marketing", "Utility", "Authentication"];
const contactVariableFields = [
  { value: "name", label: "Name" },
  { value: "phone", label: "Phone number" },
  { value: "email", label: "Email" },
  { value: "source", label: "Contact source" },
  { value: "status", label: "Contact status" },
];
const statusLabels: Record<CampaignStatus, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  RUNNING: "Sending",
  COMPLETED: "Completed",
  PAUSED: "Paused",
};
const statusClasses: Record<CampaignStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SCHEDULED: "bg-blue-50 text-blue-700",
  RUNNING: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-[var(--brand-soft)] text-[var(--brand)]",
  PAUSED: "bg-red-50 text-red-700",
};

function validStatus(value: unknown): CampaignStatus {
  return typeof value === "string" && value in statusLabels
    ? (value as CampaignStatus)
    : "DRAFT";
}
function validKind(value: unknown): CampaignKind {
  return value === "ongoing" || value === "api" ? value : "one_time";
}

function normalizeCampaign(value: unknown): Campaign | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    !("name" in value)
  )
    return null;
  const item = value as Partial<Campaign> & {
    scheduledAt?: string | null;
    templateKey?: string | null;
    templateName?: string | null;
  };
  const sent = typeof item.sent === "number" ? item.sent : 0;
  const delivered = typeof item.delivered === "number" ? item.delivered : 0;
  const read = typeof item.read === "number" ? item.read : 0;
  const failed = typeof item.failed === "number" ? item.failed : 0;
  const repliedCount = typeof item.replied === "number" ? item.replied : 0;
  return {
    id: String(item.id),
    name: String(item.name),
    channel: "WhatsApp",
    kind: validKind(item.kind),
    createdBy: item.createdBy || "You",
    createdById: typeof item.createdById === "string" ? item.createdById : null,
    category: item.category || "Marketing",
    template: item.templateName || item.template || item.templateKey || "",
    audience: item.audience || "All opted-in contacts",
    recipientCount:
      typeof item.recipientCount === "number" ? item.recipientCount : null,
    status: validStatus(item.status),
    attempted:
      typeof item.attempted === "number"
        ? item.attempted
        : typeof item.recipientCount === "number"
          ? item.recipientCount
          : 0,
    sent,
    delivered,
    read,
    failed,
    repliedCount,
    deliveredRate: sent ? Number(((delivered / sent) * 100).toFixed(0)) : null,
    readRate: sent ? Number(((read / sent) * 100).toFixed(0)) : null,
    replied: sent ? Number((((item.replied ?? 0) / sent) * 100).toFixed(0)) : null,
    setLiveAt: item.setLiveAt || item.scheduledAt || null,
    updatedAt: item.updatedAt || new Date(0).toISOString(),
  };
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(value))
    : "--";
}
function templateLabel(value: string) { return value || "--"; }
function templateVariableCount(body: string | undefined) {
  return Math.max(0, ...[...(body ?? "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1])));
}
function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium",
        statusClasses[status],
      )}
    >
      {statusLabels[status]}
    </span>
  );
}

function FilterMultiSelect({
  label,
  values,
  options,
  onChange,
  icon,
}: {
  label: string;
  values: string[];
  options: Array<{ value: string; label: string }>;
  onChange: (values: string[]) => void;
  icon: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const toggle = (value: string) =>
    onChange(
      values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value],
    );
  const displayLabel = values.length ? `${label} (${values.length})` : label;
  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={`${label} filter`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 items-center gap-1.5 rounded-md px-2 text-[13px] text-[var(--text-primary)] hover:bg-[var(--brand-soft)]"
      >
        <span className="text-[var(--text-secondary)]">{icon}</span>
        <span>{displayLabel}</span>
        <ChevronDown
          size={13}
          className={cn(
            "text-[var(--text-secondary)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={`${label} options`}
          className="absolute left-0 top-11 z-30 min-w-[190px] overflow-hidden rounded-md border border-[var(--border)] bg-white p-1.5 shadow-[0_12px_30px_rgba(31,42,55,.14)]"
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={values.includes(option.value)}
              onClick={() => toggle(option.value)}
              className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--brand-soft)]"
            >
              <span>{option.label}</span>
              {values.includes(option.value) && (
                <Check size={14} className="text-[var(--brand)]" />
              )}
            </button>
          ))}
          {values.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full border-t border-[var(--border-soft)] px-2.5 pt-2 text-left text-xs text-[var(--text-secondary)] hover:text-[var(--brand)]"
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CreateCampaignDrawer({
  open,
  canSend,
  selectedContactCount,
  selectedContactIds,
  kind,
  workspaceId,
  accessToken,
  onClose,
  onCreate,
}: {
  open: boolean;
  canSend: boolean;
  selectedContactCount: number;
  selectedContactIds: string[];
  kind: CampaignKind;
  workspaceId?: string;
  accessToken?: string | null;
  onClose: () => void;
  onCreate: (campaign: {
    name: string;
    kind: CampaignKind;
    category: string;
    templateKey: string | null;
    audienceType: Audience;
    audienceLabel: string;
    contactIds: string[];
    phoneNumbers: string[];
    launchMode: LaunchMode;
    scheduledAt: string | null;
    retryFailed: boolean;
    segmentId?: string;
    templateVariables: Array<{ source: "contact" | "custom" | "constant"; field: string; fallback: string }>;
    audienceConfig: Record<string, unknown>;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [campaignKind, setCampaignKind] = useState(kind);
  const [template, setTemplate] = useState("");
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [segments, setSegments] = useState<CampaignSegment[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const [templateLoadError, setTemplateLoadError] = useState<string | null>(
    null,
  );
  const [category, setCategory] = useState(categoryOptions[0]);
  const [variables, setVariables] = useState<Array<{ source: "" | "contact" | "custom" | "constant"; field: string; fallback: string }>>([
    { source: "", field: "", fallback: "" },
  ]);
  const [audience, setAudience] = useState<Audience>(
    selectedContactCount ? "contacts" : "all",
  );
  const [manualNumbers, setManualNumbers] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [csvNumbers, setCsvNumbers] = useState<string[]>([]);
  const [segmentId, setSegmentId] = useState("");
  const [launchMode, setLaunchMode] =
    useState<Exclude<LaunchMode, "draft">>("send");
  const [scheduledAt, setScheduledAt] = useState("");
  const [retryFailed, setRetryFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setCampaignKind(kind);
    setTemplate("");
    setCategory(categoryOptions[0]);
    setVariables([{ source: "", field: "", fallback: "" }]);
    setAudience(selectedContactCount ? "contacts" : "all");
    setManualNumbers("");
    setCsvFileName("");
    setCsvNumbers([]);
    setSegmentId("");
    setLaunchMode("send");
    setScheduledAt("");
    setRetryFailed(false);
    setError(null);
  }, [kind, open, selectedContactCount]);

  useEffect(() => {
    if (!open) return;
    if (!workspaceId || !accessToken) {
      setTemplates([]);
      setTemplateLoadError("Your workspace could not be identified.");
      return;
    }
    let active = true;
    setTemplatesLoading(true);
    setTemplateLoadError(null);
    void apiRequest<CampaignTemplateListResponse>(
      `/workspaces/${workspaceId}/templates?status=all&page=1&pageSize=100`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    )
      .then((result) => {
        if (!active) return;
        const activeTemplates = result.items.filter(
          (item) => item.status !== "DELETED",
        );
        setTemplates(activeTemplates);
        const firstApproved = activeTemplates.find(
          (item) => item.status === "APPROVED",
        );
        setTemplate(firstApproved?.key ?? "");
      })
      .catch((caughtError) => {
        if (!active) return;
        setTemplates([]);
        setTemplateLoadError(
          caughtError instanceof ApiError
            ? caughtError.message
            : "Unable to load workspace templates.",
        );
      })
      .finally(() => {
        if (active) setTemplatesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, open, workspaceId]);

  useEffect(() => {
    if (!open || !workspaceId || !accessToken) return;
    let active = true;
    setSegmentsLoading(true);
    void apiRequest<{ items: CampaignSegment[] }>(
      `/workspaces/${workspaceId}/contacts/segments?page=1&pageSize=50`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    ).then((result) => {
      if (active) setSegments(Array.isArray(result.items) ? result.items : []);
    }).catch(() => {
      if (active) setSegments([]);
    }).finally(() => {
      if (active) setSegmentsLoading(false);
    });
    return () => { active = false; };
  }, [accessToken, open, workspaceId]);

  const approvedTemplates = templates.filter(
    (item) => item.status === "APPROVED",
  );
  const selectedTemplate = templates.find((item) => item.key === template);
  const requiredVariableCount = templateVariableCount(selectedTemplate?.body);

  useEffect(() => {
    if (!template) {
      setVariables([]);
      return;
    }
    const count = templateVariableCount(templates.find((item) => item.key === template)?.body);
    setVariables((current) => Array.from({ length: count }, (_, index) => current[index] ?? { source: "", field: "", fallback: "" }));
  }, [template, templates]);

  const submit = async (action: "draft" | "live") => {
    if (!name.trim()) {
      setError("Campaign name is required.");
      return;
    }
    if (action === "live" && !canSend) {
      setError("You do not have permission to set campaigns live.");
      return;
    }
    if (action === "live" && !template) {
      setError("Choose an approved WhatsApp template.");
      return;
    }
    if (action === "live" && launchMode === "schedule" && !scheduledAt) {
      setError("Choose a date and time for this campaign.");
      return;
    }
    if (action === "live" && audience === "csv" && !csvNumbers.length) {
      setError("Choose a CSV file containing eligible phone numbers.");
      return;
    }
    if (action === "live" && audience === "manual" && !manualNumbers.trim()) {
      setError("Enter at least one phone number.");
      return;
    }
    if (audience === "segment" && !segmentId) {
      setError("Choose a saved segment.");
      return;
    }
    if (action === "live" && audience === "contacts" && !selectedContactIds.length) {
      setError("Select at least one contact.");
      return;
    }
    if (action === "live" && requiredVariableCount && (variables.length !== requiredVariableCount || variables.some((variable) => !variable.source || (!variable.field.trim() && !variable.fallback.trim())))) {
      setError("Map every template variable before setting the campaign live.");
      return;
    }
    const audienceLabel =
      audience === "contacts"
        ? `${selectedContactCount ? `Selected contacts (${selectedContactCount})` : "Contact list"}`
        : audience === "manual"
          ? "Manual numbers"
          : audience === "csv"
            ? csvFileName || "CSV upload"
            : audience === "segment"
              ? "Saved audience segment"
              : "All opted-in contacts";
    await onCreate({
      name: name.trim(),
      kind: campaignKind,
      category,
      templateKey: template || null,
      audienceType: audience,
      audienceLabel,
      contactIds: audience === "contacts" ? selectedContactIds : [],
      phoneNumbers: audience === "manual" ? manualNumbers.split(/[\n,]+/).map((number) => number.trim()).filter(Boolean) : audience === "csv" ? csvNumbers : [],
      launchMode: action === "draft" ? "draft" : launchMode,
      scheduledAt: action === "live" && launchMode === "schedule" ? new Date(scheduledAt).toISOString() : null,
      retryFailed,
      segmentId: audience === "segment" ? segmentId : undefined,
      templateVariables: variables.filter((variable) => variable.source && (variable.field.trim() || variable.fallback.trim())).map((variable) => ({ source: variable.source as "contact" | "custom" | "constant", field: variable.field.trim(), fallback: variable.fallback.trim() })),
      audienceConfig: audience === "csv" ? { csvFileName } : {},
    });
  };

  const handleCsvChange = async (file: File | undefined) => {
    setCsvFileName(file?.name ?? "");
    setCsvNumbers([]);
    if (!file) return;
    const rows = (await file.text()).split(/\r?\n/);
    const numbers = new Set<string>();
    for (const [index, row] of rows.entries()) {
      const cells = row.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
      if (index === 0 && cells.some((cell) => /phone|mobile|whatsapp/i.test(cell))) continue;
      const phone = cells.find((cell) => /^\+[1-9]\d{6,14}$/.test(cell));
      if (phone) numbers.add(phone);
      else if (cells.some(Boolean)) {
        setError(`CSV row ${index + 1} does not contain a complete E.164 phone number.`);
        return;
      }
    }
    if (!numbers.size) {
      setError("The CSV must contain at least one complete E.164 phone number.");
      return;
    }
    setError(null);
    setCsvNumbers([...numbers]);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      direction="right"
    >
      <DrawerContent className="h-full max-h-screen border-l border-[var(--border)] data-[vaul-drawer-direction=right]:!max-w-[620px]">
        <DrawerHeader className="relative flex-none border-b border-[var(--border-soft)] bg-[var(--brand-soft)]/45 pr-14">
          <DrawerTitle>Create WhatsApp Campaign</DrawerTitle>
          <DrawerCloseButton />
        </DrawerHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit("draft");
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6">
            <div>
              <h3 className="mb-2 text-sm font-medium">Campaign Name</h3>
              <label htmlFor="campaign-name" className="sr-only">
                Campaign name
              </label>
              <Input
                id="campaign-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. August product launch"
              />
            </div>
            <div>
              <label
                htmlFor="campaign-type"
                className="mb-2 block text-sm font-medium"
              >
                Campaign Type
              </label>
              <select
                id="campaign-type"
                value={campaignKind}
                onChange={(event) =>
                  setCampaignKind(event.target.value as CampaignKind)
                }
                className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--brand)]"
              >
                <option value="one_time">One Time Campaign</option>
                <option value="ongoing">Ongoing Campaign</option>
                <option value="api">API Campaign</option>
              </select>
            </div>
            <div className="border-t border-[var(--border-soft)] pt-5">
              <h3 className="mb-2 text-sm font-medium">Choose Template</h3>
              <label htmlFor="campaign-template" className="sr-only">
                WhatsApp template
              </label>
              <select
                id="campaign-template"
                value={template}
                onChange={(event) => setTemplate(event.target.value)}
                disabled={templatesLoading || Boolean(templateLoadError)}
                aria-busy={templatesLoading}
                className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--brand)] disabled:cursor-not-allowed disabled:bg-[var(--page-background)]"
              >
                <option value="">
                  {templatesLoading
                    ? "Loading workspace templates..."
                    : approvedTemplates.length
                      ? "Select an approved template"
                      : "No approved templates available"}
                </option>
                {templates.map((item) => (
                  <option
                    key={item.id}
                    value={item.key}
                    disabled={item.status !== "APPROVED"}
                  >
                    {item.name} · {item.language} · {item.status.toLowerCase()}
                  </option>
                ))}
              </select>
              {templateLoadError ? (
                <span className="mt-1.5 block text-xs text-[var(--danger)]">
                  {templateLoadError}
                </span>
              ) : (
                <span className="mt-1.5 block text-xs text-[var(--text-muted)]">
                  {approvedTemplates.length
                    ? "Only approved WhatsApp templates can be used for broadcasts."
                    : "Create and approve a WhatsApp template before setting a campaign live."}
                </span>
              )}
            </div>
            <div className="border-t border-[var(--border-soft)] pt-5">
              <h3 className="mb-3 text-sm font-medium">
                Map Template Variables
                {requiredVariableCount > 0 && (
                  <span className="ml-2 text-xs font-normal text-[var(--text-secondary)]">
                    {" "}
                    ({requiredVariableCount} required)
                  </span>
                )}
              </h3>
              {requiredVariableCount === 0 ? (
                <p className="text-xs text-[var(--text-secondary)]">This template has no body variables.</p>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[11px] font-medium text-[var(--text-secondary)]">
                    <span>Source</span>
                    <span>Field or value</span>
                    <span>Fallback value</span>
                    <span className="sr-only">Remove</span>
                    {variables.map((variable, index) => (
                      <div
                        key={index}
                        className="col-span-4 grid grid-cols-[1fr_1fr_1fr_auto] gap-2"
                      >
                        <select
                          aria-label={`Template variable source ${index + 1}`}
                          value={variable.source}
                          onChange={(event) =>
                            setVariables((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, source: event.target.value as "" | "contact" | "custom" | "constant", field: "" }
                                  : item,
                              ),
                            )
                          }
                          className="h-9 min-w-0 rounded-md border border-[var(--border)] bg-white px-2 text-xs outline-none focus:border-[var(--brand)]"
                        >
                          <option value="">Choose source</option>
                          <option value="contact">Contact</option>
                          <option value="custom">Custom field</option>
                          <option value="constant">Constant</option>
                        </select>
                        {variable.source === "contact" ? (
                          <select
                            aria-label={`Template variable field ${index + 1}`}
                            value={variable.field}
                            onChange={(event) =>
                              setVariables((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, field: event.target.value } : item))
                            }
                            className="h-9 min-w-0 rounded-md border border-[var(--border)] bg-white px-2 text-xs outline-none focus:border-[var(--brand)]"
                          >
                            <option value="">Choose contact field</option>
                            {contactVariableFields.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
                          </select>
                        ) : (
                          <Input
                            aria-label={`Template variable field ${index + 1}`}
                            value={variable.field}
                            onChange={(event) =>
                              setVariables((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, field: event.target.value } : item))
                            }
                            placeholder={variable.source === "constant" ? "Constant value" : "Custom field name"}
                            className="h-9 min-w-0 px-2 text-xs"
                          />
                        )}
                        <Input
                          aria-label={`Fallback value ${index + 1}`}
                          value={variable.fallback}
                          onChange={(event) =>
                            setVariables((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, fallback: event.target.value } : item))
                          }
                          placeholder="Optional"
                          className="h-9 min-w-0 px-2 text-xs"
                        />
                        <button
                          type="button"
                          aria-label={`Remove template variable ${index + 1}`}
                          disabled={variables.length <= requiredVariableCount}
                          onClick={() => setVariables((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                          className="size-9 rounded-md border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] disabled:opacity-40"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="border-t border-[var(--border-soft)] pt-5">
              <h3 className="mb-2 text-sm font-medium">Audience</h3>
              <select
                id="campaign-audience"
                aria-label="Audience"
                value={audience}
                onChange={(event) =>
                  setAudience(event.target.value as Audience)
                }
                className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--brand)]"
              >
                <option value="all">All opted-in contacts</option>
                <option value="csv">CSV Upload</option>
                <option value="manual">Manual Numbers</option>
                <option value="segment">Segment</option>
                <option value="contacts">
                  {selectedContactCount
                    ? `Contact List — selected (${selectedContactCount})`
                    : "Contact List"}
                </option>
              </select>
              {audience === "csv" && (
                <div className="mt-3">
                  <label
                    htmlFor="campaign-csv"
                    className="mb-2 block text-xs font-medium"
                  >
                    Upload CSV
                  </label>
                  <Input
                    id="campaign-csv"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => void handleCsvChange(event.target.files?.[0])}
                    className="h-10 pt-2 text-xs"
                  />
                </div>
              )}
              {audience === "manual" && (
                <div className="mt-3">
                  <label
                    htmlFor="campaign-manual-numbers"
                    className="mb-2 block text-xs font-medium"
                  >
                    Phone numbers
                  </label>
                  <textarea
                    id="campaign-manual-numbers"
                    value={manualNumbers}
                    onChange={(event) => setManualNumbers(event.target.value)}
                    placeholder="+919876543210, +919876543211"
                    className="min-h-24 w-full resize-y rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
                  />
                </div>
              )}
              {audience === "segment" && (
                <div className="mt-3">
                  <label
                    htmlFor="campaign-segment"
                    className="mb-2 block text-xs font-medium"
                  >
                    Choose segment
                  </label>
                  <select
                    id="campaign-segment"
                    value={segmentId}
                    onChange={(event) => setSegmentId(event.target.value)}
                    disabled={segmentsLoading}
                    className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--brand)]"
                  >
                    <option value="">{segmentsLoading ? "Loading segments..." : "Choose a segment"}</option>
                    {segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}
                  </select>
                </div>
              )}
              {audience === "contacts" && (
                <div className="mt-3">
                  <label
                    htmlFor="campaign-contact-list"
                    className="mb-2 block text-xs font-medium"
                  >
                    Choose contact list
                  </label>
                  <select
                    id="campaign-contact-list"
                    className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--brand)]"
                  >
                    <option>Primary contact list</option>
                    <option>Recent imports</option>
                  </select>
                </div>
              )}
              <span className="mt-1.5 block text-xs text-[var(--text-muted)]">
                Contacts who have opted out or are blocked from marketing are
                excluded automatically.
              </span>
            </div>
            <div className="border-t border-[var(--border-soft)] pt-5">
              <h3 className="mb-2 text-sm font-medium">Schedule</h3>
              <select
                id="campaign-launch"
                aria-label="Schedule"
                value={launchMode}
                onChange={(event) =>
                  setLaunchMode(
                    event.target.value as Exclude<LaunchMode, "draft">,
                  )
                }
                className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none focus:border-[var(--brand)]"
              >
                <option value="send">Send Now</option>
                <option value="schedule">Schedule Date &amp; Time</option>
              </select>
              {launchMode === "schedule" && (
                <div className="mt-3">
                  <label
                    htmlFor="campaign-schedule"
                    className="mb-2 block text-xs font-medium"
                  >
                    Schedule Date &amp; Time
                  </label>
                  <Input
                    id="campaign-schedule"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                  />
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                id="retry-failed-messages"
                type="checkbox"
                checked={retryFailed}
                onChange={(event) => setRetryFailed(event.target.checked)}
                className="size-4 accent-[var(--brand)]"
              />
              Retry Failed Messages
            </label>
            <div className="rounded-md border border-[var(--border-soft)] bg-[var(--page-background)] p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Users size={16} className="text-[var(--brand)]" />
                Audience safety check
              </div>
              <div className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                Marketing consent is checked again before a campaign is set
                live.
              </div>
            </div>
            {error && (
              <div
                role="alert"
                className="rounded-md bg-red-50 px-3 py-2 text-sm"
              >
                {error}
              </div>
            )}
          </div>
          <DrawerFooter className="flex-none border-t border-[var(--border-soft)] bg-white sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-md border border-[var(--border)] bg-white px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--brand-soft)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => submit("draft")}
              className="h-10 rounded-md border border-[var(--border)] bg-white px-4 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand-soft)]"
            >
              Save Draft
            </button>
            <button
              type="button"
              disabled={!canSend}
              onClick={() => submit("live")}
              className="flex h-10 items-center justify-center rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Set Live
              <Send size={14} className="ml-1.5" />
            </button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

export function Campaigns() {
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();
  const membership = getActiveMembership(user);
  const workspaceId = membership?.workspace.id;
  const permissions = membership?.role.permissions ?? [];
  const canRead = permissions.includes("campaigns.read");
  const canCreate = permissions.includes("campaigns.create");
  const canSend = permissions.includes("campaigns.send");
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedContactCount = (searchParams.get("contactIds") ?? "")
    .split(",")
    .filter(Boolean).length;
  const selectedContactIds = (searchParams.get("contactIds") ?? "").split(",").filter(Boolean);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [totalCampaigns, setTotalCampaigns] = useState(0);
  const [hasCampaigns, setHasCampaigns] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CampaignStatus[]>([]);
  const [category, setCategory] = useState<string[]>([]);
  const [creator, setCreator] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<string[]>([]);
  const [kind, setKind] = useState<CampaignKind>("one_time");
  const [createOpen, setCreateOpen] = useState(
    selectedContactCount > 0 && canCreate,
  );
  const loadCampaigns = useCallback(async () => {
    if (!workspaceId || !accessToken || !canRead) { setCampaigns([]); setTotalCampaigns(0); setHasCampaigns(false); setLoading(false); return; }
    setLoading(true); setError("");
    const query = new URLSearchParams({ page: "1", pageSize: "100", kind });
    if (search.trim()) query.set("search", search.trim());
    if (status.length) query.set("status", status.join(","));
    if (category.length) query.set("category", category[0] as string);
    if (creator.length) query.set("createdById", creator[0] as string);
    if (dateFilter.length === 1) query.set("hasSetLive", dateFilter[0] === "SET" ? "true" : "false");
    try {
      const result = await apiRequest<CampaignListResponse>(`/workspaces/${workspaceId}/campaigns?${query.toString()}`, { headers: { authorization: `Bearer ${accessToken}` } });
      setCampaigns(result.items.map(normalizeCampaign).filter((item): item is Campaign => item !== null));
      setTotalCampaigns(result.pagination.total);
      if (result.pagination.total > 0) setHasCampaigns(true);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load campaigns.");
    } finally { setLoading(false); }
  }, [accessToken, canRead, category, creator, dateFilter, kind, search, status, workspaceId]);
  useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);
  const creators = useMemo(
    () => [...new Map(campaigns.map((campaign) => [campaign.createdById ?? campaign.createdBy, { value: campaign.createdById ?? campaign.createdBy, label: campaign.createdBy }])).values()],
    [campaigns],
  );
  const kindCampaigns = totalCampaigns;
  const filteredCampaigns = campaigns;
  if (!membership || !canRead)
    return (
      <div className="flex h-full items-center justify-center bg-[var(--page-background)] p-6">
        <section className="max-w-md rounded-lg border border-[var(--border)] bg-white p-8 text-center shadow-[0_3px_12px_rgba(30,40,55,.045)]">
          <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-red-50 text-[var(--danger)]">
            <Megaphone size={20} />
          </div>
          <h1 className="mt-4 text-lg font-medium">
            Campaign access is restricted
          </h1>
          <div className="mt-2 text-sm text-[var(--text-secondary)]">
            You do not have permission to view campaigns in this workspace.
          </div>
        </section>
      </div>
    );
  const createCampaign = async (campaign: {
    name: string; kind: CampaignKind; category: string; templateKey: string | null; audienceType: Audience;
    audienceLabel: string; contactIds: string[]; phoneNumbers: string[]; launchMode: LaunchMode; scheduledAt: string | null; retryFailed: boolean; segmentId?: string; templateVariables: Array<{ source: "contact" | "custom" | "constant"; field: string; fallback: string }>; audienceConfig: Record<string, unknown>;
  }) => {
    if (!workspaceId || !accessToken) return;
    try {
      await apiRequest(`/workspaces/${workspaceId}/campaigns`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify(campaign) });
      await loadCampaigns();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Campaign could not be created.");
      throw caughtError;
    }
    setCreateOpen(false);
    setSearchParams({}, { replace: true });
  };
  const downloadReport = (campaign: Campaign) => {
    const escapeCsvValue = (value: string | number) =>
      `"${String(value).replaceAll('"', '""')}"`;
    const report = [
      [
        "Campaign Name",
        "Channel",
        "Created By",
        "Category",
        "Status",
        "Attempted",
        "Sent",
        "Delivered",
        "Read",
        "Replied",
        "Set Live",
      ],
      [
        campaign.name,
        campaign.channel,
        campaign.createdBy,
        campaign.category,
        statusLabels[campaign.status],
        campaign.attempted,
        campaign.sent,
        campaign.delivered,
        campaign.read,
        campaign.repliedCount,
        formatDate(campaign.setLiveAt),
      ],
    ]
      .map((row) => row.map(escapeCsvValue).join(","))
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([report], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${campaign.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "campaign"}-report.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };
  const duplicateCampaign = async (campaign: Campaign) => {
    if (!canCreate || !workspaceId || !accessToken) return;
    try {
      await apiRequest(`/workspaces/${workspaceId}/campaigns/${campaign.id}/duplicate`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` } });
      await loadCampaigns();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Campaign could not be duplicated.");
    }
  };
  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-white"
      data-testid="campaign-page"
    >
      <div
        className="flex-none border-b border-[var(--border)] bg-white"
        data-testid="campaign-page-header"
      >
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--brand-hover)] text-white">
              <Megaphone size={19} />
            </div>
            <div>
              <h1 className="text-[18px] font-medium leading-6 text-[var(--text-primary)]">
                Campaigns
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                <span>Account Status:</span>
                <span className="inline-flex items-center gap-1.5 rounded bg-[var(--brand-soft)] px-2.5 py-1 font-medium text-[var(--success)]">
                  <span className="size-2 rounded-full bg-[var(--success)]" />
                  Healthy
                </span>
                <span className="mx-0.5 h-5 w-px bg-[var(--border)]" />
                <a
                  href="/account-settings"
                  className="text-[var(--brand-hover)] underline underline-offset-2"
                >
                  Notifications limit
                </a>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCreate && (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="flex h-10 items-center rounded-md bg-[var(--brand)] px-4 text-[15px] font-medium text-white hover:bg-[var(--brand-hover)]"
              >
                <MessageCircle size={18} className="mr-2" />
                Create WhatsApp Campaign
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col px-4 pb-5 pt-4 sm:px-6 lg:px-8">
        <div
          className="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--border)] pb-3"
          data-testid="campaign-filter-toolbar"
        >
          <div className="relative flex h-10 w-full max-w-[280px] items-center rounded-md border border-[var(--border)] bg-white">
            <Search className="ml-2.5 size-4 text-[var(--text-primary)]" />
            <Input
              aria-label="Search campaigns"
              maxLength={200}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name"
              className="h-9 border-0 pl-2 pr-0 shadow-none focus-visible:ring-0"
            />
            <span className="mr-2 shrink-0 border-l border-[var(--border-soft)] pl-2 text-xs text-[var(--brand)]">
              {search.length}/200
            </span>
          </div>
          <div className="flex h-10 items-center rounded-md bg-[var(--brand-soft)] px-2.5 text-[13px] font-medium text-[var(--brand-hover)]">
            <MessageCircle size={15} className="mr-1.5" />
            WhatsApp
            <ChevronDown size={13} className="ml-1.5" />
          </div>
          <FilterMultiSelect
            label="Status"
            values={status}
            onChange={(value) => setStatus(value as CampaignStatus[])}
            options={Object.entries(statusLabels).map(([value, label]) => ({
              value,
              label,
            }))}
            icon={<Flag size={15} />}
          />
          <FilterMultiSelect
            label="Category"
            values={category}
            onChange={setCategory}
            options={categoryOptions.map((option) => ({
              value: option,
              label: option,
            }))}
            icon={<Tag size={15} />}
          />
          <FilterMultiSelect
            label="Created by"
            values={creator}
            onChange={setCreator}
            options={creators}
            icon={<UserRound size={15} />}
          />
          <FilterMultiSelect
            label="Date Set Live"
            values={dateFilter}
            onChange={setDateFilter}
            options={[
              { value: "SET", label: "Set live" },
              { value: "UNSET", label: "Not set live" },
            ]}
            icon={<CalendarDays size={15} />}
          />
        </div>
        <div
          className="mt-3 flex flex-none border border-[var(--border)]"
          role="tablist"
          aria-label="Campaign type"
        >
          <button
            type="button"
            role="tab"
            aria-selected={kind === "one_time"}
            onClick={() => setKind("one_time")}
            className={cn(
              "h-[51px] flex-1 border-b-2 px-4 text-sm",
              kind === "one_time"
                ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
                : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--page-background)]",
            )}
          >
            One Time Campaigns
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === "ongoing"}
            onClick={() => setKind("ongoing")}
            className={cn(
              "h-[51px] flex-1 border-b-2 px-4 text-sm",
              kind === "ongoing"
                ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
                : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--page-background)]",
            )}
          >
            Ongoing Campaigns
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === "api"}
            onClick={() => setKind("api")}
            className={cn(
              "h-[51px] flex-1 border-b-2 px-4 text-sm",
              kind === "api"
                ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
                : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--page-background)]",
            )}
          >
            API campaigns
          </button>
        </div>
        {error && <div role="alert" className="mt-3 flex-none rounded-md border border-red-100 bg-red-50 px-4 py-3 text-xs text-[var(--danger)]">{error}</div>}
        <section
          className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[var(--border)] bg-white"
          data-testid="campaign-table-panel"
        >
          <div
            className="min-h-0 flex-1 overflow-auto"
            data-testid="campaign-table-scroll-region"
          >
            <table className="campaign-data-table w-full min-w-[1180px] border-collapse text-left">
              <thead className="sticky top-0 z-10 border-b border-[var(--border-soft)] bg-[var(--table-header)] shadow-[inset_0_-1px_0_var(--border-soft)]">
                <tr>
                  {[
                    "Campaign Name",
                    "Channel",
                    "Created By",
                    "Category",
                    "Status",
                    "Attempted",
                    "Sent",
                    "Delivered %",
                    "Read %",
                    "Replied %",
                    "Set Live",
                  ].map((heading) => (
                    <th key={heading} className="px-3 py-4 first:pl-4">
                      <h3>{heading}</h3>
                    </th>
                  ))}
                  <th className="w-12 px-3 py-4">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={12} className="p-12 text-center text-xs text-[var(--text-secondary)]">Loading campaigns…</td></tr> : filteredCampaigns.map((campaign) => (
                  <tr
                    key={campaign.id}
                    className="cursor-pointer border-b border-[var(--border-soft)] text-sm text-[var(--text-primary)] hover:bg-[var(--brand-soft)] focus-within:bg-[var(--brand-soft)]"
                    onClick={() => navigate(`/campaigns/${encodeURIComponent(campaign.id)}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigate(`/campaigns/${encodeURIComponent(campaign.id)}`);
                      }
                    }}
                    tabIndex={0}
                  >
                    <td className="max-w-[230px] px-4 py-4">
                      <div className="truncate font-medium">
                        {campaign.name}
                      </div>
                      <div className="mt-1 truncate text-xs text-[var(--text-secondary)]">
                        {templateLabel(campaign.template)}
                      </div>
                    </td>
                    <td className="px-3 py-4">{campaign.channel}</td>
                    <td className="whitespace-nowrap px-3 py-4">
                      {campaign.createdBy}
                    </td>
                    <td className="px-3 py-4">{campaign.category}</td>
                    <td className="px-3 py-4">
                      <CampaignStatusBadge status={campaign.status} />
                    </td>
                    <td className="px-3 py-4">{campaign.attempted || "--"}</td>
                    <td className="px-3 py-4">{campaign.sent || "--"}</td>
                    <td className="px-3 py-4">
                      {campaign.deliveredRate === null
                        ? "--"
                        : `${campaign.deliveredRate}%`}
                    </td>
                    <td className="px-3 py-4">
                      {campaign.readRate === null
                        ? "--"
                        : `${campaign.readRate}%`}
                    </td>
                    <td className="px-3 py-4">
                      {campaign.replied === null
                        ? "--"
                        : `${campaign.replied}%`}
                    </td>
                    <td className="px-3 py-4">
                      {formatDate(campaign.setLiveAt)}
                    </td>
                    <td className="px-3 py-4">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Campaign actions for ${campaign.name}`}
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                            className="flex size-8 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"
                          >
                            <MoreVertical size={16} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            onSelect={() => downloadReport(campaign)}
                            className="text-xs"
                          >
                            <Download className="size-4" />
                            Download report
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!canCreate}
                            onSelect={() => duplicateCampaign(campaign)}
                            className="text-xs"
                          >
                            <Copy className="size-4" />
                            Duplicate campaign
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && filteredCampaigns.length === 0 && (
              <div className="flex min-h-[260px] items-center justify-center px-6 py-14 text-center">
                <div>
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
                    <Megaphone size={21} />
                  </div>
                  <h3 className="mt-4 text-[15px] font-medium">
                    {hasCampaigns
                      ? "No campaigns match your filters"
                      : "No campaigns yet"}
                  </h3>
                  <div className="mx-auto mt-1.5 max-w-[390px] text-sm text-[var(--text-secondary)]">
                    {hasCampaigns
                      ? "Try a different search or filter."
                      : "Create your first WhatsApp broadcast to start engaging opted-in contacts."}
                  </div>
                  {!hasCampaigns && canCreate && (
                    <button
                      type="button"
                      onClick={() => setCreateOpen(true)}
                      className="mt-5 inline-flex h-9 items-center rounded-md bg-[var(--brand)] px-3.5 text-xs font-medium text-white"
                    >
                      <Plus size={15} className="mr-1.5" />
                      Create WhatsApp Campaign
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-none items-center justify-between border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--text-primary)]">
            <strong>
              {filteredCampaigns.length} out of {kindCampaigns} Campaigns
            </strong>
            <span className="text-[var(--text-secondary)]">
              WhatsApp campaigns are checked for consent before sending.
            </span>
          </div>
        </section>
      </div>
      <CreateCampaignDrawer
        open={createOpen}
        canSend={canSend}
        selectedContactCount={selectedContactCount}
        selectedContactIds={selectedContactIds}
        kind={kind}
        workspaceId={workspaceId}
        accessToken={accessToken}
        onClose={() => {
          setCreateOpen(false);
          setSearchParams({}, { replace: true });
        }}
        onCreate={createCampaign}
      />
    </div>
  );
}
