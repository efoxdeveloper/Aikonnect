import { useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, Ban, CheckCircle2, Pause, Play, Search, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { DataGrid, GridActionsCellItem, type GridColDef } from "@mui/x-data-grid";
import { useLocation } from "react-router-dom";
import { ApiError, apiRequest } from "@/lib/api";
import { AuthContext } from "@/contexts/AuthContext";

type Pagination = { page: number; pageSize: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean };
type ListResponse<T> = { items: T[]; pagination: Pagination };
type UserSummary = { total: number; active: number; verified: number; googleSignups: number };
type UserListResponse = ListResponse<UserItem> & { summary?: UserSummary };
type CountMap = Record<string, number>;
type WorkspaceItem = { id: string; name: string; slug: string; companyName: string | null; industry: string | null; country: string | null; timezone: string | null; createdAt: string; updatedAt: string; onboardingCompletedAt: string | null; status: string; owner: { email: string; firstName: string; lastName: string; status: string }; setupProgress: { completedAt: string | null; whatsappConnectedAt: string | null; phoneNumberConnectedAt: string | null; testMessageSentAt: string | null } | null; _count: CountMap };
type UserItem = { id: string; email: string; firstName: string; lastName: string; phone: string | null; status: string; platformRole: string; signupSource?: string; emailVerifiedAt: string | null; lastLoginAt: string | null; createdAt: string; memberships: Array<{ status: string; workspace: { id: string; name: string }; role: { name: string; slug: string } }>; _count: { memberships: number; sessions: number } };
type WhatsAppItem = { id: string; displayName: string | null; metaBusinessId: string | null; metaWabaId: string | null; status: string; connectedAt: string | null; lastSyncedAt: string | null; lastError: string | null; sharedBillingStatus: string; sharedBillingAllocationId: string | null; workspace: { id: string; name: string; slug: string }; phoneNumbers: Array<{ id: string; displayPhoneNumber: string; verifiedName: string | null; status: string; qualityRating: string | null; messagingLimit: string | null; isOnBusinessApp: boolean; platformType: string | null; lastSyncedAt: string | null }> };
type WebhookItem = { id: string; name: string; url: string; events: string[]; active: boolean; lastDeliveredAt: string | null; createdAt: string; updatedAt: string; secretConfigured: boolean; workspace: { id: string; name: string; slug: string }; createdBy: { email: string; firstName: string; lastName: string } | null };
type AuditItem = { id: string; action: string; resourceType: string; resourceId: string | null; workspaceId: string | null; metadata: unknown; ipAddress: string | null; userAgent: string | null; createdAt: string; actorUser: { id: string; email: string; firstName: string; lastName: string; platformRole: string } };

const titles: Record<string, string> = { workspaces: "Workspaces", users: "Users", "platform-admins": "Platform admins", whatsapp: "WhatsApp connections", webhooks: "Webhook endpoints", "audit-logs": "Audit log", billing: "Billing & subscriptions", usage: "Usage & limits", health: "System health", settings: "Platform settings", "feature-flags": "Feature flags" };
const listSections = new Set(["workspaces", "users", "platform-admins", "whatsapp", "webhooks", "audit-logs"]);

function date(value: string | null | undefined) { return value ? new Date(value).toLocaleString() : "—"; }
function number(value: number | undefined) { return (value ?? 0).toLocaleString(); }
function titleCase(value: string) { return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function amountToMinor(value: string) { const [whole, fraction = ""] = value.trim().split("."); if (!/^\d+$/.test(whole ?? "") || !/^\d{0,2}$/.test(fraction)) return null; return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")); }
function minorToAmount(value: bigint) { const whole = value / 100n; const fraction = (value % 100n).toString().padStart(2, "0"); return `${whole.toString()}.${fraction}`; }
function Status({ value }: { value: string }) { const good = ["ACTIVE", "CONNECTED", "HEALTHY", "APPROVED", "GREEN"].includes(value.toUpperCase()); return <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-medium ${good ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{titleCase(value)}</span>; }
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-lg border border-[var(--border-soft)] bg-white p-5 shadow-[0_2px_8px_rgba(30,40,55,.04)]"><div className="text-xs text-[var(--text-muted)]">{label}</div><div className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{typeof value === "number" ? number(value) : value}</div></div>; }
function Table({ children }: { children: ReactNode }) { return <div className="overflow-hidden rounded-lg border border-[var(--border-soft)] bg-white shadow-[0_2px_8px_rgba(30,40,55,.04)]"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs">{children}</table></div></div>; }
function Empty({ children }: { children: ReactNode }) { return <div className="rounded-lg border border-dashed border-[var(--border)] bg-white p-10 text-center text-sm text-[var(--text-muted)]">{children}</div>; }

function useAdminData(section: string, search: string, page: number, refreshVersion: number) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const endpoint = `/admin/${section}`;
  const requestKey = `${section}:${search}:${page}:${refreshVersion}`;
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setLoadedKey(null);
    const params = new URLSearchParams();
    if (listSections.has(section)) { params.set("page", String(page)); params.set("pageSize", "25"); if (search.trim()) params.set("search", search.trim()); }
    void apiRequest(endpoint + (params.toString() ? `?${params.toString()}` : ""))
      .then((result) => { if (!cancelled) { setData(result); setLoadedKey(requestKey); } })
      .catch((caughtError: unknown) => { if (!cancelled) setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load this platform section."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [endpoint, page, requestKey, search, section]);
  return { data: loadedKey === requestKey ? data : null, loading: loading || loadedKey !== requestKey, error };
}

function ListControls({ search, setSearch, onSubmit }: { search: string; setSearch: (value: string) => void; onSubmit: (event: FormEvent) => void }) { return <form onSubmit={onSubmit} className="flex w-full max-w-[330px] items-center gap-2"><label className="sr-only" htmlFor="platform-search">Search</label><div className="relative min-w-0 flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" /><input id="platform-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" className="h-9 w-full rounded-md border border-[var(--border)] bg-white pl-9 pr-3 text-xs outline-none focus:border-[var(--brand)]" /></div><button type="submit" className="h-9 rounded-md bg-[var(--brand)] px-3 text-xs font-medium text-white">Search</button></form>; }
function PageHeader({ title, list, search, setSearch, onSubmit }: { title: string; list: boolean; search: string; setSearch: (value: string) => void; onSubmit: (event: FormEvent) => void }) { return <header className="flex flex-col gap-3 border-b border-[var(--border-soft)] pb-5 sm:flex-row sm:items-center sm:justify-between"><h1 className="text-[22px] font-medium tracking-[-0.02em] text-[var(--text-primary)]">{title}</h1>{list && <ListControls search={search} setSearch={setSearch} onSubmit={onSubmit} />}</header>; }

type PageChange = (page: number) => void;
function Workspaces({ result, onPageChange }: { result: ListResponse<WorkspaceItem>; onPageChange: PageChange }) { return <><Table><thead className="border-b border-[var(--border-soft)] bg-[var(--page-background)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="px-5 py-3">Workspace</th><th className="px-5 py-3">Owner</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">People</th><th className="px-5 py-3">Data</th><th className="px-5 py-3">Created</th></tr></thead><tbody className="divide-y divide-[var(--border-soft)]">{result.items.map((item) => <tr key={item.id} className="align-top"><td className="px-5 py-4"><div className="font-medium text-[var(--text-primary)]">{item.name}</div><div className="mt-1 text-[11px] text-[var(--text-muted)]">{item.slug} · {item.companyName ?? "No company name"}</div></td><td className="px-5 py-4"><div>{item.owner.firstName} {item.owner.lastName}</div><div className="mt-1 text-[11px] text-[var(--text-muted)]">{item.owner.email}</div></td><td className="px-5 py-4"><Status value={item.status} /><div className="mt-2 text-[11px] text-[var(--text-muted)]">{item.setupProgress?.completedAt ? "Setup complete" : "Setup incomplete"}</div></td><td className="px-5 py-4">{number(item._count.memberships)}</td><td className="px-5 py-4 text-[11px] leading-5 text-[var(--text-secondary)]">{number(item._count.contacts)} contacts<br />{number(item._count.messages)} messages<br />{number(item._count.whatsappBusinessAccounts)} WhatsApp accounts</td><td className="whitespace-nowrap px-5 py-4 text-[11px] text-[var(--text-muted)]">{date(item.createdAt)}</td></tr>)}</tbody></Table><Pagination data={result.pagination} onPageChange={onPageChange} /></>; }
type UserGridRow = UserItem & { serialNumber: number };
type UserAction = "ACTIVATE" | "SUSPEND" | "BLOCK" | "DELETE";
type UserActionHandler = (user: UserGridRow, action: UserAction) => void;
function userGridColumns(onAction: UserActionHandler, canManage: boolean): GridColDef<UserGridRow>[] { return [
  { field: "serialNumber", headerName: "S.No", width: 70, sortable: false, align: "center", headerAlign: "center" },
  { field: "name", headerName: "Name", minWidth: 190, flex: 1.1, sortable: false, renderCell: ({ row }) => <div className="min-w-0 py-1"><div className="truncate font-medium text-[var(--text-primary)]">{row.firstName} {row.lastName}</div><div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{row.status === "ACTIVE" ? "Active account" : titleCase(row.status)}</div></div> },
  { field: "phone", headerName: "Phone", minWidth: 145, flex: .8, sortable: false, renderCell: ({ row }) => <span className="truncate text-[var(--text-secondary)]">{row.phone ?? "—"}</span> },
  { field: "email", headerName: "Email", minWidth: 245, flex: 1.35, sortable: false, renderCell: ({ row }) => <div className="flex min-w-0 items-center gap-1.5"><span className="truncate text-[var(--text-secondary)]">{row.email}</span>{row.emailVerifiedAt && <CheckCircle2 aria-label="Email verified" size={15} className="shrink-0 text-emerald-600" />}</div> },
  { field: "signupSource", headerName: "Signup source", minWidth: 135, flex: .8, sortable: false, renderCell: ({ row }) => <span className="truncate text-[var(--text-secondary)]">{row.signupSource ?? "Manual signup"}</span> },
  { field: "status", headerName: "Status", minWidth: 135, flex: .7, sortable: false, renderCell: ({ row }) => <div className="py-0.5"><Status value={row.status} /><div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{number(row._count.sessions)} sessions</div></div> },
  { field: "workspaces", headerName: "Workspaces", minWidth: 210, flex: 1, sortable: false, renderCell: ({ row }) => <div className="py-0.5"><div>{number(row._count.memberships)}</div><div className="mt-0.5 max-w-[190px] text-[11px] leading-4 text-[var(--text-muted)]">{row.memberships.slice(0, 2).map((membership) => <div key={membership.workspace.id} className="truncate">{membership.workspace.name} · {membership.role.name}</div>)}</div></div> },
  { field: "lastLoginAt", headerName: "Last login", minWidth: 155, flex: .9, sortable: false, valueGetter: (_value, row) => date(row.lastLoginAt) },
  { field: "createdAt", headerName: "Created", minWidth: 155, flex: .9, sortable: false, valueGetter: (_value, row) => date(row.createdAt) },
  { field: "actions", type: "actions", headerName: "Actions", width: 84, getActions: ({ row }) => !canManage ? [] : row.platformRole !== "NONE" ? [<GridActionsCellItem key="protected" icon={<ShieldCheck size={17} />} label="Platform admin protected" disabled showInMenu />] : [
    <GridActionsCellItem key="status" icon={row.status === "ACTIVE" ? <Pause size={17} /> : <Play size={17} />} label={row.status === "ACTIVE" ? "Suspend" : "Activate"} onClick={() => onAction(row, row.status === "ACTIVE" ? "SUSPEND" : "ACTIVATE")} showInMenu />,
    ...(row.status !== "DISABLED" ? [<GridActionsCellItem key="block" icon={<Ban size={17} />} label="Block" onClick={() => onAction(row, "BLOCK")} showInMenu />] : []),
    <GridActionsCellItem key="delete" icon={<Trash2 size={17} />} label="Delete" onClick={() => onAction(row, "DELETE")} showInMenu />,
  ] },
]; }

function Users({ result, onPageChange, onRefresh }: { result: UserListResponse; onPageChange: PageChange; onRefresh: () => void }) {
  const auth = useContext(AuthContext);
  const canManage = auth?.user?.platformRole === "ADMIN" || auth?.user?.platformRole === "SUPER_ADMIN";
  const [workingUserId, setWorkingUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const summary = result.summary ?? { total: result.pagination.total, active: result.items.filter((item) => item.status === "ACTIVE").length, verified: result.items.filter((item) => item.emailVerifiedAt).length, googleSignups: result.items.filter((item) => item.signupSource === "Google signup").length };
  const handleAction = useCallback(async (user: UserGridRow, action: UserAction) => {
    if (workingUserId) return;
    const labels: Record<UserAction, string> = { ACTIVATE: "activate", SUSPEND: "suspend", BLOCK: "block", DELETE: "delete" };
    let confirmation: string | undefined;
    if (action === "DELETE") {
      confirmation = window.prompt(`Type ${user.email} to permanently delete this account.`) ?? undefined;
      if (confirmation !== user.email) {
        if (confirmation !== undefined) setActionError(`Deletion cancelled: type ${user.email} exactly to confirm.`);
        return;
      }
    } else if (!window.confirm(`Are you sure you want to ${labels[action]} ${user.firstName} ${user.lastName}?`)) return;
    setWorkingUserId(user.id); setActionError(null);
    try {
      await apiRequest(`/admin/users/${user.id}/actions`, { method: "POST", body: JSON.stringify({ action, ...(confirmation ? { confirmation } : {}) }) });
      onRefresh();
    } catch (caughtError: unknown) {
      setActionError(caughtError instanceof ApiError ? caughtError.message : `Unable to ${labels[action]} this user.`);
    } finally { setWorkingUserId(null); }
  }, [onRefresh, workingUserId]);
  const columns = useMemo(() => userGridColumns(handleAction, canManage), [canManage, handleAction]);
  return <div className="space-y-4">{actionError && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{actionError}</div>}<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Total users" value={summary.total} /><Metric label="Active users" value={summary.active} /><Metric label="Verified emails" value={summary.verified} /><Metric label="Google signups" value={summary.googleSignups} /></div><div data-testid="users-data-grid" className="h-[min(620px,calc(100dvh-390px))] min-h-[420px] overflow-hidden rounded-lg border border-[var(--border-soft)] bg-white shadow-[0_2px_8px_rgba(30,40,55,.04)]">
    <DataGrid
      rows={result.items.map((item, index) => ({ ...item, serialNumber: (result.pagination.page - 1) * result.pagination.pageSize + index + 1 }))}
      columns={columns}
      rowCount={result.pagination.total}
      paginationMode="server"
      paginationModel={{ page: result.pagination.page - 1, pageSize: result.pagination.pageSize }}
      onPaginationModelChange={({ page }) => { if (page + 1 !== result.pagination.page) onPageChange(page + 1); }}
      pageSizeOptions={[result.pagination.pageSize]}
      loading={Boolean(workingUserId)}
      rowHeight={52}
      columnHeaderHeight={38}
      disableRowSelectionOnClick
      showToolbar
      sx={{
        border: 0,
        fontFamily: "var(--font-sans)",
        fontSize: 12,
        color: "var(--text-primary)",
        "& .MuiDataGrid-toolbarContainer": { minHeight: 44, borderBottom: "1px solid var(--border-soft)", padding: "0 12px" },
        "& .MuiDataGrid-columnHeaders": { backgroundColor: "var(--page-background)", borderBottom: "1px solid var(--border-soft)", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" },
        "& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-cell:focus": { outline: "none" },
        "& .MuiDataGrid-cell": { borderBottom: "1px solid var(--border-soft)", alignItems: "flex-start", whiteSpace: "normal", py: 0.5 },
        "& .MuiDataGrid-row:hover": { backgroundColor: "var(--page-background)" },
        "& .MuiDataGrid-footerContainer": { minHeight: 48, borderTop: "1px solid var(--border-soft)" },
      }}
    />
  </div></div>;
}
function WhatsApp({ result, onPageChange }: { result: ListResponse<WhatsAppItem>; onPageChange: PageChange }) { return <><Table><thead className="border-b border-[var(--border-soft)] bg-[var(--page-background)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="px-5 py-3">Business account</th><th className="px-5 py-3">Workspace</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Phone numbers</th><th className="px-5 py-3">Billing</th><th className="px-5 py-3">Sync / error</th></tr></thead><tbody className="divide-y divide-[var(--border-soft)]">{result.items.map((item) => <tr key={item.id} className="align-top"><td className="px-5 py-4"><div className="font-medium text-[var(--text-primary)]">{item.displayName ?? "Unnamed business account"}</div><div className="mt-1 text-[11px] text-[var(--text-muted)]">WABA {item.metaWabaId ?? "—"}<br />Business {item.metaBusinessId ?? "—"}</div></td><td className="px-5 py-4">{item.workspace.name}<div className="mt-1 text-[11px] text-[var(--text-muted)]">{item.workspace.slug}</div></td><td className="px-5 py-4"><Status value={item.status} /><div className="mt-2 text-[11px] text-[var(--text-muted)]">Connected {date(item.connectedAt)}</div></td><td className="px-5 py-4"><div className="font-medium">{number(item.phoneNumbers.length)}</div><div className="mt-2 space-y-1 text-[11px] text-[var(--text-muted)]">{item.phoneNumbers.slice(0, 3).map((phone) => <div key={phone.id}>{phone.displayPhoneNumber} · {titleCase(phone.status)}</div>)}</div></td><td className="px-5 py-4"><Status value={item.sharedBillingStatus} /><div className="mt-2 text-[11px] text-[var(--text-muted)]">Allocation {item.sharedBillingAllocationId ?? "—"}</div></td><td className="max-w-[240px] px-5 py-4 text-[11px] leading-5 text-[var(--text-muted)]">Last sync {date(item.lastSyncedAt)}{item.lastError && <div className="mt-1 text-red-700">{item.lastError}</div>}</td></tr>)}</tbody></Table><Pagination data={result.pagination} onPageChange={onPageChange} /></>; }
function Webhooks({ result, onPageChange }: { result: ListResponse<WebhookItem>; onPageChange: PageChange }) { return <><Table><thead className="border-b border-[var(--border-soft)] bg-[var(--page-background)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="px-5 py-3">Endpoint</th><th className="px-5 py-3">Workspace</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Events</th><th className="px-5 py-3">Last delivery</th></tr></thead><tbody className="divide-y divide-[var(--border-soft)]">{result.items.map((item) => <tr key={item.id} className="align-top"><td className="px-5 py-4"><div className="font-medium text-[var(--text-primary)]">{item.name}</div><div className="mt-1 max-w-[360px] truncate text-[11px] text-[var(--text-muted)]">{item.url}</div><div className="mt-2 text-[11px] text-[var(--text-muted)]">Secret configured: {item.secretConfigured ? "Yes" : "No"}</div></td><td className="px-5 py-4">{item.workspace.name}</td><td className="px-5 py-4"><Status value={item.active ? "ACTIVE" : "DISABLED"} /></td><td className="px-5 py-4"><div>{number(item.events.length)} subscribed</div><div className="mt-1 max-w-[210px] text-[11px] text-[var(--text-muted)]">{item.events.slice(0, 4).join(", ") || "No events"}</div></td><td className="whitespace-nowrap px-5 py-4 text-[11px] text-[var(--text-muted)]">{date(item.lastDeliveredAt)}</td></tr>)}</tbody></Table><Pagination data={result.pagination} onPageChange={onPageChange} /></>; }
function AuditLogs({ result, onPageChange }: { result: ListResponse<AuditItem>; onPageChange: PageChange }) { return <><Table><thead className="border-b border-[var(--border-soft)] bg-[var(--page-background)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="px-5 py-3">Time</th><th className="px-5 py-3">Actor</th><th className="px-5 py-3">Action</th><th className="px-5 py-3">Resource</th><th className="px-5 py-3">Network</th></tr></thead><tbody className="divide-y divide-[var(--border-soft)]">{result.items.map((item) => <tr key={item.id} className="align-top"><td className="whitespace-nowrap px-5 py-4 text-[11px] text-[var(--text-muted)]">{date(item.createdAt)}</td><td className="px-5 py-4"><div className="font-medium">{item.actorUser.firstName} {item.actorUser.lastName}</div><div className="mt-1 text-[11px] text-[var(--text-muted)]">{item.actorUser.email} · {item.actorUser.platformRole}</div></td><td className="px-5 py-4 font-medium text-[var(--text-primary)]">{item.action}</td><td className="px-5 py-4"><div>{titleCase(item.resourceType)}</div><div className="mt-1 text-[11px] text-[var(--text-muted)]">{item.resourceId ?? "No resource id"}</div></td><td className="px-5 py-4 text-[11px] text-[var(--text-muted)]">{item.ipAddress ?? "—"}</td></tr>)}</tbody></Table><Pagination data={result.pagination} onPageChange={onPageChange} /></>; }
function Pagination({ data, onPageChange }: { data: Pagination; onPageChange: PageChange }) { return <div className="flex items-center justify-between px-1 py-3 text-xs text-[var(--text-muted)]"><span>{number(data.total)} records · page {data.page} of {data.totalPages}</span><span className="flex gap-2"><button type="button" disabled={!data.hasPrevious} onClick={() => onPageChange(data.page - 1)} className="rounded border border-[var(--border)] px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40">Previous</button><button type="button" disabled={!data.hasNext} onClick={() => onPageChange(data.page + 1)} className="rounded border border-[var(--border)] px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40">Next</button></span></div>; }

function Billing({ data }: { data: { subscriptions: { configured: boolean; message: string }; wallet: { currency: string; balance: string; totalBalance?: string; reservedBalance?: string; availableBalance?: string }; wallets?: Array<{ tenantId: string; tenantName: string; tenantSlug: string; workspaceCount: number; currency: string; balance: string; totalBalance?: string; reservedBalance?: string; availableBalance?: string; status?: string }>; sharedWhatsAppBilling: { totalAccounts: number; allocatedAccounts: number; unallocatedAccounts: number; statuses: CountMap }; workspaceCount: number } }) {
  const auth = useContext(AuthContext);
  const canAdjust = ["BILLING", "ADMIN", "SUPER_ADMIN"].includes(auth?.user?.platformRole ?? "");
  const [tenantId, setTenantId] = useState(data.wallets?.[0]?.tenantId ?? "");
  const [direction, setDirection] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("MANUAL_ADJUSTMENT");
  const [description, setDescription] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => `manual-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`);
  const [displayBalance, setDisplayBalance] = useState(data.wallets?.[0]?.balance ?? data.wallet.balance);
  const [working, setWorking] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submitAdjustment = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedAmount = amount.trim();
    if (!tenantId.trim() || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId.trim())) { setFormError("Select a valid tenant."); return; }
    const parsedAmount = amountToMinor(trimmedAmount);
    if (parsedAmount === null || parsedAmount <= 0n) { setFormError("Enter a positive amount with up to two decimal places."); return; }
    const amountMinorUnits = parsedAmount.toString();
    setWorking(true); setFormError(null); setSuccess(null);
    try {
      const selectedTenant = data.wallets?.find((wallet) => wallet.tenantId === tenantId.trim());
      await apiRequest("/admin/billing/wallet-adjustments", { method: "POST", body: JSON.stringify({ tenantId: tenantId.trim(), direction, amountMinorUnits, idempotencyKey, reason: reason.trim(), ...(description.trim() ? { description: description.trim() } : {}) }) });
      setSuccess(`${direction === "CREDIT" ? "Credited" : "Debited"} ${selectedTenant?.currency ?? data.wallet.currency} ${trimmedAmount}.`);
      const currentBalance = amountToMinor(displayBalance) ?? 0n;
      setDisplayBalance(minorToAmount(direction === "CREDIT" ? currentBalance + parsedAmount : currentBalance - parsedAmount));
      setAmount(""); setDescription(""); setIdempotencyKey(`manual-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`);
    } catch (caughtError) { setFormError(caughtError instanceof ApiError ? caughtError.message : "The wallet adjustment could not be saved."); }
    finally { setWorking(false); }
  };

  return <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Tenants" value={data.wallets?.length ?? 0} /><Metric label="Total balance" value={`${data.wallet.currency} ${data.wallet.totalBalance ?? displayBalance}`} /><Metric label="Reserved" value={`${data.wallet.currency} ${data.wallet.reservedBalance ?? "0.000000"}`} /><Metric label="Available" value={`${data.wallet.currency} ${data.wallet.availableBalance ?? displayBalance}`} /><Metric label="WhatsApp accounts" value={data.sharedWhatsAppBilling.totalAccounts} /></div><section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><h2 className="font-medium">Subscriptions are not configured</h2><p className="mt-1">{data.subscriptions.message}</p></section><section className="rounded-lg border border-[var(--border-soft)] bg-white p-5"><h2 className="text-sm font-medium">Shared WhatsApp billing</h2><div className="mt-4 grid gap-3 sm:grid-cols-3"><Metric label="Allocated" value={data.sharedWhatsAppBilling.allocatedAccounts} /><Metric label="Unallocated" value={data.sharedWhatsAppBilling.unallocatedAccounts} /><Metric label="Billing statuses" value={Object.entries(data.sharedWhatsAppBilling.statuses).map(([key, value]) => `${titleCase(key)}: ${value}`).join(" · ") || "None"} /></div></section>{canAdjust && <section className="rounded-lg border border-[var(--border-soft)] bg-white p-5"><h2 className="text-sm font-medium">Manual wallet adjustment</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Adjust the shared wallet for a tenant. Workspaces under that tenant use the same balance.</p>{formError && <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{formError}</div>}{success && <div role="status" className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{success}</div>}<form onSubmit={(event) => void submitAdjustment(event)} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-secondary)]"><span>Tenant</span><select aria-label="Tenant" value={tenantId} onChange={(event) => { setTenantId(event.target.value); const selected = data.wallets?.find((wallet) => wallet.tenantId === event.target.value); if (selected) setDisplayBalance(selected.balance); }} className="h-9 rounded-md border border-[var(--border)] bg-white px-2 text-xs"><option value="">Select tenant</option>{data.wallets?.map((wallet) => <option key={wallet.tenantId} value={wallet.tenantId}>{wallet.tenantName} · {wallet.tenantSlug} · {wallet.workspaceCount} workspace{wallet.workspaceCount === 1 ? "" : "s"} · {wallet.currency} {wallet.availableBalance ?? wallet.balance}</option>)}</select></label><label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-secondary)]"><span>Direction</span><select value={direction} onChange={(event) => setDirection(event.target.value as "CREDIT" | "DEBIT")} className="h-9 rounded-md border border-[var(--border)] bg-white px-2 text-xs"><option value="CREDIT">Credit</option><option value="DEBIT">Debit</option></select></label><label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-secondary)]"><span>Amount</span><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className="h-9 rounded-md border border-[var(--border)] px-2 text-xs" placeholder="0.00" /></label><label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-secondary)]"><span>Reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} className="h-9 rounded-md border border-[var(--border)] px-2 text-xs" /></label><label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-secondary)] sm:col-span-2 lg:col-span-3"><span>Description</span><input value={description} onChange={(event) => setDescription(event.target.value)} className="h-9 rounded-md border border-[var(--border)] px-2 text-xs" placeholder="Optional internal note" /></label><button type="submit" disabled={working || !tenantId} className="h-9 self-end rounded-md bg-[var(--brand)] px-3 text-xs font-medium text-white disabled:opacity-50">{working ? "Saving…" : "Save adjustment"}</button></form></section>}</div>;
}
function Usage({ data }: { data: { totals: CountMap; workspaces: Array<{ id: string; name: string; updatedAt: string; _count: CountMap }> } }) { return <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(data.totals).map(([key, value]) => <Metric key={key} label={titleCase(key)} value={value} />)}</div><section><h2 className="mb-3 text-sm font-medium text-[var(--text-primary)]">Recent workspace activity footprint</h2><Table><thead className="border-b border-[var(--border-soft)] bg-[var(--page-background)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="px-5 py-3">Workspace</th><th className="px-5 py-3">Contacts</th><th className="px-5 py-3">Messages</th><th className="px-5 py-3">Conversations</th><th className="px-5 py-3">Campaigns</th><th className="px-5 py-3">Automations</th><th className="px-5 py-3">Updated</th></tr></thead><tbody className="divide-y divide-[var(--border-soft)]">{data.workspaces.map((item) => <tr key={item.id}><td className="px-5 py-4 font-medium">{item.name}</td><td className="px-5 py-4">{number(item._count.contacts)}</td><td className="px-5 py-4">{number(item._count.messages)}</td><td className="px-5 py-4">{number(item._count.conversations)}</td><td className="px-5 py-4">{number(item._count.campaigns)}</td><td className="px-5 py-4">{number(item._count.automations)}</td><td className="px-5 py-4 text-[11px] text-[var(--text-muted)]">{date(item.updatedAt)}</td></tr>)}</tbody></Table></section></div>; }
function Health({ data }: { data: { status: string; uptimeSeconds: number; nodeEnvironment: string; database: { connected: boolean; name?: string; serverTime?: string; error?: string }; integrations: Record<string, boolean> } }) { return <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Overall status" value={titleCase(data.status)} /><Metric label="Environment" value={data.nodeEnvironment} /><Metric label="Uptime" value={`${Math.floor(data.uptimeSeconds / 3600)}h ${Math.floor((data.uptimeSeconds % 3600) / 60)}m`} /><Metric label="Database" value={data.database.connected ? "Connected" : "Unavailable"} /></div><section className="rounded-lg border border-[var(--border-soft)] bg-white p-5"><h2 className="text-sm font-medium">Database</h2><div className="mt-4 flex items-start gap-3 text-sm"><span className={`mt-0.5 ${data.database.connected ? "text-emerald-600" : "text-red-600"}`}>{data.database.connected ? <CheckCircle2 size={18} /> : <XCircle size={18} />}</span><div><div className="font-medium">{data.database.connected ? "Database connection is healthy" : "Database connection is degraded"}</div><div className="mt-1 text-xs text-[var(--text-muted)]">{data.database.name ?? data.database.error ?? "No database details available"}</div></div></div></section><section className="rounded-lg border border-[var(--border-soft)] bg-white p-5"><h2 className="text-sm font-medium">Integration configuration</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(data.integrations).map(([key, configured]) => <div key={key} className="flex items-center justify-between border-b border-[var(--border-soft)] pb-3 text-xs"><span>{titleCase(key)}</span>{configured ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-amber-600" />}</div>)}</div></section></div>; }
function Settings({ data }: { data: { runtime: Record<string, string | number>; integrations: Record<string, string | boolean>; featureFlags: { configured: boolean; message: string }; billing: { currency: string; walletConfigured: boolean } } }) { return <div className="grid gap-5 lg:grid-cols-2">{Object.entries({ Runtime: data.runtime, Integrations: data.integrations, Billing: data.billing, "Feature flags": data.featureFlags }).map(([group, values]) => <section key={group} className="rounded-lg border border-[var(--border-soft)] bg-white p-5"><h2 className="text-sm font-medium">{group}</h2><dl className="mt-4 space-y-3 text-xs">{Object.entries(values).map(([key, value]) => <div key={key} className="flex items-start justify-between gap-4 border-t border-[var(--border-soft)] pt-3"><dt className="text-[var(--text-muted)]">{titleCase(key)}</dt><dd className="max-w-[65%] text-right font-medium text-[var(--text-primary)]">{typeof value === "boolean" ? value ? "Configured" : "Not configured" : String(value)}</dd></div>)}</dl></section>)}</div>; }
function FeatureFlags({ data }: { data: { configured: boolean; items: unknown[]; message: string } }) { return <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><h2 className="font-medium">Feature flags are not configured</h2><p className="mt-1">{data.message}</p><div className="mt-4 text-xs">Runtime flags: {data.items.length}</div></section>; }

