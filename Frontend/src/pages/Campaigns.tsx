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
  Ban,
  Check,
  ChevronDown,
  Copy,
  Download,
  FileText,
  Flag,
  Megaphone,
  MoreVertical,
  Plus,
  Pause,
  Play,
  Search,
  Send,
  Tag,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/whatsapp/WhatsAppIcon";
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
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

type CampaignStatus =
  "DRAFT" | "SCHEDULED" | "RUNNING" | "COMPLETED" | "PAUSED" | "CANCELLED";
type CampaignKind = "one_time" | "ongoing" | "api";
type Audience = "csv" | "manual" | "segment" | "contacts" | "all";
type LaunchMode = "draft" | "schedule" | "send";
type CampaignPayload = {
  name: string; kind: CampaignKind; category: string; templateKey: string | null; audienceType: Audience;
  audienceLabel: string; contactIds: string[]; phoneNumbers: string[]; launchMode: LaunchMode; scheduledAt: string | null;
  retryFailed: boolean; segmentId?: string; templateVariables: Array<{ source: "contact" | "custom" | "constant"; field: string; fallback: string }>;
  audienceConfig: Record<string, unknown>;
};
type CampaignEstimate = {
  recipientCount: number; excludedCount: number; currency: string; estimatedWalletCost: string; estimatedMetaCost: string;
  availableBalance: string; projectedBalance: string; canCoverEstimate: boolean; pricingBasis: string;
  countries: Array<{ countryCode: string; countryName: string; recipients: number; estimatedWalletCost: string; estimatedMetaCost: string }>;
};

function formatCampaignMoney(currency: string, amount: string | number) {
  const value = Number(amount);
  return `${currency} ${Number.isFinite(value) ? value.toFixed(2) : "0.00"}`;
}

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
  totalCost: number | null;
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
  headerText?: string | null;
  headerFileName?: string | null;
  footer?: string | null;
  templateType?: "standard" | "carousel" | "limited" | "multi-product" | string;
  headerType?: "none" | "text" | "image" | "video" | "doc" | "location" | string;
  content?: { carouselCards?: unknown[]; buttons?: string[]; buttonTexts?: Record<string, string> } | null;
};
type CampaignMediaItem = { mediaId: string; type: "image" | "video" | "document"; fileName?: string };
type CampaignTemplateMedia = { kind: "single" | "carousel"; items: CampaignMediaItem[] };
type CampaignTemplateListResponse = {
  items: CampaignTemplate[];
};
type CampaignSegment = { id: string; name: string };

