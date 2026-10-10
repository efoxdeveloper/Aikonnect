import { useMemo, useState, type ReactNode, type FormEvent, type SVGProps } from "react";
import { ArrowRight, BarChart3, Building2, CalendarDays, Check, CheckCircle2, Coins, Eye, FileText, Info, Link2, MessageCircle, Phone, Plus, Send, ShieldCheck, Users, WalletCards, Zap, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { siWhatsapp } from "simple-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DashboardSetupGuide } from "@/components/dashboard/DashboardLearning";
import { WelcomeBonusDialog } from "@/components/dashboard/WelcomeBonusDialog";
import { WhatsAppConnectionGuide, type ConnectionChoice } from "@/components/whatsapp/WhatsAppConnectionGuide";
import { WhatsAppConnectingDialog } from "@/components/whatsapp/WhatsAppConnectingDialog";
import { WhatsAppRegistrationPinDialog } from "@/components/whatsapp/WhatsAppRegistrationPinDialog";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { useDashboardResource } from "@/hooks/use-dashboard-resource";
import { useWhatsAppEmbeddedSignup } from "@/hooks/use-whatsapp-embedded-signup";
import { getActiveMembership } from "@/lib/workspace";
import type { WorkspaceSetupData, WhatsAppStatusData } from "@/types/workspace";
import styles from "./DashboardOverview.module.css";

type RangeKey = "today" | "7d" | "30d" | "custom";
type DateRange = { from: string; to: string };
type Usage = {
  summary: { outgoingMessages: number; deliveredMessages: number; readMessages: number; failedMessages: number };
  daily: Array<{ date: string; outgoing: number; delivered: number }>;
};
type Wallet = { currency: string; balance: string; availableBalance: string; status: string };
type WelcomeBonus = { amount: string; currency: string; granted: boolean; pending: boolean; source: string | null } | null;
type Resource = { loading: boolean; error: boolean; restricted: boolean };
type Tone = "green" | "blue" | "purple" | "amber" | "red" | "neutral";
const numbers = new Intl.NumberFormat("en-IN");
const count = (value: number | undefined) => value === undefined ? "—" : numbers.format(value);
const label = (value?: string | null) => value ? value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unavailable";
const statusTone = (value?: string | null): Tone => !value ? "neutral" : ["CONNECTED", "APPROVED", "VERIFIED", "ACTIVE"].includes(value) ? "green" : ["ERROR", "REJECTED", "DISABLED"].includes(value) ? "red" : "amber";
const resourceText = (resource: Resource) => resource.restricted ? "Access restricted" : resource.loading ? "Loading…" : resource.error ? "Unavailable" : "";

export function dashboardDateRange(preset: Exclude<RangeKey, "custom">, now = new Date()): DateRange {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (preset === "today" ? 0 : preset === "7d" ? 6 : 29));
  return { from: from.toISOString(), to: now.toISOString() };
}

function IconTile({ icon: Icon, tone = "green", round = false }: { icon: LucideIcon; tone?: Tone; round?: boolean }) {
  return <span className={`${styles.iconTile} ${round ? styles.roundIcon : ""}`} data-tone={tone}><Icon size={18} aria-hidden="true" /></span>;
}

function WhatsAppBrandIcon({ size = 17, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...props}><path d={siWhatsapp.path} /></svg>;
}

function Panel({ title, icon: Icon, action, children }: { title: string; icon: LucideIcon | typeof WhatsAppBrandIcon; action?: ReactNode; children: ReactNode }) {
  return <section className={styles.panel} aria-label={title}>
    <header className={styles.panelHeader}><h2><Icon size={17} aria-hidden="true" />{title}</h2>{action}</header>
    {children}
  </section>;
}

function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className={styles.panelLink}>{children}<ArrowRight size={12} aria-hidden="true" /></Link>;
}

function Metric({ title, value, detail, icon, tone, children }: { title: string; value: string; detail: string; icon: LucideIcon; tone: Tone; children?: ReactNode }) {
  return <section aria-label={title} className={styles.metric}><IconTile icon={icon} tone={tone} round /><div className={styles.metricText}><span>{title}</span><strong>{value}</strong><small>{detail}</small></div>{children}</section>;
}

