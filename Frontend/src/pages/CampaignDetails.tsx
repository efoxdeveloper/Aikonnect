import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Copy,
  Download,
  ExternalLink,
  Info,
  MessageCircle,
  RefreshCw,
  Users,
} from "lucide-react";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, apiRequest } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import { Drawer, DrawerCloseButton, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

type CampaignStatus =
  "DRAFT" | "SCHEDULED" | "RUNNING" | "COMPLETED" | "PAUSED";
type CampaignKind = "one_time" | "ongoing" | "api";
type ButtonTrackingRecord = {
  name: string;
  type: string;
  clicks: number;
  clickPercentage: number;
  users: number;
};
type CampaignRecipientStatus = "PENDING" | "ATTEMPTED" | "SENT" | "DELIVERED" | "READ" | "REPLIED" | "FAILED";
type CampaignRecipient = {
  id: string;
  contactId: string | null;
  phoneE164: string;
  status: CampaignRecipientStatus;
  attemptCount: number;
  attemptedAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  repliedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  contact: { id: string; name: string } | null;
};
type Campaign = {
  id: string;
  name: string;
  channel: "WhatsApp";
  kind: CampaignKind;
  createdBy: string;
  category: string;
  template: string;
  templateBody: string | null;
  audience: string;
  recipientCount: number | null;
  status: CampaignStatus;
  attempted: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  repliedCount: number;
  totalCost: number | null;
  deliveredRate: number | null;
  readRate: number | null;
  replied: number | null;
  setLiveAt: string | null;
  updatedAt: string;
  buttonTracking: ButtonTrackingRecord[];
  recipients: CampaignRecipient[];
};
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
const recipientStatusLabels: Record<CampaignRecipientStatus, string> = {
  PENDING: "Pending",
  ATTEMPTED: "Attempted",
  SENT: "Sent",
  DELIVERED: "Delivered",
  READ: "Read",
  REPLIED: "Replied",
  FAILED: "Failed",
};
type RecipientListFilter = "attempted" | "sent" | "delivered" | "read" | "replied" | "failed";
const recipientListLabels: Record<RecipientListFilter, string> = {
  attempted: "Attempted",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  replied: "Replied",
  failed: "Other Failures",
};

function normalizeRecipient(value: unknown): CampaignRecipient | null {
  if (!value || typeof value !== "object" || !("id" in value) || !("phoneE164" in value)) return null;
  const item = value as Partial<CampaignRecipient>;
  const status = item.status && item.status in recipientStatusLabels ? item.status as CampaignRecipientStatus : "PENDING";
  return {
    id: String(item.id),
    contactId: item.contactId ? String(item.contactId) : null,
    phoneE164: String(item.phoneE164),
    status,
    attemptCount: typeof item.attemptCount === "number" ? item.attemptCount : 0,
    attemptedAt: item.attemptedAt ?? null,
    sentAt: item.sentAt ?? null,
    deliveredAt: item.deliveredAt ?? null,
    readAt: item.readAt ?? null,
    repliedAt: item.repliedAt ?? null,
    failedAt: item.failedAt ?? null,
    failureReason: item.failureReason ?? null,
    contact: item.contact && typeof item.contact === "object" && "name" in item.contact
      ? { id: String(item.contact.id ?? item.contactId ?? ""), name: String(item.contact.name) }
      : null,
  };
}

function recipientsForFilter(recipients: CampaignRecipient[], filter: RecipientListFilter) {
  const statuses: Record<RecipientListFilter, CampaignRecipientStatus[]> = {
    attempted: ["ATTEMPTED", "SENT", "DELIVERED", "READ", "REPLIED", "FAILED"],
    sent: ["SENT", "DELIVERED", "READ", "REPLIED"],
    delivered: ["DELIVERED", "READ", "REPLIED"],
    read: ["READ", "REPLIED"],
    replied: ["REPLIED"],
    failed: ["FAILED"],
  };
  return recipients.filter((recipient) => statuses[filter].includes(recipient.status));
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
    templateBody?: string | null;
    audienceLabel?: string | null;
    recipients?: unknown[];
  };
  const sent = typeof item.sent === "number" ? item.sent : 0;
  const delivered = typeof item.delivered === "number" ? item.delivered : 0;
  const read = typeof item.read === "number" ? item.read : 0;
  const failed = typeof item.failed === "number" ? item.failed : 0;
  const repliedCount = typeof item.replied === "number" ? item.replied : 0;
  const status =
    typeof item.status === "string" && item.status in statusLabels
      ? (item.status as CampaignStatus)
      : "DRAFT";
  const buttonTracking = Array.isArray(item.buttonTracking)
    ? item.buttonTracking
        .filter((button) => Boolean(button && typeof button === "object" && "name" in button))
        .map((button) => ({
          name: String(button.name),
          type: String(button.type || "URL"),
          clicks: typeof button.clicks === "number" ? button.clicks : 0,
          clickPercentage:
            typeof button.clickPercentage === "number"
              ? button.clickPercentage
              : 0,
          users: typeof button.users === "number" ? button.users : 0,
        }))
    : [];
  return {
    id: String(item.id),
    name: String(item.name),
    channel: "WhatsApp",
    kind:
      item.kind === "ongoing" || item.kind === "api" ? item.kind : "one_time",
    createdBy: item.createdBy || "You",
    category: item.category || "Marketing",
    template: item.templateName || item.template || item.templateKey || "",
    templateBody: item.templateBody ?? null,
    audience: item.audience || item.audienceLabel || "All opted-in contacts",
    recipientCount:
      typeof item.recipientCount === "number" ? item.recipientCount : null,
    status,
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
    deliveredRate: sent ? Math.round((delivered / sent) * 100) : null,
    readRate: sent ? Math.round((read / sent) * 100) : null,
    replied: sent && typeof item.replied === "number" ? Math.round((item.replied / sent) * 100) : null,
    setLiveAt: item.setLiveAt || item.scheduledAt || null,
    updatedAt: item.updatedAt || new Date(0).toISOString(),
    totalCost: typeof item.totalCost === "number" ? item.totalCost : null,
    buttonTracking,
    recipients: Array.isArray(item.recipients)
      ? item.recipients.map(normalizeRecipient).filter((recipient): recipient is CampaignRecipient => Boolean(recipient))
      : [],
  };
}

