import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, BookOpen, Check, Clipboard, Code2, KeyRound, Link2, Plus, RefreshCw, ShieldCheck, Trash2, Webhook } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getActiveMembership } from "@/lib/workspace";
import { ApiError, apiRequest } from "@/lib/api";

type ApiKey = {
  id: string; name: string; keyPrefix: string; scopes: string[];
  lastUsedAt: string | null; expiresAt: string | null; revokedAt: string | null; createdAt: string;
};
type WebhookEndpoint = {
  id: string; name: string; url: string; events: string[]; active: boolean;
  lastDeliveredAt: string | null; createdAt: string;
};
type ApiKeyCreateResponse = { apiKey: ApiKey; secret: string };
type ApiKeyListResponse = { items: ApiKey[] };
type WebhookCreateResponse = { webhook: WebhookEndpoint; secret: string };
type WebhookListResponse = { items: WebhookEndpoint[] };

const basePath = "/api/v1/public";
const apiExamples = [
  { method: "POST", path: "/contacts", description: "Create or update a contact" },
  { method: "POST", path: "/events", description: "Send an event from your system" },
  { method: "POST", path: "/messages/template", description: "Send an approved WhatsApp template" },
  { method: "GET", path: "/conversations", description: "Read conversations and history" },
];
const defaultWebhookEvents = ["message.received", "message.sent", "message.delivered", "message.read", "message.failed"];

