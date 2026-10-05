import { useMemo, useState, type ReactNode, type FormEvent, type SVGProps } from "react";
import { ArrowRight, BookOpen, Building2, CalendarDays, Check, CheckCircle2, Eye, ExternalLink, FileText, Info, Link2, MessageCircle, Phone, Plus, Send, ShieldCheck, Users, WalletCards, Zap, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { siWhatsapp, siYoutube } from "simple-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardSetupGuide, DashboardTutorials } from "@/components/dashboard/DashboardLearning";
import { WhatsAppConnectionGuide, type ConnectionChoice } from "@/components/whatsapp/WhatsAppConnectionGuide";
import { WhatsAppConnectingDialog } from "@/components/whatsapp/WhatsAppConnectingDialog";
import { WhatsAppRegistrationPinDialog } from "@/components/whatsapp/WhatsAppRegistrationPinDialog";
import { useAuth } from "@/contexts/AuthContext";
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

function YouTubeBrandIcon({ size = 17, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...props}><path d={siYoutube.path} /></svg>;
}

function Panel({ title, icon: Icon, action, children, emphasis = false }: { title: string; icon: LucideIcon | typeof WhatsAppBrandIcon | typeof YouTubeBrandIcon; action?: ReactNode; children: ReactNode; emphasis?: boolean }) {
  return <section className={`${styles.panel} ${emphasis ? styles.importantPanel : ""}`} aria-label={title} data-emphasis={emphasis ? "important" : undefined}>
    <header className={styles.panelHeader}><h2><Icon size={17} aria-hidden="true" className={Icon === YouTubeBrandIcon ? styles.youtubeBrand : undefined} />{title}</h2>{action}</header>
    {children}
  </section>;
}

function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className={styles.panelLink}>{children}<ArrowRight size={12} aria-hidden="true" /></Link>;
}