function formatDate(value: string | null, withTime = false) {
  if (!value) return "--";
  return new Intl.DateTimeFormat(
    "en-IN",
    withTime
      ? {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }
      : { day: "2-digit", month: "2-digit", year: "numeric" },
  ).format(new Date(value));
}

function templateLabel(value: string) { return value || "--"; }

function downloadReport(campaign: Campaign) {
  const escapeCsvValue = (value: string | number) =>
    `"${String(value).replace(/"/g, '""')}"`;
  const rows = [
    [
      "Campaign Name",
      "Channel",
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
      statusLabels[campaign.status],
      campaign.attempted,
      campaign.sent,
       campaign.delivered,
       campaign.read,
       campaign.repliedCount,
      formatDate(campaign.setLiveAt),
    ],
  ];
  const report = rows
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\n");
  const url = URL.createObjectURL(
    new Blob([report], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${
    campaign.name
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "campaign"
  }-report.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function MetricCard({
  label,
  value,
  detail,
  tone = "default",
  footer,
  onView,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "warning";
  footer?: ReactNode;
  onView?: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-[var(--border)] bg-white p-2.5",
        footer && "pb-0",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-[var(--text-secondary)]">
        <span>{label}</span>
        <Info className="size-4 text-[var(--text-muted)]" />
      </div>
      <div
        className={cn(
          "mt-1 text-[18px] font-medium leading-6",
          tone === "warning"
            ? "text-[var(--text-primary)]"
            : "text-[var(--text-primary)]",
        )}
      >
        {value}
      </div>
      <div className="mt-2 flex items-center gap-1 text-xs">
        <button
          type="button"
          onClick={onView}
          disabled={!onView}
          aria-label={`${detail} for ${label}`}
          className="font-medium text-[var(--brand)] hover:underline"
        >
          {detail}
        </button>
        {detail === "View user list" && (
          <ExternalLink className="size-3 text-[var(--brand)]" />
        )}
      </div>
      {footer}
    </div>
  );
}

function RecipientListDrawer({
  open,
  onOpenChange,
  campaignName,
  filter,
  recipients,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignName: string;
  filter: RecipientListFilter;
  recipients: CampaignRecipient[];
}) {
  const filteredRecipients = recipientsForFilter(recipients, filter);
  const label = recipientListLabels[filter];
  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="h-full max-h-screen border-l border-[var(--border)] data-[vaul-drawer-direction=right]:!max-w-[860px]">
          <DrawerHeader className="relative flex flex-row flex-none items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--brand-soft)]/45 pr-16">
            <div className="min-w-0">
              <DrawerTitle className="truncate text-sm font-semibold text-[var(--text-primary)]">{label} recipients</DrawerTitle>
              <div className="mt-1 truncate text-xs text-[var(--text-secondary)]">{campaignName} · {filteredRecipients.length} user{filteredRecipients.length === 1 ? "" : "s"}</div>
            </div>
            <DrawerCloseButton aria-label="Close recipient list" />
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
            {filteredRecipients.length ? (
              <table className="w-full min-w-[760px] table-fixed text-left text-sm" data-testid="campaign-recipient-list">
                <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--table-header)] text-xs text-[var(--text-secondary)]">
                  <tr>
                    <th className="w-[24%] px-3 py-3 font-medium">User</th>
                    <th className="w-[20%] px-3 py-3 font-medium">Phone number</th>
                    <th className="w-[14%] px-3 py-3 font-medium">Status</th>
                    <th className="w-[12%] px-3 py-3 font-medium">Attempts</th>
                    <th className="w-[30%] px-3 py-3 font-medium">Failure reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecipients.map((recipient) => (
                    <tr key={recipient.id} className="border-b border-[var(--border-soft)] last:border-0">
                      <td className="px-3 py-3 font-medium text-[var(--text-primary)]">{recipient.contact?.name ?? "Unknown contact"}</td>
                      <td className="px-3 py-3 text-[var(--text-secondary)]">{recipient.phoneE164}</td>
                      <td className="px-3 py-3"><span className={cn("inline-flex rounded-full px-2 py-1 text-[11px] font-medium", recipient.status === "FAILED" ? "bg-red-50 text-[var(--danger)]" : "bg-[var(--brand-soft)] text-[var(--brand)]")}>{recipientStatusLabels[recipient.status]}</span></td>
                      <td className="px-3 py-3 text-[var(--text-secondary)]">{recipient.attemptCount}</td>
                      <td className="max-w-[260px] px-3 py-3 text-[var(--danger)]">{recipient.failureReason ?? "--"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="rounded-md border border-dashed border-[var(--border-strong)] px-6 py-12 text-center text-sm text-[var(--text-secondary)]">No {label.toLowerCase()} recipients yet.</div>
            )}
          </div>
          <footer className="flex flex-none justify-end border-t border-[var(--border)] bg-[var(--surface-subtle)] px-5 py-3 sm:px-6">
            <button type="button" onClick={() => onOpenChange(false)} className="h-9 rounded-md border border-[var(--border-strong)] bg-white px-4 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--brand-subtle)]">Close</button>
          </footer>
      </DrawerContent>
    </Drawer>
  );
}

export function CampaignDetails() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const { user, accessToken } = useAuth();
  const membership = getActiveMembership(user);
  const workspaceId = membership?.workspace.id;
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [recipientListFilter, setRecipientListFilter] = useState<RecipientListFilter>("sent");
  const [recipientListOpen, setRecipientListOpen] = useState(false);

  const openRecipientList = (filter: RecipientListFilter) => {
    setRecipientListFilter(filter);
    setRecipientListOpen(true);
  };

  useEffect(() => {
    if (!workspaceId || !accessToken || !campaignId) { setLoading(false); return; }
    let active = true;
    setLoading(true); setError("");
    void apiRequest<unknown>(`/workspaces/${workspaceId}/campaigns/${campaignId}`, { headers: { authorization: `Bearer ${accessToken}` } })
      .then((result) => { if (active) setCampaign(normalizeCampaign(result)); })
      .catch((caughtError) => { if (active) setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load campaign details."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, campaignId, refreshVersion, workspaceId]);

  if (!membership || !membership.role.permissions.includes("campaigns.read")) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--page-background)] p-6">
        <section className="rounded-lg border border-[var(--border)] bg-white p-8 text-center">
          <h1 className="text-lg font-medium">Campaign access is restricted</h1>
          <div className="mt-2 text-sm text-[var(--text-secondary)]">
            You do not have permission to view campaign details.
          </div>
        </section>
      </div>
    );
  }
  if (loading) {
    return <div className="flex h-full items-center justify-center bg-[var(--page-background)] text-sm text-[var(--text-secondary)]">Loading campaign…</div>;
  }
  if (!campaign) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--page-background)] p-6 text-center">
        <h1 className="text-lg font-medium">Campaign not found</h1>
        <div className="mt-2 text-sm text-[var(--text-secondary)]">
          {error || "This campaign may have been removed or is no longer available."}
        </div>
        <button
          type="button"
          onClick={() => navigate("/campaigns")}
          className="mt-5 h-10 rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white"
        >
          Back to campaigns
        </button>
      </div>
    );
  }

  const delivered =
    campaign.deliveredRate === null
      ? null
      : Math.round((campaign.sent * campaign.deliveredRate) / 100);
  const read =
    campaign.readRate === null
      ? null
      : Math.round((campaign.sent * campaign.readRate) / 100);
  const otherFailures = campaign.failed;
  const templateName = templateLabel(campaign.template);
  const messageBody = campaign.templateBody || "Your approved WhatsApp template message will appear here.";
  const buttonTracking = campaign.buttonTracking;

  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-[var(--page-background)]"
      data-testid="campaign-details-page"
    >
      <header
        className="h-[var(--header-height)] flex-none border-b border-[var(--border)] bg-white"
        data-testid="campaign-details-header"
      >
        <div className="flex h-full items-center justify-between gap-4 px-5 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Back to campaigns"
              onClick={() => navigate("/campaigns")}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--text-primary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"
            >
              <ArrowLeft size={19} />
            </button>
            <h1 className="max-w-[420px] truncate text-[14px] font-medium text-[var(--text-primary)] sm:max-w-none">
              {campaign.name}
            </h1>
            <span className="hidden h-7 w-px bg-[var(--border)] sm:block" />
            <div className="flex shrink-0 items-center gap-2 text-sm text-[var(--text-primary)]">
              <MessageCircle className="size-5 text-[var(--brand)]" />
              <span>{campaign.channel}</span>
            </div>
            <span className="hidden h-7 w-px bg-[var(--border)] sm:block" />
            <div className="flex shrink-0 items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)]">
              <span className="size-2 rounded-full bg-[var(--brand)]" />
              <span>{statusLabels[campaign.status]}</span>
              <Copy className="ml-1 size-4 text-[var(--text-secondary)]" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <span>Total Campaign Cost: {campaign.totalCost === null ? "--" : `₹ ${campaign.totalCost.toFixed(2)}`}</span>
            <Info className="size-4 text-[var(--text-secondary)]" />
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto bg-white">
        <div className="space-y-9 px-5 py-7">
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
                  Statistics
                </h2>
                <button
                  type="button"
                  onClick={() => setRefreshVersion((current) => current + 1)}
                  className="inline-flex h-7 items-center rounded bg-[var(--brand-soft)] px-2 text-xs font-medium text-[var(--brand)] hover:bg-[var(--brand-soft)]"
                >
                  <RefreshCw size={13} className="mr-1" />
                  Refresh Data
                </button>
                <div className="rounded bg-[var(--brand-soft)] px-2 py-1 text-xs text-[var(--brand)]">
                  Delivered, Read, Replied can keep getting updated in the
                  future
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="inline-flex h-10 items-center rounded border border-[var(--brand)] bg-white px-4 text-xs font-semibold text-[var(--brand)] hover:bg-[var(--brand-soft)]"
                >
                  <Info size={15} className="mr-2" />
                  Know your data
                </button>
                <button
                  type="button"
                  onClick={() => downloadReport(campaign)}
                  className="inline-flex h-10 items-center rounded border border-[var(--brand)] bg-white px-4 text-xs font-semibold text-[var(--brand)] hover:bg-[var(--brand-soft)]"
                >
                  <Download size={16} className="mr-2" />
                  Download Report
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
              <MetricCard
                label="Attempted"
                  value={`${campaign.attempted} / ${campaign.recipientCount ?? campaign.attempted}`}
                detail="View user list"
                onView={() => openRecipientList("attempted")}
              />
              <MetricCard
                label="Sent"
                value={String(campaign.sent)}
                detail="View user list"
                onView={() => openRecipientList("sent")}
              />
              <MetricCard
                label="Delivered"
                value={delivered === null ? "--" : String(delivered)}
                detail="View user list"
                onView={() => openRecipientList("delivered")}
              />
              <MetricCard
                label="Read"
                value={read === null ? "--" : String(read)}
                detail="View user list"
                onView={() => openRecipientList("read")}
              />
              <MetricCard
                label="Replied"
                value={
                  String(campaign.repliedCount)
                }
                detail="View user list"
                onView={() => openRecipientList("replied")}
              />
              <MetricCard
                label="Other Failures"
                value={String(otherFailures)}
                detail="View user list"
                tone="warning"
                onView={() => openRecipientList("failed")}
              />
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-[14px] font-semibold text-[var(--text-primary)]">
              Button Tracking
            </h2>
            <div className="overflow-x-auto rounded-md border border-[var(--border)]">
              <table
                className="w-full min-w-[700px] text-left text-sm"
                data-testid="button-tracking-table"
              >
                <thead className="border-b border-[var(--border)] text-xs text-[var(--text-primary)]">
                  <tr>
                    <th className="px-6 py-4">Button Name</th>
                    <th className="px-6 py-4">Button Type</th>
                    <th className="px-6 py-4">Number of Clicks</th>
                    <th className="px-6 py-4">Click Percentage</th>
                    <th className="px-6 py-4">Users</th>
                  </tr>
                </thead>
                <tbody>
                  {buttonTracking.length ? (
                    buttonTracking.map((button) => (
                      <tr
                        key={`${button.name}-${button.type}`}
                        className="border-b border-[var(--border-soft)] last:border-0"
                      >
                        <td className="px-6 py-4 font-medium">{button.name}</td>
                        <td className="px-6 py-4">{button.type}</td>
                        <td className="px-6 py-4">{button.clicks}</td>
                        <td className="px-6 py-4">{button.clickPercentage}%</td>
                        <td className="px-6 py-4">{button.users}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-8 text-center text-sm text-[var(--text-secondary)]"
                      >
                        No button tracking data is available for this template.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <h2 className="border-b border-[var(--border)] pb-3 text-[14px] font-medium text-[var(--text-primary)]">
              Detail
            </h2>
            <dl>
              <div className="grid gap-3 border-b border-[var(--border)] py-5 md:grid-cols-[315px_minmax(0,1fr)]">
                <dt className="text-sm text-[var(--text-muted)]">
                  Notification type
                </dt>
                <dd className="text-sm font-medium">
                  {campaign.kind === "one_time"
                    ? "OneTime"
                    : campaign.kind === "ongoing"
                      ? "Ongoing"
                      : "API"}
                </dd>
              </div>
              <div className="grid gap-3 border-b border-[var(--border)] py-5 md:grid-cols-[315px_minmax(0,1fr)]">
                <dt className="text-sm text-[var(--text-muted)]">Audience</dt>
                <dd className="flex flex-wrap items-center gap-3 text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <Users className="size-5 text-[var(--text-primary)]" />
                    Users
                  </span>
                  <span className="rounded bg-slate-50 px-3 py-2">
                        {campaign.audience}
                  </span>
                  <span>And</span>
                  <span className="rounded bg-slate-50 px-3 py-2">
                    Failed recipients: {campaign.failed}
                  </span>
                </dd>
              </div>
              <div className="grid gap-3 border-b border-[var(--border)] py-5 md:grid-cols-[315px_minmax(0,1fr)]">
                <dt className="text-sm text-[var(--text-muted)]">Message</dt>
                <dd>
                  <div className="text-[13px] text-[var(--text-primary)]">
                    Template Name
                  </div>
                  <div className="mt-1 text-sm text-[var(--text-primary)]">
                    {templateName}
                  </div>
                  <div className="mt-4 rounded border border-[var(--border)] px-3.5 py-7 text-[14px] leading-5 text-[var(--text-primary)] sm:px-4">
                    <div className="text-[13px]">Body</div>
                    <div className="mt-1 whitespace-pre-line">{messageBody}</div>
                  </div>
                  <button
                    type="button"
                    className="mt-5 inline-flex h-9 items-center rounded bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-[var(--brand-hover)]"
                  >
                    See Template Preview
                  </button>
                </dd>
              </div>
              <div className="grid gap-3 py-5 md:grid-cols-[315px_minmax(0,1fr)]">
                <dt className="flex items-start gap-1 text-sm text-[var(--text-muted)]">
                  <CalendarClock className="mt-0.5 size-4" />
                  Schedule
                </dt>
                <dd className="grid gap-4">
                  <div className="flex flex-wrap items-center gap-5">
                    <div className="text-sm font-medium">Started on</div>
                    <div className="rounded bg-slate-50 px-3 py-2 text-sm font-medium">
                      {formatDate(campaign.setLiveAt, true)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-5">
                    <div className="text-sm font-medium">Ended on</div>
                    <div className="rounded bg-slate-50 px-3 py-2 text-sm font-medium">
                      {campaign.status === "COMPLETED"
                        ? formatDate(campaign.updatedAt, true)
                        : "--"}
                    </div>
                  </div>
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </main>
      <RecipientListDrawer
        open={recipientListOpen}
        onOpenChange={setRecipientListOpen}
        campaignName={campaign.name}
        filter={recipientListFilter}
        recipients={campaign.recipients}
      />
    </div>
  );
}