function CampaignWhatsAppPreview({ template, variables, media }: { template: CampaignTemplate; variables: Array<{ source: "" | "contact" | "custom" | "constant"; field: string; fallback: string }>; media: CampaignTemplateMedia | null }) {
  const sampleVariable = (index: number) => {
    const variable = variables[index - 1];
    if (!variable?.source) return `Sample ${index}`;
    if (variable.source === "constant") return variable.field || variable.fallback || `Sample ${index}`;
    if (variable.source === "contact") {
      if (variable.field === "name") return variable.fallback || "Ananya Sharma";
      if (variable.field === "phone") return variable.fallback || "+91 98765 43210";
      return variable.fallback || `Sample ${variable.field || "contact value"}`;
    }
    return variable.fallback || `Sample ${variable.field || "custom value"}`;
  };
  const renderVariables = (value: string | null | undefined) => (value ?? "").replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, number: string) => sampleVariable(Number(number)));
  const renderBody = (value: string) => renderVariables(value).split(/(https?:\/\/[^\s]+)/g).map((part, index) => /^https?:\/\//.test(part) ? <span key={index} className="text-[#168b77] underline underline-offset-2">{part}</span> : <span key={index}>{part}</span>);
  const buttonLabels = (template.content?.buttons ?? []).map((button) => template.content?.buttonTexts?.[button] || button.replaceAll("-", " "));
  const mediaName = media?.items[0]?.fileName || template.headerFileName;

  return (
    <section aria-label="WhatsApp message preview" className="border-t border-[var(--border-soft)] pt-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">WhatsApp preview</h3>
        <span className="text-[11px] text-[var(--text-muted)]">Sample values</span>
      </div>
      <div className="mx-auto min-h-[190px] w-full max-w-[360px] space-y-2 rounded-md border border-[#e6ddcf] bg-[#f5f0e6] p-3" style={{ backgroundImage: "radial-gradient(circle at 12px 14px, transparent 5px, rgba(196,178,150,.16) 5.5px, transparent 6.5px), radial-gradient(circle at 35px 34px, transparent 8px, rgba(196,178,150,.12) 8.5px, transparent 9.5px), radial-gradient(rgba(196,178,150,.14) .8px, transparent 1px)", backgroundSize: "48px 48px, 64px 64px, 18px 18px" }}>
        <div data-testid="campaign-template-preview-message" className="w-fit max-w-[90%] whitespace-pre-wrap rounded-lg rounded-tl-none bg-white px-3 py-2.5 text-[13px] leading-[1.5] text-[#27332e] shadow-[0_1px_2px_rgba(0,0,0,.12)]">
          {template.headerType && template.headerType !== "none" && <div className="mb-1.5 rounded bg-[#eef4f0] px-2 py-1 text-[11px] font-medium text-[#597067]">{template.headerType === "text" ? renderVariables(template.headerText) : <span>{template.headerType.toUpperCase()} header{mediaName ? ` · ${mediaName}` : ""}</span>}</div>}
          <div>{template.body ? renderBody(template.body) : "Your template message will appear here."}</div>
          {template.footer && <div className="mt-2 text-[10px] text-[#84918a]">{renderVariables(template.footer)}</div>}
          <div className="mt-1 text-right text-[9px] text-[#84918a]">9:41 AM</div>
        </div>
        {template.templateType === "carousel" && Array.from({ length: Math.max(1, template.content?.carouselCards?.length ?? 1) }, (_, index) => <div key={index} className="max-w-[82%] overflow-hidden rounded-lg bg-white text-[11px] text-[#27332e] shadow-[0_1px_2px_rgba(0,0,0,.12)]"><div className="flex h-14 items-center justify-center bg-[#dbe6df] text-[#617269]">{media?.items[index]?.fileName ?? `Card ${index + 1} media`}</div><div className="px-2 py-1.5">Carousel card {index + 1}</div></div>)}
        {buttonLabels.map((label, index) => <div key={`${label}-${index}`} className="max-w-[94%] rounded-md bg-white px-3 py-2 text-center text-[11px] font-medium capitalize text-[#147f78] shadow-[0_1px_2px_rgba(0,0,0,.12)]">{label}</div>)}
      </div>
      <p className="mt-2 text-[11px] leading-4 text-[var(--text-muted)]">Variable values are examples. Each recipient sees values from their contact record or your fallback.</p>
    </section>
  );
}

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
  CANCELLED: "Cancelled",
};
const statusClasses: Record<CampaignStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SCHEDULED: "bg-blue-50 text-blue-700",
  RUNNING: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-[var(--brand-soft)] text-[var(--brand)]",
  PAUSED: "bg-red-50 text-red-700",
  CANCELLED: "bg-red-50 text-red-700",
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
    totalCost: typeof item.totalCost === "number" && Number.isFinite(item.totalCost) ? item.totalCost : null,
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
        className={cn(
          "flex h-10 items-center gap-1.5 rounded-md border px-2 text-[13px] transition-colors",
          values.length || open
            ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-hover)] hover:bg-[var(--brand-soft)]"
            : "border-[var(--border)] bg-white text-[var(--text-primary)] hover:bg-[#f7f8f7]",
        )}
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
  initialTemplateKey,
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
  initialTemplateKey?: string | null;
  kind: CampaignKind;
  workspaceId?: string;
  accessToken?: string | null;
  onClose: () => void;
  onCreate: (campaign: CampaignPayload) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [campaignKind, setCampaignKind] = useState(kind);
  const [template, setTemplate] = useState("");
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const templatePickerRef = useRef<HTMLDivElement>(null);
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
  const scheduleInputRef = useRef<HTMLInputElement>(null);
  const [retryFailed, setRetryFailed] = useState(false);
  const [templateMedia, setTemplateMedia] = useState<CampaignTemplateMedia | null>(null);
  const [mediaUploading, setMediaUploading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<CampaignEstimate | null>(null);
  const [reviewPayload, setReviewPayload] = useState<CampaignPayload | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setCampaignKind(kind);
    setTemplate("");
    setTemplateMenuOpen(false);
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
    setTemplateMedia(null);
    setMediaUploading(null);
    setError(null);
    setEstimate(null);
    setReviewPayload(null);
    setEstimating(false);
    setLaunching(false);
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
        const requestedTemplate = activeTemplates.find(
          (item) => item.key === initialTemplateKey && item.status === "APPROVED",
        );
        setTemplate(requestedTemplate?.key ?? firstApproved?.key ?? "");
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
  }, [accessToken, initialTemplateKey, open, workspaceId]);

  useEffect(() => {
    if (!templateMenuOpen) return;
    const closeWhenOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && !templatePickerRef.current?.contains(event.target)) {
        setTemplateMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", closeWhenOutside);
    return () => document.removeEventListener("mousedown", closeWhenOutside);
  }, [templateMenuOpen]);

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
  const carouselTemplate = selectedTemplate?.templateType === "carousel";
  const mediaHeaderType = selectedTemplate?.headerType === "image" || selectedTemplate?.headerType === "video" || selectedTemplate?.headerType === "doc"
    ? selectedTemplate.headerType
    : null;
  const mediaRequired = Boolean(mediaHeaderType || carouselTemplate);
  const mediaSlotCount = carouselTemplate
    ? Math.max(1, Math.min(10, selectedTemplate?.content?.carouselCards?.length ?? 1))
    : mediaRequired ? 1 : 0;

  useEffect(() => {
    if (!template) {
      setVariables([]);
      return;
    }
    const count = templateVariableCount(templates.find((item) => item.key === template)?.body);
    setVariables((current) => Array.from({ length: count }, (_, index) => current[index] ?? { source: "", field: "", fallback: "" }));
  }, [template, templates]);

  useEffect(() => {
    setTemplateMedia(null);
    setMediaUploading(null);
  }, [template]);

  const handleCampaignMediaChange = async (file: File | undefined, index: number) => {
    if (!file || !workspaceId || !accessToken) return;
    setError(null);
    setMediaUploading(index);
    try {
      const uploaded = await apiRequest<{ mediaId?: string; type?: CampaignMediaItem["type"]; fileName?: string }>(`/workspaces/${workspaceId}/campaigns/media`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/octet-stream",
          "x-file-type": file.type,
          "x-file-name": file.name,
        },
        body: await file.arrayBuffer(),
      });
      if (!uploaded?.mediaId) throw new Error("Meta did not return a media ID for the selected campaign media.");
      const item: CampaignMediaItem = { mediaId: uploaded.mediaId, type: uploaded.type ?? (file.type.startsWith("video/") ? "video" : file.type.startsWith("application/") ? "document" : "image"), fileName: uploaded.fileName ?? file.name };
      setTemplateMedia((current) => {
        const kind = carouselTemplate ? "carousel" : "single";
        const items = [...(current?.items ?? [])];
        items[index] = item;
        return { kind, items: items.filter(Boolean) };
      });
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Campaign media could not be uploaded.");
    } finally {
      setMediaUploading(null);
    }
  };

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
    if (action === "live" && mediaRequired && (!templateMedia || templateMedia.items.length < mediaSlotCount)) {
      setError(carouselTemplate ? "Upload one media item for every carousel card." : "Upload the image or media required by this template.");
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
    const payload: CampaignPayload = {
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
      audienceConfig: {
        ...(audience === "csv" ? { csvFileName } : {}),
        ...(templateMedia ? { templateMedia } : {}),
      },
    };
    if (action === "draft") {
      await onCreate(payload);
      return;
    }
    if (!workspaceId || !accessToken) {
      setError("Your workspace session expired. Refresh the page and try again.");
      return;
    }
    setEstimating(true);
    setError(null);
    try {
      const result = await apiRequest<CampaignEstimate>(`/workspaces/${workspaceId}/campaigns/estimate`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(payload),
      });
      setEstimate(result);
      setReviewPayload(payload);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Campaign cost could not be estimated.");
    } finally {
      setEstimating(false);
    }
  };

  const confirmLaunch = async () => {
    if (!reviewPayload) return;
    setLaunching(true);
    setError(null);
    try {
      await onCreate(reviewPayload);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Campaign could not be launched. Review it and try again.");
    } finally {
      setLaunching(false);
    }
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
          <DrawerTitle>{reviewPayload ? "Review campaign" : "Create WhatsApp Campaign"}</DrawerTitle>
          <DrawerCloseButton />
        </DrawerHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit("draft");
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div
            data-testid="campaign-drawer-body"
            className="min-h-0 flex-1 overflow-y-auto !select-text px-6 py-6"
          >
            {reviewPayload && estimate ? (
              <div className="space-y-5">
                <section className="rounded-lg border border-[var(--border)] bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{reviewPayload.name}</h3>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">{reviewPayload.templateKey} · {reviewPayload.category} · {reviewPayload.launchMode === "schedule" ? `Scheduled for ${new Date(reviewPayload.scheduledAt ?? "").toLocaleString()}` : "Send now"}</p>
                    </div>
                    <span className="rounded-full bg-[var(--brand-soft)] px-2.5 py-1 text-xs font-medium text-[var(--brand)]">{estimate.recipientCount} recipients</span>
                  </div>
                  {estimate.excludedCount > 0 && <p className="mt-3 border-t border-[var(--border-soft)] pt-3 text-xs text-[var(--text-secondary)]">{estimate.excludedCount} contacts excluded because they are not eligible for WhatsApp marketing.</p>}
                </section>
                <section className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
                  <div className="border-b border-[var(--border-soft)] px-4 py-3 text-sm font-semibold">Estimated cost by recipient country</div>
                  <div className="divide-y divide-[var(--border-soft)]">
                    {estimate.countries.map((country) => <div key={country.countryCode} className="flex items-center justify-between gap-4 px-4 py-3 text-sm"><div><div className="font-medium">{country.countryName}</div><div className="mt-0.5 text-xs text-[var(--text-secondary)]">{country.recipients} messages · {country.countryCode}</div></div><div className="text-right"><div className="font-medium">{formatCampaignMoney(estimate.currency, country.estimatedWalletCost)}</div><div className="mt-0.5 text-xs text-[var(--text-muted)]">estimated wallet debit</div></div></div>)}
                  </div>
                  <div className="space-y-2 border-t border-[var(--border-soft)] bg-[var(--page-background)] px-4 py-3 text-sm">
                    <div className="flex justify-between"><span>Estimated wallet debit</span><strong>{formatCampaignMoney(estimate.currency, estimate.estimatedWalletCost)}</strong></div>
                    <div className="flex justify-between text-[var(--text-secondary)]"><span>Available now</span><span>{formatCampaignMoney(estimate.currency, estimate.availableBalance)}</span></div>
                    <div className="flex justify-between text-[var(--text-secondary)]"><span>Projected available balance</span><span>{formatCampaignMoney(estimate.currency, estimate.projectedBalance)}</span></div>
                  </div>
                </section>
                {!estimate.canCoverEstimate && Number(estimate.estimatedWalletCost) > 0 && <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">Available wallet funds don’t cover this campaign’s estimated cost. Add funds before launching.</div>}
                <p className="text-xs leading-5 text-[var(--text-secondary)]">Estimated cost assumes 100% delivery to eligible recipients. You are charged only for messages successfully delivered. {estimate.pricingBasis} Rates are checked again when messages are sent.</p>
                {error && <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm">{error}</div>}
              </div>
            ) : (
            <div className="space-y-6">
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
              <div ref={templatePickerRef} className="relative">
                <button
                  id="campaign-template"
                  type="button"
                  role="combobox"
                  aria-label="WhatsApp template"
                  aria-haspopup="listbox"
                  aria-expanded={templateMenuOpen}
                  aria-busy={templatesLoading}
                  disabled={templatesLoading || Boolean(templateLoadError)}
                  onClick={() => setTemplateMenuOpen((current) => !current)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setTemplateMenuOpen(true);
                    }
                  }}
                  className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm outline-none transition-colors focus:border-[var(--brand)] disabled:cursor-not-allowed disabled:bg-[var(--page-background)]"
                >
                  {selectedTemplate ? (
                    <span className="flex min-w-0 flex-1 flex-col items-start text-left leading-4">
                      <span className="max-w-full truncate font-medium text-[var(--text-primary)]">
                        {selectedTemplate.name}
                      </span>
                      <span data-testid="selected-template-category" className="max-w-full truncate text-xs font-normal text-[var(--text-muted)]">
                        {selectedTemplate.category} · {selectedTemplate.language}
                      </span>
                    </span>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-left text-[var(--text-muted)]">
                      {templatesLoading
                        ? "Loading workspace templates..."
                        : approvedTemplates.length
                          ? "Select an approved template"
                          : "No approved templates available"}
                    </span>
                  )}
                  <ChevronDown size={16} className={cn("shrink-0 text-[var(--text-muted)] transition-transform", templateMenuOpen && "rotate-180")} />
                </button>
                {templateMenuOpen && (
                  <div
                    role="listbox"
                    aria-label="WhatsApp templates"
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setTemplateMenuOpen(false);
                        (event.currentTarget.parentElement?.querySelector("[role=combobox]") as HTMLButtonElement | null)?.focus();
                      }
                    }}
                    className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-[var(--border)] bg-white p-1 shadow-[0_10px_30px_rgba(4,45,29,.10)]"
                  >
                    {templates.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={item.key === template}
                        disabled={item.status !== "APPROVED"}
                        onClick={() => {
                          setTemplate(item.key);
                          setTemplateMenuOpen(false);
                        }}
                        className="flex min-h-12 w-full items-center rounded px-3 py-1.5 text-left hover:bg-[var(--brand-subtle)] focus:bg-[var(--brand-subtle)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="flex min-w-0 flex-1 flex-col items-start leading-4">
                          <span className="max-w-full truncate text-sm font-medium text-[var(--text-primary)]">
                            {item.name}
                          </span>
                          <span className="max-w-full truncate text-xs font-normal text-[var(--text-muted)]">
                            {item.category} · {item.language}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
            {selectedTemplate && <CampaignWhatsAppPreview template={selectedTemplate} variables={variables} media={templateMedia} />}
            {mediaRequired && (
              <div className="border-t border-[var(--border-soft)] pt-5">
                <h3 className="mb-1 text-sm font-medium">Campaign media</h3>
                <p className="mb-3 text-xs leading-5 text-[var(--text-secondary)]">
                  {carouselTemplate
                    ? "Upload the sendable media for each carousel card. The template approval image is not reused for delivery."
                    : "Upload the media that will be sent in this template header. This is separate from the template approval sample."}
                </p>
                <div className="space-y-2">
                  {Array.from({ length: mediaSlotCount }, (_, index) => {
                    const item = templateMedia?.items[index];
                    const label = carouselTemplate ? `Carousel card ${index + 1}` : "Header media";
                    const accept = mediaHeaderType === "video" ? "video/mp4,video/3gpp" : mediaHeaderType === "doc" ? ".pdf,.doc,.docx,application/pdf" : "image/jpeg,image/png";
                    return (
                      <div key={index} className="flex items-center gap-3 rounded-md border border-dashed border-[var(--border)] bg-[#fbfcfc] px-3 py-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--brand-soft)] text-[var(--brand)]"><Upload size={15} /></span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-[var(--text-primary)]">{label}</div>
                          <div className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">{item?.fileName ?? "No media uploaded"}</div>
                        </div>
                        <label htmlFor={`campaign-media-${index}`} className="flex h-8 shrink-0 cursor-pointer items-center rounded-md bg-[var(--brand)] px-3 text-[11px] font-medium text-white hover:bg-[var(--brand-hover)] disabled:opacity-50">
                          {mediaUploading === index ? "Uploading…" : item ? "Replace" : "Choose file"}
                          <input id={`campaign-media-${index}`} type="file" accept={accept} disabled={mediaUploading !== null} onChange={(event) => void handleCampaignMediaChange(event.target.files?.[0], index)} className="sr-only" />
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
                  <div className="relative">
                    <Input
                      ref={scheduleInputRef}
                      id="campaign-schedule"
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(event) => setScheduledAt(event.target.value)}
                      className="pr-11"
                    />
                    <button
                      type="button"
                      aria-label="Open schedule calendar"
                      onClick={() => {
                        const input = scheduleInputRef.current;
                        if (!input) return;
                        try {
                          if (typeof input.showPicker === "function") input.showPicker();
                          else input.focus();
                        } catch {
                          input.focus();
                        }
                      }}
                      className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"
                    >
                      <CalendarDays size={16} aria-hidden="true" />
                    </button>
                  </div>
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
            </div>
            )}
            {error && !reviewPayload && (
              <div
                role="alert"
                className="rounded-md bg-red-50 px-3 py-2 text-sm"
              >
                {error}
              </div>
            )}
          </div>
          <DrawerFooter className="flex-none border-t border-[var(--border-soft)] bg-white sm:flex-row sm:justify-end">
            {reviewPayload ? <>
              <button type="button" disabled={launching} onClick={() => { setReviewPayload(null); setEstimate(null); setError(null); }} className="h-10 rounded-md border border-[var(--border)] bg-white px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] disabled:opacity-50">Back to edit</button>
              <button type="button" disabled={launching || (!estimate?.canCoverEstimate && Number(estimate?.estimatedWalletCost ?? 0) > 0)} onClick={() => void confirmLaunch()} className="h-10 rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-50">{launching ? "Launching…" : reviewPayload.launchMode === "schedule" ? "Confirm schedule" : "Confirm and send"}</button>
            </> : <>
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
              disabled={!canSend || estimating}
              onClick={() => submit("live")}
              className="flex h-10 items-center justify-center rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {estimating ? "Calculating…" : "Review cost"}
              <Send size={14} className="ml-1.5" />
            </button>
            </>}
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
  const selectedTemplateKey = searchParams.get("templateKey");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [cancelTarget, setCancelTarget] = useState<Campaign | null>(null);
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
    (selectedContactCount > 0 || Boolean(selectedTemplateKey)) && canCreate,
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
    () => [...new Map(campaigns.filter((campaign) => campaign.createdById).map((campaign) => [campaign.createdById!, { value: campaign.createdById!, label: campaign.createdBy }])).values()],
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
        "Total Campaign Cost (INR)",
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
        campaign.totalCost === null ? "" : campaign.totalCost.toFixed(2),
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
  const controlCampaign = async (campaign: Campaign, action: "pause" | "resume" | "cancel") => {
    if (!canSend || !workspaceId || !accessToken) return;
    try {
      await apiRequest(`/workspaces/${workspaceId}/campaigns/${campaign.id}/control`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await loadCampaigns();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : `Campaign could not be ${action === "cancel" ? "cancelled" : `${action}d`}.`);
      throw caughtError;
    }
  };
  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-[var(--page-background)]"
      data-testid="campaign-page"
    >
      <div
        className="flex-none bg-white"
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
                <WhatsAppIcon size={18} className="mr-2" />
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
          <div className="flex h-10 items-center rounded-md border border-[var(--border)] bg-white px-2.5 text-[13px] font-medium text-[var(--brand-hover)]">
            <WhatsAppIcon size={15} className="mr-1.5" />
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
          className="mt-3 flex flex-none divide-x divide-[var(--border-soft)] overflow-hidden rounded-md border border-[var(--border)] bg-white shadow-[0_1px_3px_rgba(31,42,55,.06)]"
          role="tablist"
          aria-label="Campaign type"
        >
          <button
            type="button"
            role="tab"
            aria-selected={kind === "one_time"}
            onClick={() => setKind("one_time")}
            className={cn(
              "h-[51px] flex-1 border-b-2 px-4 text-sm font-medium transition-colors",
              kind === "one_time"
                ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
                : "border-transparent bg-white text-[var(--text-secondary)] hover:bg-[#f7f8f7] hover:text-[var(--text-primary)]",
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
              "h-[51px] flex-1 border-b-2 px-4 text-sm font-medium transition-colors",
              kind === "ongoing"
                ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
                : "border-transparent bg-white text-[var(--text-secondary)] hover:bg-[#f7f8f7] hover:text-[var(--text-primary)]",
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
              "h-[51px] flex-1 border-b-2 px-4 text-sm font-medium transition-colors",
              kind === "api"
                ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
                : "border-transparent bg-white text-[var(--text-secondary)] hover:bg-[#f7f8f7] hover:text-[var(--text-primary)]",
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
            <table aria-label="Campaign performance" className="campaign-data-table w-full min-w-[1140px] border-collapse text-left">
              <thead className="sticky top-0 z-10 border-b border-[var(--border-soft)] bg-[var(--sidebar-rail-background)] shadow-[inset_0_-1px_0_var(--border-soft)]">
                <tr>
                  {[
                    { label: "Campaign", align: "text-left" },
                    { label: "Created by", align: "text-left" },
                    { label: "Category", align: "text-left" },
                    { label: "Status", align: "text-left" },
                    { label: "Total cost", align: "text-right" },
                    { label: "Attempted", align: "text-right" },
                    { label: "Sent", align: "text-right" },
                    { label: "Delivered", align: "text-right" },
                    { label: "Read", align: "text-right" },
                    { label: "Replied", align: "text-right" },
                    { label: "Set live", align: "text-left" },
                  ].map(({ label, align }) => (
                    <th key={label} scope="col" className={cn("h-[46px] px-3 py-3", align, label === "Campaign" && "pl-4")}>
                      <h3 className="font-bold uppercase">{label}</h3>
                    </th>
                  ))}
                  <th scope="col" className="w-12 px-3 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={12} className="p-12 text-center text-xs text-[var(--text-secondary)]">Loading campaigns…</td></tr> : filteredCampaigns.map((campaign) => (
                  <tr
                    key={campaign.id}
                    className="group h-12 cursor-pointer border-b border-[var(--border-soft)] text-sm text-[var(--text-primary)] hover:bg-[var(--brand-soft)] focus-within:bg-[var(--brand-soft)]"
                    onClick={() => navigate(`/campaigns/${encodeURIComponent(campaign.id)}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigate(`/campaigns/${encodeURIComponent(campaign.id)}`);
                      }
                    }}
                    tabIndex={0}
                  >
                    <td className="max-w-[260px] px-4 py-4">
                      <div className="truncate font-medium text-[var(--text-primary)] transition-colors group-hover:text-blue-600 group-hover:underline group-focus-visible:text-blue-600 group-focus-visible:underline">
                        {campaign.name}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4">
                      {campaign.createdBy}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4">{campaign.category}</td>
                    <td className="whitespace-nowrap px-3 py-4">
                      <CampaignStatusBadge status={campaign.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-right font-medium tabular-nums">
                      {campaign.totalCost === null ? "—" : `₹ ${campaign.totalCost.toFixed(2)}`}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-right font-medium tabular-nums">
                      {campaign.attempted || "--"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-right font-medium tabular-nums">
                      {campaign.sent || "--"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-right font-medium tabular-nums">
                      {campaign.deliveredRate === null
                        ? "--"
                        : `${campaign.deliveredRate}%`}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-right font-medium tabular-nums">
                      {campaign.readRate === null
                        ? "--"
                        : `${campaign.readRate}%`}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-right font-medium tabular-nums">
                      {campaign.replied === null
                        ? "--"
                        : `${campaign.replied}%`}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4">
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
                          {canSend && (campaign.status === "RUNNING" || campaign.status === "SCHEDULED") && <DropdownMenuItem onSelect={() => void controlCampaign(campaign, "pause").catch(() => undefined)} className="text-xs"><Pause className="size-4" />Pause campaign</DropdownMenuItem>}
                          {canSend && campaign.status === "PAUSED" && <DropdownMenuItem onSelect={() => void controlCampaign(campaign, "resume").catch(() => undefined)} className="text-xs"><Play className="size-4" />Resume campaign</DropdownMenuItem>}
                          {canSend && ["DRAFT", "SCHEDULED", "RUNNING", "PAUSED"].includes(campaign.status) && <DropdownMenuItem onSelect={() => setCancelTarget(campaign)} className="text-xs text-[var(--danger)]"><Ban className="size-4" />Cancel campaign</DropdownMenuItem>}
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
        initialTemplateKey={selectedTemplateKey}
        kind={kind}
        workspaceId={workspaceId}
        accessToken={accessToken}
        onClose={() => {
          setCreateOpen(false);
          setSearchParams({}, { replace: true });
        }}
        onCreate={createCampaign}
      />
      <ConfirmationDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => { if (!open) setCancelTarget(null); }}
        title="Cancel this campaign?"
        description={`“${cancelTarget?.name ?? ""}” will stop starting new messages. Messages already being sent may still complete.`}
        confirmLabel="Cancel campaign"
        pendingLabel="Cancelling…"
        tone="danger"
        onConfirm={() => cancelTarget ? controlCampaign(cancelTarget, "cancel") : Promise.resolve()}
      />
    </div>
  );
}
