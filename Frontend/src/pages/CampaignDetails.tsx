import { useMemo, useState, type ReactNode } from "react";
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
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getActiveMembership } from "@/lib/workspace";
import { cn } from "@/lib/utils";

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
type Campaign = {
  id: string;
  name: string;
  channel: "WhatsApp";
  kind: CampaignKind;
  createdBy: string;
  category: string;
  template: string;
  audience: string;
  recipientCount: number | null;
  status: CampaignStatus;
  attempted: number;
  sent: number;
  deliveredRate: number | null;
  readRate: number | null;
  replied: number | null;
  setLiveAt: string | null;
  updatedAt: string;
  buttonTracking: ButtonTrackingRecord[];
};

const storagePrefix = "interakt-campaigns-v1";
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
const templateLabels: Record<string, string> = {
  promotional_offer: "Promotional offer",
  product_update: "Product update",
  appointment_reminder: "Appointment reminder",
  order_update: "Order update",
  dps_carousel: "DPS Carousel",
};

function normalizeCampaign(value: unknown): Campaign | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    !("name" in value)
  )
    return null;
  const item = value as Partial<Campaign> & {
    delivered?: unknown;
    scheduledAt?: string | null;
  };
  const sent = typeof item.sent === "number" ? item.sent : 0;
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
    template: item.template || "product_update",
    audience: item.audience || "All opted-in contacts",
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
    deliveredRate:
      typeof item.deliveredRate === "number"
        ? item.deliveredRate
        : sent && typeof item.delivered === "number"
          ? Math.round((item.delivered / sent) * 100)
          : null,
    readRate: typeof item.readRate === "number" ? item.readRate : null,
    replied: typeof item.replied === "number" ? item.replied : null,
    setLiveAt: item.setLiveAt || item.scheduledAt || null,
    updatedAt: item.updatedAt || new Date(0).toISOString(),
    buttonTracking,
  };
}

function readCampaign(
  workspaceId: string | undefined,
  campaignId: string | undefined,
) {
  if (!workspaceId || !campaignId || typeof window === "undefined") return null;
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(`${storagePrefix}:${workspaceId}`) ?? "[]",
    ) as unknown;
    if (!Array.isArray(stored)) return null;
    return (
      stored.map(normalizeCampaign).find((item) => item?.id === campaignId) ??
      null
    );
  } catch {
    return null;
  }
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

function templateLabel(value: string) {
  return templateLabels[value] ?? value;
}

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
      campaign.deliveredRate === null ? "--" : `${campaign.deliveredRate}%`,
      campaign.readRate === null ? "--" : `${campaign.readRate}%`,
      campaign.replied === null ? "--" : `${campaign.replied}%`,
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
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "warning";
  footer?: ReactNode;
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

export function CampaignDetails() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const membership = getActiveMembership(user);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const campaign = useMemo(
    () => readCampaign(membership?.workspace.id, campaignId),
    [campaignId, membership?.workspace.id, refreshVersion],
  );

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
  if (!campaign) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--page-background)] p-6 text-center">
        <h1 className="text-lg font-medium">Campaign not found</h1>
        <div className="mt-2 text-sm text-[var(--text-secondary)]">
          This campaign may have been removed or is no longer available.
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
  const otherFailures = campaign.attempted > campaign.sent ? 1 : 0;
  const limitedByMeta = Math.max(
    campaign.attempted - campaign.sent - otherFailures,
    0,
  );
  const templateName = campaign.name.toLowerCase().includes("carousel")
    ? "DPS Carousel"
    : templateLabel(campaign.template);
  const messageBody = campaign.name.toLowerCase().includes("carousel")
    ? "EduFox School ERP – Trusted by DPS Bulandshahr, DPS HRDC for a Smooth ERP Transformation.\n\n⚙️ Implementation in 45 Days\n15+ Years of Trust\nRobust Mobile App\nSecure Data Migration\n\nDiscover why leading schools choose EduFox"
    : "Your approved WhatsApp template message will appear here.";
  const notificationName = campaign.name.toLowerCase().startsWith("dps")
    ? "DPS - R2 - Read Excluded"
    : campaign.name;
  const totalCost = campaign.sent * 0.87;
  const buttonTracking = campaign.buttonTracking.length
    ? campaign.buttonTracking
    : campaign.name.toLowerCase().includes("carousel")
      ? [
          {
            name: "Discover why leading schools choose EduFox",
            type: "URL",
            clicks: 0,
            clickPercentage: 0,
            users: 0,
          },
        ]
      : [];

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
            <span>Total Campaign Cost: ₹ {totalCost.toFixed(2)}</span>
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
                value={`${campaign.attempted} / ${campaign.attempted}`}
                detail="View user list"
              />
              <MetricCard
                label="Sent"
                value={String(campaign.sent)}
                detail="View user list"
              />
              <MetricCard
                label="Delivered"
                value={delivered === null ? "--" : String(delivered)}
                detail="View user list"
              />
              <MetricCard
                label="Read"
                value={read === null ? "--" : String(read)}
                detail="View user list"
              />
              <MetricCard
                label="Replied"
                value={
                  campaign.replied === null
                    ? "--"
                    : String(
                        Math.round((campaign.sent * campaign.replied) / 100),
                      )
                }
                detail="View user list"
              />
              <MetricCard
                label="Other Failures"
                value={String(otherFailures)}
                detail="View Details"
                tone="warning"
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
                    Notification Sent Campaign Name is {notificationName}
                  </span>
                  <span>And</span>
                  <span className="rounded bg-slate-50 px-3 py-2">
                    Notification Sent Error is {limitedByMeta ? "131049" : "--"}
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
                    {campaign.name.toLowerCase().includes("carousel") ? (
                      <>
                        <div className="mt-1">
                          <strong>EduFox School ERP</strong> – Trusted by{" "}
                          <strong>DPS Bulandshahr, DPS HRDC</strong> for a
                          Smooth ERP Transformation.
                        </div>
                        <div className="mt-5 space-y-0.5 font-medium">
                          <div>⚙️ Implementation in 45 Days</div>
                          <div>◷ 15+ Years of Trust</div>
                          <div>▦ Robust Mobile App</div>
                          <div>🔒 Secure Data Migration</div>
                        </div>
                        <div className="mt-6 italic">
                          Discover why leading schools choose EduFox
                        </div>
                      </>
                    ) : (
                      <div className="mt-1 whitespace-pre-line">
                        {messageBody}
                      </div>
                    )}
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
    </div>
  );
}