function ActivityChart({ items, loading, error, restricted }: { items: Usage["daily"]; loading: boolean; error: boolean; restricted: boolean }) {
  const maximum = Math.max(1, ...items.map(({ outgoing, delivered }) => Math.max(outgoing, delivered)));
  const dateLabel = (date: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));
  return <section className={`${styles.panel} ${styles.activityPanel}`} aria-label="Message activity">
    <header className={styles.panelHeader}><h2><BarChart3 size={17} aria-hidden="true" />Message activity</h2><div className={styles.chartLegend}><span><i data-series="sent" />Sent</span><span><i data-series="delivered" />Delivered</span></div></header>
    {loading ? <div className={styles.chartEmpty} role="status">Loading message activity…</div> : items.length ? <div className={styles.activityChart} role="img" aria-label={`Message activity for ${items.length} days`}>
      {items.map((item) => <div className={styles.chartDay} key={item.date} title={`${dateLabel(item.date)}: ${item.outgoing} sent, ${item.delivered} delivered`}>
        <div className={styles.chartBars} aria-hidden="true"><span data-series="sent" style={{ height: `${Math.max(item.outgoing > 0 ? 4 : 0, item.outgoing / maximum * 100)}%` }} /><span data-series="delivered" style={{ height: `${Math.max(item.delivered > 0 ? 4 : 0, item.delivered / maximum * 100)}%` }} /></div>
        <span className={styles.chartDate}>{dateLabel(item.date)}</span>
      </div>)}
    </div> : <div className={styles.chartEmpty}>{restricted ? "Message activity is unavailable with your current access." : error ? "Message activity could not be loaded." : "No message activity for this period."}</div>}
  </section>;
}

function HealthItem({ icon, title, value, tone = "neutral" }: { icon: LucideIcon; title: string; value: string; tone?: Tone }) {
  return <div className={styles.healthItem}><IconTile icon={icon} tone={tone} /><div><strong data-tone={tone} title={value}>{value}</strong><small>{title}</small></div></div>;
}