function Sparkline({ values, tone }: { values: number[]; tone: Tone }) {
  if (values.length < 2 || !values.some((value) => value > 0)) return null;
  const max = Math.max(...values, 1);
  const points = values.map((value, index) => `${2 + index * 72 / (values.length - 1)},${28 - value / max * 24}`).join(" ");
  return <svg aria-hidden="true" viewBox="0 0 76 32" className={styles.sparkline} data-tone={tone}><polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

function Metric({ title, value, detail, icon, tone, children }: { title: string; value: string; detail: string; icon: LucideIcon; tone: Tone; children?: ReactNode }) {
  return <section aria-label={title} className={styles.metric}><IconTile icon={icon} tone={tone} round /><div className={styles.metricText}><span>{title}</span><strong>{value}</strong><small>{detail}</small></div>{children}</section>;
}

function HealthItem({ icon, title, value, tone = "neutral" }: { icon: LucideIcon; title: string; value: string; tone?: Tone }) {
  return <div className={styles.healthItem}><IconTile icon={icon} tone={tone} /><div><strong data-tone={tone} title={value}>{value}</strong><small>{title}</small></div></div>;
}

const metaPlatformRules = [
  "Get clear opt-in before sending business-initiated WhatsApp messages.",
  "Reply without a template within 24 hours of the user's latest message.",
  "Outside the 24-hour customer service window, use an approved message template.",
  "Honor opt-out requests and stop messaging people who unsubscribe.",
  "Keep your business profile accurate; don't mislead people or send spam.",
  "Provide a clear way to reach human support when using automated replies.",
];

function MetaPlatformRules() {
  return <div className={styles.informationRules}>
    <ul>{metaPlatformRules.map((rule) => <li key={rule}><CheckCircle2 size={17} aria-hidden="true" /><span>{rule}</span></li>)}</ul>
    <a href="https://business.whatsapp.com/policy" target="_blank" rel="noopener noreferrer">Read WhatsApp Business Messaging Policy<ExternalLink size={14} aria-hidden="true" /></a>
  </div>;
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

  const account = setup.data?.whatsapp.accounts.find((item) => item.status === "CONNECTED") ?? setup.data?.whatsapp.accounts[0];
  const phone = account?.phoneNumbers.find((item) => item.status === "ACTIVE") ?? account?.phoneNumbers[0];
  const whatsappConnected = setup.data?.whatsapp.status === "CONNECTED" && phone?.status === "ACTIVE";
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
        <section className={styles.hero}>
          <div className={styles.greeting}><h1>Welcome back, {user?.firstName ?? "there"}! <span aria-hidden="true">👋</span></h1><p>Here’s what’s happening with your WhatsApp workspace today.</p></div>
          <div className={styles.dateFilters} aria-label="Dashboard date range">{([['today', 'Today'], ['7d', '7 Days'], ['30d', '30 Days']] as const).map(([key, title]) => <Button key={key} variant={range === key ? "default" : "outline"} aria-pressed={range === key} onClick={() => selectRange(key)}>{title}</Button>)}<Button variant={range === "custom" ? "default" : "outline"} aria-expanded={customOpen} onClick={() => setCustomOpen((value) => !value)}><CalendarDays size={13} />Custom</Button></div>
          <img src="/marento-dashboard-hero.png" alt="" className={styles.heroImage} />
        </section>
        {customOpen && <form className={styles.customRange} onSubmit={applyRange} noValidate><label>From<Input type="date" aria-label="From date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label><label>To<Input type="date" aria-label="To date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label><Button type="submit">Apply range</Button>{rangeError && <div role="alert">{rangeError}</div>}</form>}
        <section aria-label="Workspace summary" className={styles.metrics}>
          <Metric title="Messages Sent" icon={Send} tone="green" value={count(sent)} detail={resourceText(usage) || period}><Sparkline values={(usage.data?.daily ?? []).map((item) => item.outgoing)} tone="green" /></Metric>
          <Metric title="Delivered" icon={CheckCircle2} tone="blue" value={count(summary?.deliveredMessages)} detail={resourceText(usage) || `${rate(summary?.deliveredMessages)} delivery rate`}><Sparkline values={(usage.data?.daily ?? []).map((item) => item.delivered)} tone="blue" /></Metric>
          <Metric title="Read Rate" icon={Eye} tone="purple" value={rate(summary?.readMessages)} detail={resourceText(usage) || `${count(summary?.readMessages)} read · ${period.toLowerCase()}`} />
          <Metric title="Wallet Balance" icon={WalletCards} tone="amber" value={walletValue} detail={resourceText(wallet) || "Available balance"}>{can("billing.read") && <Button asChild className={styles.walletButton}><Link to="/billing"><Plus size={13} aria-hidden="true" />Add</Link></Button>}</Metric>
        </section>
        <div className={styles.columns}>
          <div className={styles.column}>
            <Panel title="WhatsApp Account Health" icon={WhatsAppBrandIcon} action={can("whatsapp.read") && <PanelLink to="/whatsapp-account">Manage WhatsApp</PanelLink>}>
              {setup.data && !whatsappConnected ? <div className={styles.healthDisconnected}>
                {can("whatsapp.manage") ? <Button type="button" onClick={() => setConnectionGuideOpen(true)} disabled={connecting}>
                  <WhatsAppBrandIcon size={17} aria-hidden="true" />Connect WhatsApp
                </Button> : <span>WhatsApp is not connected</span>}
              </div> : <>
                <div className={styles.healthPrimary}><HealthItem icon={Building2} title="Business name" value={account?.displayName ?? (resourceText(setup) || "Not connected")} /><HealthItem icon={Phone} title="Primary number" value={phone?.displayPhoneNumber ?? "—"} /><HealthItem icon={Link2} title="Connection status" value={setup.data ? label(setup.data.whatsapp.status) : resourceText(setup)} tone={statusTone(setup.data?.whatsapp.status)} /></div>
                <div className={styles.healthSecondary}><HealthItem icon={ShieldCheck} title="WABA review" value={label(meta.data?.accountReviewStatus)} tone={statusTone(meta.data?.accountReviewStatus)} /><HealthItem icon={Check} title="Meta account status" value={label(meta.data?.status)} tone={statusTone(meta.data?.status)} /><HealthItem icon={ShieldCheck} title="Business verification" value={label(meta.data?.businessVerificationStatus)} tone={statusTone(meta.data?.businessVerificationStatus)} /></div>
              </>}
            </Panel>
            <Panel title="Quick Actions" icon={Zap}><div className={styles.quickActions}>{quickActions.map(({ title, to, icon, permission }) => can(permission) ? <Button asChild variant="outline" key={title}><Link to={to}><IconTile icon={icon} /><span>{title}</span><ArrowRight size={13} /></Link></Button> : <Button disabled variant="outline" key={title} title="Access restricted"><IconTile icon={icon} /><span>{title}</span><ArrowRight size={13} /></Button>)}</div></Panel>
            <Panel title="Important Information" icon={Info} emphasis><MetaPlatformRules /></Panel>
          </div>
          <div className={styles.column}>
            <Panel title="Watch Tutorials" icon={YouTubeBrandIcon}><DashboardTutorials /></Panel>
            <Panel title="Setup Guide" icon={BookOpen}><DashboardSetupGuide data={setup.data} status={resourceText(setup)} permissions={permissions} /></Panel>
          </div>
        </div>
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
  </div>;
}
