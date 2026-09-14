import { ArrowUpRight, Blocks, CheckCircle2, Clock3, Code2, ExternalLink, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import {
  siGooglesheets,
  siHubspot,
  siInstagram,
  siMailchimp,
  siShopify,
  siWhatsapp,
  siWoocommerce,
  siZapier,
  siZendesk,
  siZoho,
  type SimpleIcon,
} from "simple-icons";
import type { ReactNode } from "react";

type Integration = {
  name: string;
  description: string;
  icon: SimpleIcon;
  category: string;
};

const integrations: Integration[] = [
  { name: "Shopify", description: "Connect your store to sync customers and order context.", icon: siShopify, category: "Commerce" },
  { name: "WooCommerce", description: "Bring WooCommerce customer and order data into your workspace.", icon: siWoocommerce, category: "Commerce" },
  { name: "HubSpot", description: "Keep contacts and WhatsApp conversations connected to your CRM.", icon: siHubspot, category: "CRM" },
  { name: "Zoho CRM", description: "Connect your sales pipeline with customer conversations.", icon: siZoho, category: "CRM" },
  { name: "Zendesk", description: "Create a consistent support workflow across your channels.", icon: siZendesk, category: "Support" },
  { name: "Mailchimp", description: "Use audience data to coordinate messaging and campaigns.", icon: siMailchimp, category: "Marketing" },
  { name: "Google Sheets", description: "Export and organize workspace data in shared spreadsheets.", icon: siGooglesheets, category: "Productivity" },
  { name: "Zapier", description: "Connect Aikonnect to thousands of apps with automated workflows.", icon: siZapier, category: "Automation" },
  { name: "Instagram", description: "Bring social conversations and customer context together.", icon: siInstagram, category: "Social" },
];

export function Integrations() {
  return (
    <div data-testid="integrations-page" className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--page-background)]">
      <header className="flex-none border-b border-[var(--border-soft)] bg-white shadow-[0_1px_3px_rgba(30,40,55,.04)]">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-[var(--brand-soft)] text-[var(--brand)]"><Blocks size={18} /></div>
            <h1 className="text-[19px] font-medium leading-6 tracking-[-0.015em] text-[var(--text-primary)]">Integrations</h1>
          </div>
          <span className="hidden rounded-md bg-[var(--surface-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)] sm:inline-flex">Connect your stack</span>
        </div>
      </header>

      <main data-testid="integrations-scroll-region" className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1400px] px-5 py-5 sm:px-8 sm:py-7">
          <section className="rounded-lg border border-[var(--border-soft)] bg-white p-5 shadow-[0_2px_8px_rgba(30,40,55,.04)] sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-sm font-medium text-[var(--text-primary)]">Available now</h2>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--text-muted)]">Manage the tools that share customer context with your WhatsApp workspace.</p>
              </div>
              <Link to="/whatsapp-account" className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[var(--border-strong)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]">
                WhatsApp account <ArrowUpRight size={14} />
              </Link>
            </div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              <ConnectedCard icon={siWhatsapp} name="WhatsApp Business" description="Manage your primary messaging channel from WhatsApp Account." href="/whatsapp-account" />
              <ConnectedCard icon={null} name="API & Webhooks" description="Build custom connections with API keys, webhooks, and delivery events." href="/api-webhooks" />
            </div>
          </section>

          <section className="mt-5">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div><h2 className="text-sm font-medium text-[var(--text-primary)]">More integrations</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Popular platforms we are preparing for Aikonnect.</p></div>
              <span className="text-[11px] text-[var(--text-muted)]">{integrations.length} planned</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {integrations.map((integration) => <IntegrationCard key={integration.name} integration={integration} />)}
            </div>
          </section>

          <section className="mt-5 flex items-start gap-3 rounded-lg border border-[var(--border-soft)] bg-white p-4 text-xs leading-5 text-[var(--text-secondary)] shadow-[0_2px_8px_rgba(30,40,55,.04)]">
            <Clock3 size={16} className="mt-0.5 shrink-0 text-[var(--brand)]" />
            <div><div className="font-medium text-[var(--text-primary)]">More platforms are on the way</div><div className="mt-0.5">These cards are a preview of the integrations planned for upcoming releases. API & Webhooks is available now for custom connections.</div></div>
          </section>
        </div>
      </main>
    </div>
  );
}

function ConnectedCard({ icon, name, description, href }: { icon: SimpleIcon | null; name: string; description: string; href: string }) {
  return <Link to={href} className="group flex items-center justify-between gap-4 rounded-md border border-[var(--border-soft)] bg-[var(--surface-subtle)]/55 p-4 transition-colors hover:border-[var(--brand)]/40 hover:bg-[var(--brand-soft)]/30">
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-[var(--border-soft)] bg-white">{icon ? <BrandLogo icon={icon} size={22} /> : <Code2 size={21} className="text-[var(--brand)]" />}</div>
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-medium text-[var(--text-primary)]">{name}</h3><span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"><CheckCircle2 size={11} />Available</span></div><p className="mt-1 text-xs leading-4 text-[var(--text-muted)]">{description}</p></div>
    </div>
    <ExternalLink size={15} className="shrink-0 text-[var(--text-muted)] transition-colors group-hover:text-[var(--brand)]" />
  </Link>;
}

function IntegrationCard({ integration }: { integration: Integration }) {
  return <article className="flex min-h-[175px] flex-col rounded-lg border border-[var(--border-soft)] bg-white p-4 shadow-[0_2px_8px_rgba(30,40,55,.035)] transition-colors hover:border-[var(--border)]">
    <div className="flex items-start justify-between gap-3"><div className="flex size-11 items-center justify-center rounded-md border border-[var(--border-soft)] bg-white shadow-[0_1px_3px_rgba(30,40,55,.04)]"><BrandLogo icon={integration.icon} size={26} /></div><span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700">Coming soon</span></div>
    <div className="mt-4 flex-1"><div className="flex items-center gap-2"><h3 className="text-sm font-medium text-[var(--text-primary)]">{integration.name}</h3><span className="text-[10px] text-[var(--text-muted)]">{integration.category}</span></div><p className="mt-1.5 text-xs leading-5 text-[var(--text-muted)]">{integration.description}</p></div>
    <button type="button" disabled className="mt-4 h-8 w-full cursor-not-allowed rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] text-xs font-medium text-[var(--text-muted)]">Coming soon</button>
  </article>;
}

function BrandLogo({ icon, size }: { icon: SimpleIcon; size: number }) {
  return <svg aria-label={`${icon.title} logo`} role="img" viewBox="0 0 24 24" width={size} height={size} fill={`#${icon.hex}`} xmlns="http://www.w3.org/2000/svg"><path d={icon.path} /></svg>;
}