export function PlatformAdminSection() {
  const { pathname } = useLocation();
  const section = pathname.replace(/^\/admin\/?/, "") || "overview";
  const title = titles[section] ?? "Platform administration";
  const list = listSections.has(section);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const { data, loading, error } = useAdminData(section, submittedSearch, page, refreshVersion);
  const result = useMemo(() => data as ListResponse<WorkspaceItem | UserItem | WhatsAppItem | WebhookItem | AuditItem> | null, [data]);
  const submit = (event: FormEvent) => { event.preventDefault(); setPage(1); setSubmittedSearch(search); };
  const body = () => {
    if (loading) return <div className="rounded-lg border border-[var(--border-soft)] bg-white p-8 text-sm text-[var(--text-muted)]">Loading {title.toLowerCase()}…</div>;
    if (error) return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>;
    if (!data) return null;
    if (section === "workspaces") return result?.items?.length ? <Workspaces result={result as ListResponse<WorkspaceItem>} onPageChange={setPage} /> : <Empty>No workspaces found.</Empty>;
    if (section === "users" || section === "platform-admins") return result?.items?.length ? <Users result={result as UserListResponse} onPageChange={setPage} onRefresh={() => setRefreshVersion((value) => value + 1)} /> : <Empty>No users found.</Empty>;
    if (section === "whatsapp") return result?.items?.length ? <WhatsApp result={result as ListResponse<WhatsAppItem>} onPageChange={setPage} /> : <Empty>No WhatsApp connections found.</Empty>;
    if (section === "webhooks") return result?.items?.length ? <Webhooks result={result as ListResponse<WebhookItem>} onPageChange={setPage} /> : <Empty>No webhook endpoints found.</Empty>;
    if (section === "audit-logs") return result?.items?.length ? <AuditLogs result={result as ListResponse<AuditItem>} onPageChange={setPage} /> : <Empty>No platform audit events have been recorded yet.</Empty>;
    if (section === "billing") return <Billing data={data as Parameters<typeof Billing>[0]["data"]} />;
    if (section === "usage") return <Usage data={data as Parameters<typeof Usage>[0]["data"]} />;
    if (section === "health") return <Health data={data as Parameters<typeof Health>[0]["data"]} />;
    if (section === "settings") return <Settings data={data as Parameters<typeof Settings>[0]["data"]} />;
    if (section === "feature-flags") return <FeatureFlags data={data as Parameters<typeof FeatureFlags>[0]["data"]} />;
    return <Empty>This platform section is not available.</Empty>;
  };
  return <div className="min-h-full bg-[var(--page-background)] p-5 sm:p-8"><div className="mx-auto max-w-[1400px]"><PageHeader title={title} list={list} search={search} setSearch={setSearch} onSubmit={submit} /><div className="mt-6">{body()}</div></div></div>;
}