export function DashboardOverview() {
  const { accessToken, user } = useAuth();
  const membership = getActiveMembership(user);
  const workspaceId = membership?.workspace.id;
  const permissions = membership?.role.permissions ?? [];
  const can = (permission: string) => permissions.includes(permission);
  const [range, setRange] = useState<RangeKey>("7d");
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [rangeError, setRangeError] = useState("");
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const dates = useMemo(() => range === "custom" && customRange ? customRange : dashboardDateRange(range === "custom" ? "7d" : range), [range, customRange]);
  const query = new URLSearchParams(dates).toString();
  const path = (suffix: string, permission: string) => workspaceId && can(permission) ? `/workspaces/${workspaceId}/${suffix}` : null;
  const setup = useDashboardResource<WorkspaceSetupData>(path("setup", "workspace.read"), accessToken);
  const meta = useDashboardResource<WhatsAppStatusData>(setup.data?.whatsapp.status === "CONNECTED" ? path("whatsapp/status", "whatsapp.read") : null, accessToken);
  const usage = useDashboardResource<Usage>(path(`usage?${query}`, "billing.read"), accessToken);
  const wallet = useDashboardResource<Wallet>(path("wallet", "billing.read"), accessToken);
  const welcomeBonus = useDashboardResource<WelcomeBonus>(path("wallet/welcome-bonus", "workspace.read"), accessToken);
  const welcomeBonusOffer = welcomeBonus.data ?? { amount: "400.00", currency: "INR", granted: false, pending: false, source: null };
  const [bonusDismissedFor, setBonusDismissedFor] = useState<string | null>(null);

  const account = setup.data?.whatsapp.accounts.find((item) => item.status === "CONNECTED") ?? setup.data?.whatsapp.accounts[0];
  const phone = account?.phoneNumbers.find((item) => item.status === "ACTIVE") ?? account?.phoneNumbers[0];
  const whatsappConnected = setup.data?.whatsapp.status === "CONNECTED" && phone?.status === "ACTIVE";
  const setupNeeded = Boolean(setup.data && (!whatsappConnected || setup.data.progress.completedSteps < setup.data.progress.totalSteps));
  const [connectionGuideOpen, setConnectionGuideOpen] = useState(false);
  const [connectionChoice, setConnectionChoice] = useState<ConnectionChoice>("business-app");
  const { connecting, syncing, error: connectionError, pinRequired, submitRegistrationPin, cancelRegistrationPin, start } = useWhatsAppEmbeddedSignup({
    workspaceId,
    accessToken,
    onConnected: setup.refresh,
  });
  const summary = usage.data?.summary;
  const sent = summary?.outgoingMessages;
  const rate = (value?: number) => sent === undefined || value === undefined ? "—" : `${(sent ? value / sent * 100 : 0).toFixed(1)}%`;
  const period = range === "today" ? "Today" : range === "30d" ? "Last 30 days" : range === "7d" ? "Last 7 days" : "Selected period";
  const walletValue = wallet.data ? `${wallet.data.currency === "INR" ? "₹" : `${wallet.data.currency} `}${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(wallet.data.availableBalance ?? wallet.data.balance))}` : "—";
  const showWelcomeBonus = Boolean(can("billing.read") && whatsappConnected && workspaceId && welcomeBonus.data?.pending && welcomeBonus.data.source === "whatsapp_number_connection" && bonusDismissedFor !== workspaceId);
  function dismissWelcomeBonus() {
    if (!workspaceId || !accessToken) return;
    setBonusDismissedFor(workspaceId);
    void apiRequest(`/workspaces/${workspaceId}/wallet/welcome-bonus/celebrated`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` } }).catch(() => {
      // Close this session's modal; if persistence failed, the server will offer it again on the next visit.
    });
  }
  const quickActions = [
    { title: "New Campaign", to: "/campaigns", icon: Send, permission: "campaigns.create" },
    { title: "New Template", to: "/createtemplate", icon: FileText, permission: "templates.manage" },
    { title: "Send Message", to: "/inbox", icon: MessageCircle, permission: "conversations.reply" },
    { title: "Add Contacts", to: "/contacts", icon: Users, permission: "contacts.create" },
  ];
  function selectRange(next: Exclude<RangeKey, "custom">) { setRange(next); setCustomOpen(false); setRangeError(""); }
  function applyRange(event: FormEvent) {
    event.preventDefault();
    if (!customFrom || !customTo) { setRangeError("Choose both a start date and an end date."); return; }
    const from = new Date(`${customFrom}T00:00:00`);
    const to = new Date(`${customTo}T23:59:59.999`);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) { setRangeError("The start date must be on or before the end date."); return; }
    if (to.getTime() - from.getTime() > 366 * 86400000) { setRangeError("Choose a date range of 366 days or less."); return; }
    setCustomRange({ from: from.toISOString(), to: to.toISOString() }); setRange("custom"); setCustomOpen(false); setRangeError("");
  }

  return <div data-testid="dashboard-overview" className={`${styles.page} flex h-full min-h-0 min-w-0 flex-col overflow-hidden`}>
    <div data-testid="dashboard-overview-scroll" className={styles.scroll}>
      <div className={styles.content}>
        <header className={styles.pageHeader}>
          <div className={styles.pageTitle}><h1>Dashboard</h1><span>{membership?.workspace.name ?? "Workspace overview"}</span></div>
          <div className={styles.dateFilters} aria-label="Dashboard date range">{([['today', 'Today'], ['7d', '7 Days'], ['30d', '30 Days']] as const).map(([key, title]) => <Button key={key} variant={range === key ? "default" : "outline"} aria-pressed={range === key} onClick={() => selectRange(key)}>{title}</Button>)}<Button variant={range === "custom" ? "default" : "outline"} aria-expanded={customOpen} onClick={() => setCustomOpen((value) => !value)}><CalendarDays size={14} />Custom</Button></div>
        </header>
        {customOpen && <form className={styles.customRange} onSubmit={applyRange} noValidate><label>From<Input type="date" aria-label="From date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label><label>To<Input type="date" aria-label="To date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label><Button type="submit">Apply range</Button>{rangeError && <div role="alert">{rangeError}</div>}</form>}
        <section aria-label="Workspace summary" className={styles.metrics}>
          <Metric title="Messages Sent" icon={Send} tone="green" value={count(sent)} detail={resourceText(usage) || period} />
          <Metric title="Delivered" icon={CheckCircle2} tone="blue" value={count(summary?.deliveredMessages)} detail={resourceText(usage) || `${rate(summary?.deliveredMessages)} delivery rate`} />
          <Metric title="Read Rate" icon={Eye} tone="purple" value={rate(summary?.readMessages)} detail={resourceText(usage) || `${count(summary?.readMessages)} read · ${period.toLowerCase()}`} />
          <Metric title="Wallet Balance" icon={WalletCards} tone="amber" value={walletValue} detail={resourceText(wallet) || "Available balance"}>{can("billing.read") && <Button asChild className={styles.walletButton}><Link to="/billing"><Plus size={13} aria-hidden="true" />Add</Link></Button>}</Metric>
        </section>
        <div className={`${styles.primaryGrid} ${!whatsappConnected ? styles.primaryGridSingle : ""}`}>
          {whatsappConnected && <ActivityChart items={usage.data?.daily ?? []} loading={usage.loading} error={usage.error} restricted={usage.restricted} />}
          <Panel title="WhatsApp account" icon={WhatsAppBrandIcon} action={can("whatsapp.read") && <PanelLink to="/whatsapp-account">Manage</PanelLink>}>
              {setup.data && !whatsappConnected ? <div className={styles.healthDisconnected}>
                {Number(welcomeBonusOffer.amount) > 0 && <><TooltipProvider><Tooltip><TooltipTrigger asChild><button type="button" aria-label="About the WhatsApp connection bonus" className="inline-flex h-7 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"><span>Free</span><Coins size={14} className="text-amber-600" aria-hidden="true" /><span>{welcomeBonusOffer.currency === "INR" ? "Rs. " : `${welcomeBonusOffer.currency} `}{new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(welcomeBonusOffer.amount))}</span><Info size={13} className="text-[var(--text-muted)]" aria-hidden="true" /></button></TooltipTrigger><TooltipContent side="top" className="max-w-[260px] text-center leading-5">{welcomeBonusOffer.granted ? "Your welcome credit has already been added to the wallet." : "The credit is added once, after Meta confirms your WhatsApp number is connected."}</TooltipContent></Tooltip></TooltipProvider><span data-testid="connection-bonus-plus" aria-hidden="true" className="-my-1 text-xs font-semibold leading-none text-[var(--text-muted)]">+</span></>}
                {can("whatsapp.manage") ? <Button type="button" onClick={() => setConnectionGuideOpen(true)} disabled={connecting}>
                  <WhatsAppBrandIcon size={17} aria-hidden="true" />Connect WhatsApp
                </Button> : <span>WhatsApp is not connected</span>}
              </div> : <>
                <div className={styles.healthPrimary}><HealthItem icon={Building2} title="Business name" value={account?.displayName ?? (resourceText(setup) || "Not connected")} /><HealthItem icon={Phone} title="Primary number" value={phone?.displayPhoneNumber ?? "—"} /><HealthItem icon={Link2} title="Connection status" value={setup.data ? label(setup.data.whatsapp.status) : resourceText(setup)} tone={statusTone(setup.data?.whatsapp.status)} /></div>
                <div className={styles.healthSecondary}><HealthItem icon={ShieldCheck} title="WABA review" value={label(meta.data?.accountReviewStatus)} tone={statusTone(meta.data?.accountReviewStatus)} /><HealthItem icon={Check} title="Meta account status" value={label(meta.data?.status)} tone={statusTone(meta.data?.status)} /><HealthItem icon={ShieldCheck} title="Business verification" value={label(meta.data?.businessVerificationStatus)} tone={statusTone(meta.data?.businessVerificationStatus)} /></div>
              </>}
          </Panel>
        </div>
        <Panel title="Quick actions" icon={Zap}><div className={styles.quickActions}>{quickActions.map(({ title, to, icon, permission }) => can(permission) ? <Button asChild variant="outline" key={title}><Link to={to}><IconTile icon={icon} /><span>{title}</span><ArrowRight size={13} /></Link></Button> : <Button disabled variant="outline" key={title} title="Access restricted"><IconTile icon={icon} /><span>{title}</span><ArrowRight size={13} /></Button>)}</div></Panel>
        {setupNeeded && <Panel title="Finish workspace setup" icon={CheckCircle2}><DashboardSetupGuide data={setup.data} status={resourceText(setup)} permissions={permissions} /></Panel>}
      </div>
    </div>
    {connectionGuideOpen && <WhatsAppConnectionGuide
      choice={connectionChoice}
      onChoiceChange={setConnectionChoice}
      loading={connecting}
      onClose={() => setConnectionGuideOpen(false)}
      onNext={(choice) => {
        setConnectionGuideOpen(false);
        void start(choice === "new-number" ? "new-number" : "coexistence");
      }}
    />}
    {syncing && <WhatsAppConnectingDialog />}
    {pinRequired && <WhatsAppRegistrationPinDialog
      submitting={connecting}
      error={connectionError}
      onClose={cancelRegistrationPin}
      onSubmit={submitRegistrationPin}
    />}
    {showWelcomeBonus && welcomeBonus.data && <WelcomeBonusDialog amount={welcomeBonus.data.amount} currency={welcomeBonus.data.currency} firstName={user?.firstName ?? ""} onClose={dismissWelcomeBonus} />}
  </div>;
}