function dateLabel(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function SecretNotice({ secret, label, onCopy }: { secret: string; label: string; onCopy: () => void }) {
  const [copied, setCopied] = useState(false);
  return <div role="alert" data-testid={`${label}-secret`} className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 p-4"><div className="flex items-start gap-3"><Check size={17} className="mt-0.5 shrink-0 text-emerald-700" /><div className="min-w-0 flex-1"><p className="text-sm font-medium text-emerald-900">{label} created</p><p className="mt-1 text-xs leading-5 text-emerald-800">Copy this secret now. For your security, it will not be shown again.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input aria-label={`${label} secret`} readOnly value={secret} className="h-9 min-w-0 flex-1 rounded-md border border-emerald-300 bg-white px-3 font-mono text-xs text-emerald-950 outline-none" /><button type="button" onClick={() => { onCopy(); setCopied(true); }} className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 text-xs font-medium text-emerald-800 hover:bg-emerald-100">{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? "Copied" : "Copy secret"}</button></div></div></div></div>;
}

export function ApiWebhooks() {
  const { accessToken, user } = useAuth();
  const membership = getActiveMembership(user);
  const workspaceId = membership?.workspace.id;
  const canManage = membership?.role.permissions.includes("workspace.update") ?? false;
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [name, setName] = useState("");
  const [endpointName, setEndpointName] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [secret, setSecret] = useState<{ value: string; label: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadKeys = async () => {
    if (!accessToken || !workspaceId) return;
    setLoading(true);
    try {
      const result = await apiRequest<ApiKeyListResponse>(`/workspaces/${workspaceId}/api-keys`, { headers: { authorization: `Bearer ${accessToken}` } });
      setKeys(result.items); setError(null);
    } catch (caughtError) { setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load API keys."); }
    finally { setLoading(false); }
  };

  const loadWebhooks = async () => {
    if (!accessToken || !workspaceId) return;
    try {
      const result = await apiRequest<WebhookListResponse>(`/workspaces/${workspaceId}/webhooks`, { headers: { authorization: `Bearer ${accessToken}` } });
      setWebhooks(result.items);
    } catch (caughtError) { setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load webhook endpoints."); }
  };

  useEffect(() => { void loadKeys(); void loadWebhooks(); }, [accessToken, workspaceId]);

  const createKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !workspaceId || !canManage || !name.trim()) return;
    setSaving(true); setError(null); setSecret(null);
    try {
      const result = await apiRequest<ApiKeyCreateResponse>(`/workspaces/${workspaceId}/api-keys`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ name: name.trim() }) });
      setKeys((current) => [result.apiKey, ...current]); setSecret({ value: result.secret, label: "API key" }); setName("");
    } catch (caughtError) { setError(caughtError instanceof ApiError ? caughtError.message : "Unable to create API key."); }
    finally { setSaving(false); }
  };

  const createWebhook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !workspaceId || !canManage || !endpointName.trim() || !endpointUrl.trim()) return;
    setSavingWebhook(true); setError(null); setSecret(null);
    try {
      const result = await apiRequest<WebhookCreateResponse>(`/workspaces/${workspaceId}/webhooks`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ name: endpointName.trim(), url: endpointUrl.trim(), events: defaultWebhookEvents }) });
      setWebhooks((current) => [result.webhook, ...current]); setSecret({ value: result.secret, label: "Webhook secret" }); setEndpointName(""); setEndpointUrl("");
    } catch (caughtError) { setError(caughtError instanceof ApiError ? caughtError.message : "Unable to create webhook endpoint."); }
    finally { setSavingWebhook(false); }
  };

  const revokeKey = async (key: ApiKey) => {
    if (!accessToken || !workspaceId || !canManage || key.revokedAt || !window.confirm(`Revoke “${key.name}”? Existing integrations using it will stop working.`)) return;
    try { await apiRequest<void>(`/workspaces/${workspaceId}/api-keys/${key.id}`, { method: "DELETE", headers: { authorization: `Bearer ${accessToken}` } }); setKeys((current) => current.map((item) => item.id === key.id ? { ...item, revokedAt: new Date().toISOString() } : item)); }
    catch (caughtError) { setError(caughtError instanceof ApiError ? caughtError.message : "Unable to revoke API key."); }
  };

  const removeWebhook = async (webhook: WebhookEndpoint) => {
    if (!accessToken || !workspaceId || !canManage || !window.confirm(`Remove “${webhook.name}”?`)) return;
    try { await apiRequest<void>(`/workspaces/${workspaceId}/webhooks/${webhook.id}`, { method: "DELETE", headers: { authorization: `Bearer ${accessToken}` } }); setWebhooks((current) => current.filter((item) => item.id !== webhook.id)); }
    catch (caughtError) { setError(caughtError instanceof ApiError ? caughtError.message : "Unable to remove webhook endpoint."); }
  };

  const activeKeyCount = useMemo(() => keys.filter((key) => !key.revokedAt).length, [keys]);
  if (!membership) return <div className="flex h-full items-center justify-center bg-[var(--page-background)] p-6 text-sm text-[var(--text-secondary)]">No workspace is available for this account.</div>;

  return <div data-testid="api-webhooks-page" className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--page-background)]">
    <header data-testid="api-webhooks-header" className="flex flex-none items-center border-b border-[var(--border-soft)] bg-white px-5 py-4 shadow-[0_1px_3px_rgba(16,24,20,.035)] sm:px-8"><div className="mx-auto w-full max-w-[1100px]"><h1 className="text-[19px] font-medium leading-tight text-[var(--text-primary)]">API &amp; Webhooks</h1></div></header>
    <div data-testid="api-webhooks-scroll-region" className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-[1100px] space-y-5 px-5 py-5 sm:px-8 sm:py-7">
      {!canManage && <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800"><ShieldCheck size={16} className="mt-0.5 shrink-0" />Only workspace administrators can create or revoke integration credentials. You can still read the documentation.</div>}
      {error && <div role="alert" className="flex items-start gap-3 rounded-md border border-red-100 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}</div>}

      <section data-testid="api-key-section" className="rounded-md border border-[var(--border)] bg-white shadow-[0_2px_8px_rgba(30,40,55,.035)]"><div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-soft)] px-5 py-4 sm:px-6"><div className="flex items-start gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--brand-soft)] text-[var(--brand)]"><KeyRound size={18} /></div><div><h2 className="text-[15px] font-medium text-[var(--text-primary)]">API keys</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">Use a key to authenticate requests from your website or business tools.</p></div></div><span className="rounded-full bg-[var(--gray-100)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]">{activeKeyCount} active</span></div><div className="p-5 sm:p-6">
        {secret?.label === "API key" && <SecretNotice secret={secret.value} label={secret.label} onCopy={() => void navigator.clipboard?.writeText(secret.value)} />}
        <form onSubmit={createKey} className="flex flex-col gap-2 sm:flex-row sm:items-end"><div className="min-w-0 flex-1"><label htmlFor="api-key-name" className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]">Key name</label><input id="api-key-name" value={name} onChange={(event) => setName(event.target.value)} disabled={!canManage || saving} placeholder="e.g. Shopify integration" className="h-10 w-full rounded-md border border-[var(--border-strong)] bg-white px-3 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/10 disabled:cursor-not-allowed disabled:bg-[var(--gray-100)]" /></div><button type="submit" disabled={!canManage || saving || !name.trim()} className="flex h-10 items-center justify-center gap-1.5 rounded-md bg-[var(--brand)] px-4 text-xs font-medium text-white hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-50"><Plus size={15} />{saving ? "Generating…" : "Generate API key"}</button></form>
        <div className="mt-5 overflow-x-auto rounded-md border border-[var(--border-soft)]"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-[var(--table-header)] text-[11px] uppercase tracking-[.03em] text-[var(--text-muted)]"><tr><th className="px-4 py-3 font-semibold">Name</th><th className="px-4 py-3 font-semibold">Key</th><th className="px-4 py-3 font-semibold">Last used</th><th className="px-4 py-3 text-right font-semibold">Action</th></tr></thead><tbody>{loading ? <tr><td colSpan={4} className="px-4 py-7 text-center text-[var(--text-secondary)]">Loading API keys…</td></tr> : keys.length === 0 ? <tr><td colSpan={4} className="px-4 py-7 text-center text-[var(--text-secondary)]">No API keys yet.</td></tr> : keys.map((key) => <tr key={key.id} className="border-t border-[var(--border-soft)]"><td className="px-4 py-3 font-medium text-[var(--text-primary)]">{key.name}<div className="mt-0.5 text-[11px] font-normal text-[var(--text-muted)]">Created {dateLabel(key.createdAt)}</div></td><td className="px-4 py-3 font-mono text-[11px] text-[var(--text-secondary)]">{key.keyPrefix}</td><td className="px-4 py-3 text-[var(--text-secondary)]">{key.revokedAt ? <span className="text-red-600">Revoked</span> : dateLabel(key.lastUsedAt)}</td><td className="px-4 py-3 text-right"><button type="button" disabled={!canManage || Boolean(key.revokedAt)} onClick={() => void revokeKey(key)} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={14} />Revoke</button></td></tr>)}</tbody></table></div><p className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-[var(--text-muted)]"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-[var(--brand)]" />Keys are shown only by their prefix after creation. Never share a secret in frontend code or source control.</p>
      </div></section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]"><section data-testid="api-docs-section" className="rounded-md border border-[var(--border)] bg-white shadow-[0_2px_8px_rgba(30,40,55,.035)]"><div className="flex items-start gap-3 border-b border-[var(--border-soft)] px-5 py-4"><div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--brand-soft)] text-[var(--brand)]"><BookOpen size={18} /></div><div><h2 className="text-[15px] font-medium text-[var(--text-primary)]">API documentation</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">Connect your own system using simple JSON requests.</p></div></div><div className="space-y-4 p-5 sm:p-6"><div><p className="mb-1.5 text-xs font-medium text-[var(--text-primary)]">Base URL</p><code className="block overflow-x-auto rounded-md bg-slate-950 px-3 py-2.5 font-mono text-xs text-slate-100">https://your-domain.com{basePath}</code></div><div><p className="mb-1.5 text-xs font-medium text-[var(--text-primary)]">Authentication</p><pre className="overflow-x-auto rounded-md bg-slate-950 px-3 py-2.5 font-mono text-xs leading-5 text-slate-100">{`Authorization: Bearer sk_live_...\nContent-Type: application/json`}</pre></div><div><p className="mb-2 text-xs font-medium text-[var(--text-primary)]">Core endpoints</p><div className="space-y-1.5">{apiExamples.map((item) => <div key={item.path} className="flex items-center gap-2 rounded-md border border-[var(--border-soft)] px-3 py-2"><span className="w-10 font-mono text-[10px] font-semibold text-[var(--brand)]">{item.method}</span><code className="font-mono text-[11px] text-[var(--text-primary)]">{item.path}</code><span className="ml-auto text-right text-[11px] text-[var(--text-muted)]">{item.description}</span></div>)}</div></div><div className="rounded-md bg-[var(--gray-100)] p-3 text-[11px] leading-5 text-[var(--text-secondary)]"><Code2 size={14} className="mb-1 text-[var(--brand)]" />Keep API keys on your server and add an <code>Idempotency-Key</code> when retrying writes.</div></div></section>

        <section data-testid="webhooks-section" className="rounded-md border border-[var(--border)] bg-white shadow-[0_2px_8px_rgba(30,40,55,.035)]"><div className="flex items-start gap-3 border-b border-[var(--border-soft)] px-5 py-4"><div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--brand-soft)] text-[var(--brand)]"><Webhook size={18} /></div><div><h2 className="text-[15px] font-medium text-[var(--text-primary)]">Webhooks</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">Receive updates in your system when something changes.</p></div></div><div className="space-y-4 p-5 sm:p-6">
          {secret?.label === "Webhook secret" && <SecretNotice secret={secret.value} label={secret.label} onCopy={() => void navigator.clipboard?.writeText(secret.value)} />}
          <form onSubmit={createWebhook} className="space-y-3 rounded-md border border-dashed border-[var(--border-strong)] p-4"><div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]"><Link2 size={15} className="text-[var(--brand)]" />Add a webhook endpoint</div><div><label htmlFor="webhook-name" className="mb-1.5 block text-xs font-medium">Endpoint name</label><input id="webhook-name" value={endpointName} onChange={(event) => setEndpointName(event.target.value)} disabled={!canManage || savingWebhook} placeholder="e.g. Production app" className="h-9 w-full rounded-md border border-[var(--border-strong)] px-3 text-xs outline-none focus:border-[var(--brand)] disabled:bg-[var(--gray-100)]" /></div><div><label htmlFor="webhook-url" className="mb-1.5 block text-xs font-medium">HTTPS endpoint URL</label><input id="webhook-url" type="url" value={endpointUrl} onChange={(event) => setEndpointUrl(event.target.value)} disabled={!canManage || savingWebhook} placeholder="https://example.com/webhooks" className="h-9 w-full rounded-md border border-[var(--border-strong)] px-3 text-xs outline-none focus:border-[var(--brand)] disabled:bg-[var(--gray-100)]" /></div><button type="submit" disabled={!canManage || savingWebhook || !endpointName.trim() || !endpointUrl.trim()} className="flex h-9 items-center gap-1.5 rounded-md bg-[var(--brand)] px-3 text-xs font-medium text-white hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-50"><Plus size={14} />{savingWebhook ? "Saving…" : "Add endpoint"}</button></form>
          {webhooks.length > 0 && <div className="space-y-2">{webhooks.map((webhook) => <div key={webhook.id} className="rounded-md border border-[var(--border-soft)] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium text-[var(--text-primary)]">{webhook.name}</p><p className="mt-1 truncate font-mono text-[11px] text-[var(--text-secondary)]">{webhook.url}</p></div><button type="button" disabled={!canManage} onClick={() => void removeWebhook(webhook)} aria-label={`Remove ${webhook.name}`} className="flex size-7 shrink-0 items-center justify-center rounded-md text-red-600 hover:bg-red-50 disabled:opacity-40"><Trash2 size={14} /></button></div><div className="mt-2 flex flex-wrap gap-1.5">{webhook.events.map((event) => <span key={event} className="rounded bg-[var(--gray-100)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">{event}</span>)}</div></div>)}</div>}
          <div><p className="mb-2 text-xs font-medium text-[var(--text-primary)]">Delivery security</p><ul className="space-y-2 text-xs leading-5 text-[var(--text-secondary)]"><li className="flex gap-2"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-[var(--brand)]" />Use HTTPS and verify the HMAC signature.</li><li className="flex gap-2"><RefreshCw size={14} className="mt-0.5 shrink-0 text-[var(--brand)]" />Return HTTP 200 quickly and process events asynchronously.</li><li className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-[var(--brand)]" />Make handlers idempotent because delivery may be retried.</li></ul></div><p className="rounded-md bg-[var(--gray-100)] p-3 text-[11px] leading-5 text-[var(--text-secondary)]">Endpoint registration is ready. Event delivery will be connected to the platform event stream next.</p>
        </div></section>
      </div>
    </div></div>
  </div>;
}
