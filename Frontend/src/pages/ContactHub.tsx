import { useEffect, useRef, useState, type DragEvent, type FormEvent, type UIEvent } from "react";
import {
  Check,
  ChevronDown,
  Columns3,
  FileDown,
  FileUp,
  GripVertical,
  ListFilter,
  Megaphone,
  MessageCircle,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  Users,
} from "lucide-react";
import {
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InternationalPhoneInput } from "@/components/ui/international-phone-input";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getActiveMembership } from "@/lib/workspace";
import { ImportContactsDrawer } from "@/pages/ImportContactsDrawer";
import { ContactCustomFieldInput } from "@/pages/ContactCustomFieldInput";
import {
  ContactSortPopover,
  defaultContactSortRules,
  type ContactSortRule,
} from "@/pages/ContactSortPopover";
import { SegmentBuilderDialog, type ContactSegmentCondition } from "@/pages/SegmentBuilderDialog";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { defaultCountries, guessCountryByPartialPhoneNumber } from "react-international-phone";
import type {
  Contact,
  ContactApiRecord,
  ContactCustomFieldDefinition,
  ContactImportRecord,
  ContactImportResult,
  ContactListResponse,
} from "@/pages/contact.types";

const columnLabels = [
  "Contact Name",
  "Phone Number",
  "Email ID",
  "Created On",
  "Source",
  "Tags",
] as const;
type Column = (typeof columnLabels)[number];
type ColumnPreferences = { order: Column[]; visible: Column[] };
const columnPreferencesStorageKey = "contact-hub-columns-v2";
const legacyVisibleColumnsStorageKey = "contact-hub-visible-columns-v1";

function validStoredColumns(value: unknown): Column[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<Column[]>((columns, item) => {
    if (columnLabels.includes(item as Column) && !columns.includes(item as Column)) columns.push(item as Column);
    return columns;
  }, []);
}

function defaultColumnPreferences(): ColumnPreferences {
  return { order: [...columnLabels], visible: [...columnLabels] };
}

function readStoredColumnPreferences(): ColumnPreferences {
  if (typeof window === "undefined") return defaultColumnPreferences();
  try {
    const stored = JSON.parse(window.localStorage.getItem(columnPreferencesStorageKey) ?? "null") as { order?: unknown; visible?: unknown } | null;
    if (stored && typeof stored === "object") {
      const storedOrder = validStoredColumns(stored.order);
      const order = [...storedOrder, ...columnLabels.filter((column) => !storedOrder.includes(column))];
      const storedVisible = validStoredColumns(stored.visible);
      return { order, visible: storedVisible.length ? order.filter((column) => storedVisible.includes(column)) : [...columnLabels] };
    }
  } catch {
    // Fall through to the legacy preference or defaults.
  }
  try {
    const legacyVisible = validStoredColumns(JSON.parse(window.localStorage.getItem(legacyVisibleColumnsStorageKey) ?? "null"));
    return { order: [...columnLabels], visible: legacyVisible.length ? legacyVisible : [...columnLabels] };
  } catch {
    return defaultColumnPreferences();
  }
}

export type CreateContactPayload = Pick<
  ContactImportRecord,
  "name" | "phone" | "whatsappId" | "profileName" | "email" | "source" | "tags" | "customAttributes"
> & { status: string; userId?: string; accountOwnerId: string | null; dealValue: number | null; whatsappOpted: boolean; whatsappConsentSource: string; whatsappConsentAt: string };
type TagOption = { id: string; name: string; contactCount: number };
type SavedContactSegment = { id: string; name: string; conditions: ContactSegmentCondition[]; createdAt: string; updatedAt: string };
type ContactSegmentList = { items: SavedContactSegment[]; pagination: { total: number } };

function AccountOwnerCombobox({
  owners,
  value,
  onChange,
  onOpen,
  error,
}: {
  owners: Array<{ id: string; firstName: string; lastName: string; email: string }>;
  value: string;
  onChange: (value: string) => void;
  onOpen: () => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedOwner = owners.find((owner) => owner.id === value);
  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) onOpen(); }}><PopoverTrigger asChild><button type="button" role="combobox" aria-label="Account Owner" aria-expanded={open} aria-invalid={Boolean(error)} aria-describedby={error ? "contact-account-owner-error" : undefined} className={cn("flex h-11 w-full items-center justify-between rounded-md border border-[var(--border-strong)] bg-white px-3 text-left text-sm outline-none transition-colors hover:bg-[var(--brand-soft)] focus-visible:border-[var(--brand-accent)] focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]/10", contactFieldErrorClass(Boolean(error)))}><span className={selectedOwner ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}>{selectedOwner ? `${selectedOwner.firstName} ${selectedOwner.lastName}` : "Select Option"}</span><ChevronDown className="size-4 text-[var(--text-muted)]" /></button></PopoverTrigger><PopoverContent align="start" className="w-[min(360px,calc(100vw-48px))] p-0"><Command><CommandInput placeholder="Search account owner..." /><CommandList><CommandEmpty>No account owners found.</CommandEmpty>{owners.map((owner) => <CommandItem key={owner.id} value={`${owner.firstName} ${owner.lastName} ${owner.email}`} onSelect={() => { onChange(owner.id); setOpen(false); }}><span className="min-w-0 flex-1 truncate">{owner.firstName} {owner.lastName}</span>{owner.id === value && <Check className="size-4" />}</CommandItem>)}</CommandList></Command></PopoverContent></Popover>;
}

function SavedSegmentOption({
  segment,
  selected,
  canManage,
  onSelect,
  onEdit,
  onDelete,
}: {
  segment: SavedContactSegment;
  selected: boolean;
  canManage: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onSelect}
        className="flex w-full items-center justify-between rounded-md py-2.5 pl-3 pr-10 text-left text-xs hover:bg-[var(--brand-soft)]"
      >
        <span className="truncate">{segment.name}</span>
        {selected && <Check size={14} className="mr-1 shrink-0" />}
      </button>
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Manage ${segment.name}`}
              onClick={(event) => event.stopPropagation()}
              className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-muted)] opacity-0 transition hover:bg-white hover:text-[var(--brand)] focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:bg-white data-[state=open]:opacity-100"
            >
              <MoreVertical size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent data-segment-actions align="end" sideOffset={4} className="min-w-32">
            <DropdownMenuItem onSelect={onEdit} className="text-xs">
              <Pencil size={14} />Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDelete} className="text-xs text-[var(--danger)] focus:bg-[var(--danger-soft)] focus:text-[var(--danger)]">
              <Trash2 size={14} />Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

const skeletonWidths: Record<Column, string> = {
  "Contact Name": "w-32",
  "Phone Number": "w-28",
  "Email ID": "w-36",
  "Created On": "w-20",
  Source: "w-16",
  Tags: "w-14",
};

function ContactTableSkeletonRows({ columns }: { columns: Column[] }) {
  return Array.from({ length: 8 }, (_, index) => (
    <tr key={index} data-testid="contact-row-skeleton" className="border-b">
      <td className="px-4 py-3"><Skeleton className="size-4 rounded" /></td>
      {columns.map((column) => <td key={column} className="px-3 py-3"><Skeleton className={cn(column === "Tags" ? "h-6" : "h-4", skeletonWidths[column])} /></td>)}
      <td><Skeleton className="size-5 rounded-full" /></td>
    </tr>
  ));
}

function ContactDataCell({ column, contact }: { column: Column; contact: Contact }) {
  if (column === "Contact Name") return <td className="max-w-[210px] px-3 py-3"><span className="truncate font-medium text-[#252b28]">{contact.name}</span></td>;
  if (column === "Phone Number") return <td className="px-3 py-3">{formatPhoneForTable(contact.phone)}</td>;
  if (column === "Email ID") return <td className="px-3 py-3">{contact.email}</td>;
  if (column === "Created On") return <td className="px-3 py-3">{contact.createdOn}</td>;
  if (column === "Source") return <td className="px-3 py-3">{contact.source}</td>;
  return (
    <td className="px-3 py-3">
      {contact.tags.length
        ? contact.tags.map((item) => <span key={item} className="mr-1 inline-flex rounded-full border border-[#d9ccff] bg-[var(--premium-soft)] px-[9px] py-1 text-[12px] font-medium text-[var(--premium)]">{item}</span>)
        : "-"}
    </td>
  );
}

function formatPhoneForTable(phone: string) {
  if (!phone.startsWith("+")) return phone;
  const digits = phone.replace(/\D/g, "");
  const { country, fullDialCodeMatch } = guessCountryByPartialPhoneNumber({ phone: `+${digits}`, countries: defaultCountries });
  if (!country || !fullDialCodeMatch || !digits.startsWith(country.dialCode)) return phone;
  const localNumber = digits.slice(country.dialCode.length);
  return localNumber ? `+${country.dialCode} ${localNumber}` : `+${country.dialCode}`;
}

type ContactFieldErrors = Record<string, string>;

function normalizeContactPhone(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("+") ? `+${trimmed.slice(1).replace(/\D/g, "")}` : trimmed;
}

function contactFieldErrorClass(hasError: boolean) {
  return hasError ? "border-[var(--danger)] focus-visible:border-[var(--danger)] focus-visible:ring-red-500/20" : "";
}

const contactFieldLabels: Record<string, string> = {
  name: "Contact name",
  phone: "Phone number",
  userId: "User ID",
  status: "Status",
  accountOwnerId: "Account Owner",
  dealValue: "Contact Deal Value",
  email: "Email ID",
  source: "Source",
  tags: "Tags",
  whatsappId: "WhatsApp ID",
  whatsappConsentSource: "WhatsApp consent source",
  whatsappConsentAt: "WhatsApp consent date",
};

function contactFieldErrors(caught: unknown): ContactFieldErrors {
  if (!(caught instanceof ApiError)) return {};
  const errors: ContactFieldErrors = {};
  const details = caught.details && typeof caught.details === "object" ? caught.details as Record<string, unknown> : {};
  const fieldErrors = details.fieldErrors && typeof details.fieldErrors === "object" ? details.fieldErrors as Record<string, unknown> : {};
  Object.entries(fieldErrors).forEach(([field, messages]) => {
    if (Array.isArray(messages) && typeof messages[0] === "string") errors[field] = messages[0];
  });
  const detailField = typeof details.field === "string" ? details.field : "";
  if (detailField) errors[caught.code.startsWith("CONTACT_CUSTOM_FIELD") ? `custom:${detailField}` : detailField] = caught.message;
  if (caught.code === "CONTACT_PHONE_EXISTS") errors.phone = caught.message;
  if (caught.code === "CONTACT_WHATSAPP_ID_EXISTS") errors.whatsappId = caught.message;
  return errors;
}

function toContact(contact: ContactApiRecord): Contact {
  return {
    id: contact.id,
    name: contact.name,
    phone: contact.phone ?? "Restricted",
    whatsappId: contact.whatsappId ?? "",
    profileName: contact.profileName ?? "",
    email: contact.email ?? "-",
    createdOn: new Intl.DateTimeFormat("en-GB").format(
      new Date(contact.createdAt),
    ),
    source: contact.source,
    tags: contact.tags.map(({ name }) => name),
  };
}

function SearchableTagFilter({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filteredOptions = options.filter((option) =>
    option.toLowerCase().includes(query.trim().toLowerCase()),
  );
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const selectTag = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };
  return (
    <div ref={rootRef} className="relative w-[135px] shrink-0">
      <button
        type="button"
        aria-label="Select tag"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn("relative flex h-10 w-full items-center rounded-lg border border-[#dfe5e1] bg-white py-2 pl-9 pr-8 text-left text-[13px] outline-none hover:bg-[#f6f8f7]", value !== "all" && "border-[var(--brand-accent)] bg-[var(--brand-soft)] text-[var(--brand)]")}
      >
        <Tag className={cn("pointer-events-none absolute left-3 size-[15px] text-[#64726c]", value !== "all" && "text-[var(--brand)]")} />
        <span className="truncate">
          {value === "all" ? "Select Tag" : value}
        </span>
        <ChevronDown
          className={cn(
            "pointer-events-none absolute right-3 size-4 text-[var(--text-muted)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="absolute left-0 top-11 z-30 w-[250px] overflow-hidden rounded-md border border-[var(--border)] bg-white shadow-[0_12px_30px_rgba(4,45,29,.10)]">
          <div className="border-b border-[var(--border-soft)] p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                autoFocus
                aria-label="Search tags"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tags..."
                className="h-9 w-full rounded-md border border-[var(--border-strong)] bg-white pl-8 pr-3 text-xs outline-none focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]/10"
              />
            </div>
          </div>
          <div
            role="listbox"
            aria-label="Contact tags"
            className="max-h-52 overflow-y-auto p-1.5"
          >
            <button
              type="button"
              role="option"
              aria-selected={value === "all"}
              onClick={() => selectTag("all")}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs hover:bg-[var(--brand-soft)]"
            >
              <span>All tags</span>
              {value === "all" && <Check size={14} />}
            </button>
            {filteredOptions.map((option) => (
              <button
                type="button"
                role="option"
                aria-selected={value === option}
                key={option}
                onClick={() => selectTag(option)}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs hover:bg-[var(--brand-soft)]"
              >
                <span className="inline-flex rounded-full border border-[#d9ccff] bg-[var(--premium-soft)] px-[9px] py-1 text-[12px] font-medium text-[var(--premium)]">
                  {option}
                </span>
                {value === option && <Check size={14} />}
              </button>
            ))}
            {filteredOptions.length === 0 && (
              <div className="px-3 py-5 text-center">
                <p >No tags found</p>
                <p className="mt-1">
                  Try a different search.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ContactDrawer({
  open,
  onClose,
  onCreate,
  customFields,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (contact: CreateContactPayload) => Promise<void>;
  customFields: ContactCustomFieldDefinition[];
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState("New Lead");
  const [accountOwnerId, setAccountOwnerId] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("Manual");
  const [tags, setTags] = useState("");
  const [whatsappOpted, setWhatsappOpted] = useState(true);
  const [whatsappConsentSource, setWhatsappConsentSource] = useState("Manual");
  const [whatsappConsentAt, setWhatsappConsentAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  const [customAttributes, setCustomAttributes] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ContactFieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const { accessToken, user } = useAuth();
  const workspaceId = getActiveMembership(user)?.workspace.id;
  const [accountOwners, setAccountOwners] = useState<Array<{ id: string; firstName: string; lastName: string; email: string }>>([]);
  const [ownersLoaded, setOwnersLoaded] = useState(false);
  const otherCustomFields = customFields.filter((field) => !["lead_status", "account_owner", "user_id", "contact_deal_value"].includes(field.key));
  const clearFieldError = (field: string) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setError(null);
  };
  useEffect(() => {
    if (open) {
      setError(null);
      setFieldErrors({});
    }
  }, [open]);
  useEffect(() => {
    if (!open || !Object.keys(fieldErrors).length) return;
    const frame = window.requestAnimationFrame(() => {
      const firstInvalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      firstInvalid?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      firstInvalid?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fieldErrors, open]);
  useEffect(() => {
    if (!open) return;
    const currentUser = user ? { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email } : null;
    if (currentUser) {
      setAccountOwners([currentUser]);
      setAccountOwnerId((current) => current || currentUser.id);
    }
  }, [open, user?.email, user?.firstName, user?.id, user?.lastName]);
  const loadAccountOwners = () => {
    if (ownersLoaded || !workspaceId || !accessToken) return;
    setOwnersLoaded(true);
    void Promise.resolve(apiRequest<Array<{ user: { id: string; firstName: string; lastName: string; email: string } }>>(`/workspaces/${workspaceId}/members`, { headers: { authorization: `Bearer ${accessToken}` } }))
      .then((members) => { if (Array.isArray(members) && members.length) setAccountOwners(members.map(({ user: member }) => member)); })
      .catch(() => undefined);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextFieldErrors: ContactFieldErrors = {};
    if (!name.trim()) nextFieldErrors.name = "Contact name is required.";
    const normalizedPhone = normalizeContactPhone(phone);
    if (!normalizedPhone) nextFieldErrors.phone = "Phone number is required.";
    else if (!/^\+[1-9]\d{6,14}$/.test(normalizedPhone)) nextFieldErrors.phone = "Enter a complete international phone number.";
    if (!status.trim()) nextFieldErrors.status = "Status is required.";
    if (dealValue !== "" && (!Number.isFinite(Number(dealValue)) || Number(dealValue) < 0)) nextFieldErrors.dealValue = "Enter a valid non-negative deal value.";
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) nextFieldErrors.email = "Enter a valid email address.";
    otherCustomFields.forEach((field) => {
      const value = customAttributes[field.key];
      if (field.required && (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0))) nextFieldErrors[`custom:${field.key}`] = `${field.label} is required.`;
    });
    if (Object.keys(nextFieldErrors).length) {
      setFieldErrors(nextFieldErrors);
      setError("Please fix the highlighted fields before creating the contact.");
      return;
    }
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      await onCreate({
        name,
        phone: normalizedPhone,
        status,
        userId: userId.trim() || undefined,
        accountOwnerId: accountOwnerId || null,
        dealValue: dealValue === "" ? null : Number(dealValue),
        email,
        source,
        tags: tags
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        whatsappOpted,
        whatsappConsentSource,
        whatsappConsentAt: new Date(whatsappConsentAt).toISOString(),
        customAttributes,
      });
      setName("");
      setPhone("");
      setUserId("");
      setStatus("New Lead");
      setAccountOwnerId("");
      setDealValue("");
      setEmail("");
      setSource("Manual");
      setTags("");
      setWhatsappOpted(true);
      setWhatsappConsentSource("Manual");
      setWhatsappConsentAt(new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
      setCustomAttributes({});
    } catch (caught) {
      const nextErrors = contactFieldErrors(caught);
      setFieldErrors(nextErrors);
      setError(caught instanceof Error ? (Object.keys(nextErrors).length ? "Please fix the highlighted fields before creating the contact." : caught.message) : "The contact could not be created.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      direction="right"
    >
      <DrawerContent className="h-full max-h-screen border-l border-[var(--border)]">
        <DrawerHeader className="relative flex-none border-b border-[var(--border-soft)] bg-[var(--brand-soft)]/45 pr-14">
          <DrawerTitle>Create contact</DrawerTitle>
          <DrawerCloseButton />
        </DrawerHeader>
        <form
          ref={formRef}
          noValidate
          onSubmit={(event) => void submit(event)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6">
            <div>
              <label
                htmlFor="contact-name"
                className={cn("mb-2 block text-sm font-medium", fieldErrors.name && "text-[var(--danger)]")}
              >
                Contact name<span aria-hidden="true" className="ml-1 text-[var(--danger)]">*</span>
              </label>
              <Input
                id="contact-name"
                required
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? "contact-name-error" : undefined}
                value={name}
                onChange={(event) => { setName(event.target.value); clearFieldError("name"); }}
                className={contactFieldErrorClass(Boolean(fieldErrors.name))}
              />
              {fieldErrors.name && <p id="contact-name-error" role="alert" className="mt-1 text-xs text-[var(--danger)]">{fieldErrors.name}</p>}
            </div>
            <div>
              <label
                htmlFor="contact-phone"
                className={cn("mb-2 block text-sm font-medium", fieldErrors.phone && "text-[var(--danger)]")}
              >
                Phone number<span aria-hidden="true" className="ml-1 text-[var(--danger)]">*</span>
              </label>
              <InternationalPhoneInput
                id="contact-phone"
                required
                value={phone}
                onChange={(value) => { setPhone(value); clearFieldError("phone"); }}
                ariaInvalid={Boolean(fieldErrors.phone)}
                ariaDescribedBy={fieldErrors.phone ? "contact-phone-error" : undefined}
                className={fieldErrors.phone ? "rounded-md border border-[var(--danger)]" : undefined}
              />
              {fieldErrors.phone && <p id="contact-phone-error" role="alert" className="mt-1 text-xs text-[var(--danger)]">{fieldErrors.phone}</p>}
            </div>
            <div>
              <label htmlFor="contact-user-id" className={cn("mb-2 block text-sm font-medium", fieldErrors.userId && "text-[var(--danger)]")}>User Id</label>
              <Input id="contact-user-id" aria-invalid={Boolean(fieldErrors.userId)} aria-describedby={fieldErrors.userId ? "contact-user-id-error" : undefined} value={userId} onChange={(event) => { setUserId(event.target.value); clearFieldError("userId"); }} placeholder="Enter input here" className={contactFieldErrorClass(Boolean(fieldErrors.userId))} />
              {fieldErrors.userId && <p id="contact-user-id-error" role="alert" className="mt-1 text-xs text-[var(--danger)]">{fieldErrors.userId}</p>}
            </div>
            <div>
              <label htmlFor="contact-status" className={cn("mb-2 block text-sm font-medium", fieldErrors.status && "text-[var(--danger)]")}>Status<span aria-hidden="true" className="ml-1 text-[var(--danger)]">*</span></label>
              <select id="contact-status" required aria-invalid={Boolean(fieldErrors.status)} aria-describedby={fieldErrors.status ? "contact-status-error" : undefined} value={status} onChange={(event) => { setStatus(event.target.value); clearFieldError("status"); }} className={cn("h-11 w-full rounded-md border border-[var(--border-strong)] bg-white px-3 text-sm outline-none focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]/10", contactFieldErrorClass(Boolean(fieldErrors.status)))}><option>New Lead</option><option>Qualification</option><option>Needs Analysis</option><option>Proposal</option><option>Negotiation</option><option>Closed Won</option><option>Closed Lost</option></select>
              {fieldErrors.status && <p id="contact-status-error" role="alert" className="mt-1 text-xs text-[var(--danger)]">{fieldErrors.status}</p>}
            </div>
            <div>
              <label htmlFor="contact-account-owner" className={cn("mb-2 block text-sm font-medium", fieldErrors.accountOwnerId && "text-[var(--danger)]")}>Account Owner</label>
              <AccountOwnerCombobox owners={accountOwners} value={accountOwnerId} onChange={(value) => { setAccountOwnerId(value); clearFieldError("accountOwnerId"); }} onOpen={loadAccountOwners} error={fieldErrors.accountOwnerId} />
              {fieldErrors.accountOwnerId && <p id="contact-account-owner-error" role="alert" className="mt-1 text-xs text-[var(--danger)]">{fieldErrors.accountOwnerId}</p>}
            </div>
            <div>
              <label htmlFor="contact-deal-value" className="mb-2 block text-sm font-medium">Contact Deal Value</label>
              <Input id="contact-deal-value" type="number" min="0" step="0.01" aria-invalid={Boolean(fieldErrors.dealValue)} aria-describedby={fieldErrors.dealValue ? "contact-deal-value-error" : undefined} value={dealValue} onChange={(event) => { setDealValue(event.target.value); clearFieldError("dealValue"); }} placeholder="Enter input here" className={contactFieldErrorClass(Boolean(fieldErrors.dealValue))} />
              {fieldErrors.dealValue && <p id="contact-deal-value-error" role="alert" className="mt-1 text-xs text-[var(--danger)]">{fieldErrors.dealValue}</p>}
            </div>
            <div>
              <label
                htmlFor="contact-email"
                className={cn("mb-2 block text-sm font-medium", fieldErrors.email && "text-[var(--danger)]")}
              >
                Email ID{" "}
                <span className="font-normal text-[var(--text-muted)]">
                  (optional)
                </span>
              </label>
              <Input
                id="contact-email"
                type="email"
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "contact-email-error" : undefined}
                value={email}
                onChange={(event) => { setEmail(event.target.value); clearFieldError("email"); }}
                className={contactFieldErrorClass(Boolean(fieldErrors.email))}
              />
              {fieldErrors.email && <p id="contact-email-error" role="alert" className="mt-1 text-xs text-[var(--danger)]">{fieldErrors.email}</p>}
            </div>
            <div>
              <label
                htmlFor="contact-source"
                className="mb-2 block text-sm font-medium"
              >
                Source
              </label>
              <Select value={source} onValueChange={(value) => { setSource(value); clearFieldError("source"); }}>
                <SelectTrigger
                  id="contact-source"
                  aria-label="Source"
                  aria-invalid={Boolean(fieldErrors.source)}
                  aria-describedby={fieldErrors.source ? "contact-source-error" : undefined}
                  className={cn("h-10", contactFieldErrorClass(Boolean(fieldErrors.source)))}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Manual">Manual</SelectItem>
                  <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                  <SelectItem value="Import">Import</SelectItem>
                  <SelectItem value="Website">Website</SelectItem>
                </SelectContent>
              </Select>
              {fieldErrors.source && <p id="contact-source-error" role="alert" className="mt-1 text-xs text-[var(--danger)]">{fieldErrors.source}</p>}
            </div>
            <div>
              <label
                htmlFor="contact-tags"
                className="mb-2 block text-sm font-medium"
              >
                Tags{" "}
                <span className="font-normal text-[var(--text-muted)]">
                  (optional)
                </span>
              </label>
              <Input
                id="contact-tags"
                value={tags}
                aria-invalid={Boolean(fieldErrors.tags)}
                aria-describedby={fieldErrors.tags ? "contact-tags-error" : undefined}
                onChange={(event) => { setTags(event.target.value); clearFieldError("tags"); }}
                placeholder="e.g. ctwa, vip"
                className={contactFieldErrorClass(Boolean(fieldErrors.tags))}
              />
              <p className="mt-1.5">
                Separate multiple tags with commas.
              </p>
              {fieldErrors.tags && <p id="contact-tags-error" role="alert" className="mt-1 text-xs text-[var(--danger)]">{fieldErrors.tags}</p>}
            </div>
            <fieldset className="border-t border-[var(--border-soft)] pt-5"><legend className="text-sm font-medium text-[var(--text-primary)]">WhatsApp Opted</legend><div className="mt-3 flex gap-5"><label className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" name="contact-whatsapp-opted" value="yes" checked={whatsappOpted} onChange={() => setWhatsappOpted(true)} className="size-4 accent-[var(--brand)]" />Yes</label><label className="flex cursor-pointer items-center gap-2 text-sm"><input type="radio" name="contact-whatsapp-opted" value="no" checked={!whatsappOpted} onChange={() => setWhatsappOpted(false)} className="size-4 accent-[var(--brand)]" />No</label></div>{!whatsappOpted && <div className="mt-3 rounded-md bg-[var(--warning-soft)] px-3 py-2 text-[#a66a00]">Opted-out contacts are automatically blocked from marketing campaigns.</div>}</fieldset>
            {otherCustomFields.length > 0 && <div className="border-t border-[var(--border-soft)] pt-5"><h3>Custom fields</h3><div className="mt-4 space-y-5">{otherCustomFields.map((field) => <ContactCustomFieldInput key={field.id} field={field} value={customAttributes[field.key]} error={fieldErrors[`custom:${field.key}`]} onChange={(value) => { clearFieldError(`custom:${field.key}`); setCustomAttributes((current) => { const next = { ...current }; if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) delete next[field.key]; else next[field.key] = value; return next; }); }} />)}</div></div>}
            {error && (
              <div
                role="alert"
                className="rounded-md bg-[var(--danger-soft)] px-3 py-2"
              >
                <span className="font-medium">{error}</span>
                {Object.entries(fieldErrors).length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                    {Object.entries(fieldErrors).map(([field, message]) => (
                      <li key={field}>{contactFieldLabels[field] ?? field}: {message}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-none items-center justify-between border-y border-[var(--border)] bg-white px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-md border border-[var(--border)] px-4 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-10 rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? "Creating..." : "Create contact"}
            </button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

export function ContactHub() {
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
  const membership = getActiveMembership(user);
  const workspaceId = membership?.workspace.id;
  const permissions = membership?.role.permissions ?? [];
  const canCreate = permissions.includes("contacts.create");
  const canUpdate = permissions.includes("contacts.update");
  const canDelete = permissions.includes("contacts.delete");
  const canViewPhone = permissions.includes("contacts.phone.view");
  const canViewFields = permissions.includes("contacts.fields.view");
  const canSendCampaigns = permissions.includes("campaigns.send");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [customFields, setCustomFields] = useState<ContactCustomFieldDefinition[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [tag, setTag] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [checkingCampaignEligibility, setCheckingCampaignEligibility] = useState(false);
  const [columnPreferences, setColumnPreferences] = useState<ColumnPreferences>(readStoredColumnPreferences);
  const [sortRules, setSortRules] = useState<ContactSortRule[]>(defaultContactSortRules);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [draggedColumn, setDraggedColumn] = useState<Column | null>(null);
  const [columnDropTarget, setColumnDropTarget] = useState<Column | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [segmentOpen, setSegmentOpen] = useState(false);
  const [segmentMenuOpen, setSegmentMenuOpen] = useState(false);
  const [segmentSearch, setSegmentSearch] = useState("");
  const [savedSegments, setSavedSegments] = useState<SavedContactSegment[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const [activeSegment, setActiveSegment] = useState<{ id: string | null; name: string; conditions: ContactSegmentCondition[] } | null>(null);
  const [editingSegment, setEditingSegment] = useState<SavedContactSegment | null>(null);
  const [segmentToDelete, setSegmentToDelete] = useState<SavedContactSegment | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [loadMoreRetryVersion, setLoadMoreRetryVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [segmentVersion, setSegmentVersion] = useState(0);
  const segmentRootRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRequestedRef = useRef(false);
  const pageSize = 25;
  const serializedSortRules = JSON.stringify(sortRules);
  const authorization = accessToken
    ? { authorization: `Bearer ${accessToken}` }
    : undefined;
  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedQuery(query.trim()),
      250,
    );
    return () => window.clearTimeout(timeout);
  }, [query]);
  useEffect(() => {
    try {
      window.localStorage.setItem(columnPreferencesStorageKey, JSON.stringify(columnPreferences));
    } catch {
      // Storage can be unavailable in restricted browser contexts; column selection still works for this session.
    }
  }, [columnPreferences]);
  useEffect(() => {
    if (!workspaceId || !authorization) {
      setLoading(false);
      return;
    }
    let active = true;
    const parameters = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sort: serializedSortRules,
      sortBy: sortRules[0]?.field ?? "createdAt",
      sortOrder: sortRules[0]?.direction ?? "desc",
    });
    if (debouncedQuery) parameters.set("search", debouncedQuery);
    if (tag !== "all") parameters.set("tags", tag);
    if (activeSegment?.conditions.length) parameters.set("segmentConditions", JSON.stringify(activeSegment.conditions));
    const isFirstPage = page === 1;
    if (isFirstPage) {
      setLoading(true);
      setContacts([]);
      setError(null);
      setLoadMoreError(null);
      if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0;
    } else {
      setLoadingMore(true);
    }
    void apiRequest<ContactListResponse>(
      `/workspaces/${workspaceId}/contacts?${parameters}`,
      { headers: authorization },
    )
      .then((result) => {
        if (!active) return;
        const nextContacts = result.items.map(toContact);
        setContacts((current) => {
          if (isFirstPage) return nextContacts;
          const contactsById = new Map(current.map((contact) => [contact.id, contact]));
          nextContacts.forEach((contact) => contactsById.set(contact.id, contact));
          return [...contactsById.values()];
        });
        setTotal(result.pagination.total);
        setHasNextPage(result.pagination.hasNext);
        setLoadMoreError(null);
        if (isFirstPage) {
          setSelected((current) =>
            current.filter((id) => result.items.some((contact) => contact.id === id)),
          );
        }
      })
      .catch((caught) => {
        if (!active) return;
        const message = caught instanceof ApiError
          ? caught.message
          : page === 1
            ? "Contacts could not be loaded."
            : "More contacts could not be loaded.";
        if (isFirstPage) setError(message);
        else setLoadMoreError(message);
      })
      .finally(() => {
        if (!active) return;
        if (isFirstPage) setLoading(false);
        else setLoadingMore(false);
        loadMoreRequestedRef.current = false;
      });
    return () => {
      active = false;
    };
  }, [accessToken, activeSegment, debouncedQuery, loadMoreRetryVersion, page, refreshVersion, serializedSortRules, tag, workspaceId]);
  useEffect(() => {
    if (!workspaceId || !authorization) return;
    let active = true;
    void apiRequest<TagOption[]>(`/workspaces/${workspaceId}/contacts/tags`, {
      headers: authorization,
    })
      .then((result) => {
        if (active) setAvailableTags(result.map(({ name }) => name));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [accessToken, refreshVersion, workspaceId]);
  useEffect(() => {
    if (!workspaceId || !authorization || !canViewFields) { setCustomFields([]); return; }
    let active = true;
    void apiRequest<ContactCustomFieldDefinition[]>(`/workspaces/${workspaceId}/contacts/custom-fields`, { headers: authorization })
      .then((result) => { if (active) setCustomFields(result); })
      .catch(() => { if (active) setCustomFields([]); });
    return () => { active = false; };
  }, [accessToken, canViewFields, refreshVersion, workspaceId]);
  useEffect(() => {
    if (!segmentMenuOpen || !workspaceId || !accessToken) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      setSegmentsLoading(true);
      const parameters = new URLSearchParams({ page: "1", pageSize: "30" });
      if (segmentSearch.trim()) parameters.set("search", segmentSearch.trim());
      void apiRequest<ContactSegmentList>(`/workspaces/${workspaceId}/contacts/segments?${parameters}`, { headers: { authorization: `Bearer ${accessToken}` } })
        .then((result) => { if (active) setSavedSegments(result.items); })
        .catch((caught) => { if (active) setError(caught instanceof ApiError ? caught.message : "Segments could not be loaded."); })
        .finally(() => { if (active) setSegmentsLoading(false); });
    }, 200);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [accessToken, segmentMenuOpen, segmentSearch, segmentVersion, workspaceId]);
  useEffect(() => {
    if (!segmentMenuOpen) return;
    const close = (event: MouseEvent) => {
      if ((event.target as Element).closest?.("[data-segment-actions]")) return;
      if (!segmentRootRef.current?.contains(event.target as Node)) { setSegmentMenuOpen(false); setSegmentSearch(""); }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [segmentMenuOpen]);
  const allPageSelected =
    contacts.length > 0 &&
    contacts.every((contact) => selected.includes(contact.id));
  const visible = (column: Column) => columnPreferences.visible.includes(column);
  const orderedVisibleColumns = columnPreferences.order.filter(visible);
  const loadNextPage = () => {
    if (loading || loadingMore || !hasNextPage || loadMoreError || loadMoreRequestedRef.current) return;
    loadMoreRequestedRef.current = true;
    setPage((current) => current + 1);
  };
  const handleTableScroll = (event: UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
    if (scrollHeight - scrollTop - clientHeight <= 160) loadNextPage();
  };
  const retryLoadingMore = () => {
    if (loadingMore || !loadMoreError) return;
    loadMoreRequestedRef.current = true;
    setLoadMoreError(null);
    setLoadMoreRetryVersion((current) => current + 1);
  };
  const toggleSelected = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const toggleAll = () =>
    setSelected((current) =>
      allPageSelected
        ? current.filter((id) => !contacts.some((contact) => contact.id === id))
        : [...new Set([...current, ...contacts.map((contact) => contact.id)])],
    );
  const applySortRules = (rules: ContactSortRule[]) => {
    setSortRules(rules.map((rule) => ({ ...rule })));
    setPage(1);
  };
  const toggleColumn = (column: Column) =>
    setColumnPreferences((current) => ({
      ...current,
      visible: current.visible.includes(column)
        ? current.visible.length === 1
          ? current.visible
          : current.visible.filter((item) => item !== column)
        : current.order.filter((item) => item === column || current.visible.includes(item)),
    }));
  const reorderColumn = (source: Column, target: Column) => {
    if (source === target) return;
    setColumnPreferences((current) => {
      const nextOrder = [...current.order];
      const sourceIndex = nextOrder.indexOf(source);
      const targetIndex = nextOrder.indexOf(target);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      nextOrder.splice(targetIndex, 0, nextOrder.splice(sourceIndex, 1)[0]);
      return { ...current, order: nextOrder };
    });
  };
  const startColumnDrag = (event: DragEvent<HTMLDivElement>, column: Column) => {
    setDraggedColumn(column);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", column);
  };
  const finishColumnDrag = () => {
    setDraggedColumn(null);
    setColumnDropTarget(null);
  };
  const createContact = async (contact: CreateContactPayload) => {
    if (!workspaceId || !authorization)
      throw new Error("A workspace is required.");
    await apiRequest(`/workspaces/${workspaceId}/contacts`, {
      method: "POST",
      headers: authorization,
        body: JSON.stringify({
          ...contact,
          whatsappId: contact.whatsappId || null,
          profileName: contact.profileName || null,
          email: contact.email === "-" ? "" : contact.email,
      }),
    });
    setCreateOpen(false);
    setPage(1);
    setRefreshVersion((value) => value + 1);
    toast.success("Contact created successfully.");
  };
  const importContacts = async (
    items: ContactImportRecord[],
    duplicatePolicy: "skip" | "update",
  ) => {
    if (!workspaceId || !authorization)
      throw new Error("A workspace is required.");
    const result = await apiRequest<ContactImportResult>(
      `/workspaces/${workspaceId}/contacts/import`,
      {
        method: "POST",
        headers: authorization,
        body: JSON.stringify({
          duplicatePolicy,
          contacts: items.map((contact) => ({
            ...contact,
            whatsappId: contact.whatsappId || null,
            profileName: contact.profileName || null,
            email: contact.email === "-" ? "" : contact.email,
          })),
        }),
      },
    );
    setPage(1);
    setRefreshVersion((value) => value + 1);
    const importedCount = result.summary.created + result.summary.updated;
    toast.success(importedCount === 1 ? "1 contact imported successfully." : `${importedCount} contacts imported successfully.`);
    return {
      imported: importedCount,
      skipped: result.summary.skipped,
    };
  };
  const deleteContacts = async () => {
    if (!workspaceId || !authorization || !selected.length || !canDelete) return;
    const deletedCount = selected.length;
    setError(null);
    try {
      await apiRequest(`/workspaces/${workspaceId}/contacts/bulk/delete`, {
        method: "POST",
        headers: authorization,
        body: JSON.stringify({ contactIds: selected }),
      });
      setSelected([]);
      setMoreOpen(false);
      setPage(1);
      setRefreshVersion((value) => value + 1);
      toast.success(deletedCount === 1 ? "Contact deleted successfully." : `${deletedCount} contacts deleted successfully.`);
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "The selected contacts could not be deleted.";
      setError(message);
      toast.error(message);
      throw caught;
    }
  };
  const sendCampaign = async () => {
    if (!workspaceId || !authorization || !selected.length || !canSendCampaigns) return;
    setCheckingCampaignEligibility(true); setError(null);
    try {
      const eligibility = await apiRequest<{ eligibleContactIds: string[]; excluded: Array<{ contactId: string; reason: "NOT_FOUND" | "OPTED_OUT" | "MARKETING_BLOCKED" }> }>(`/workspaces/${workspaceId}/contacts/marketing/eligibility`, { method: "POST", headers: authorization, body: JSON.stringify({ contactIds: selected }) });
      if (eligibility.excluded.length) {
        const optedOut = eligibility.excluded.filter(({ reason }) => reason === "OPTED_OUT").length;
        const blocked = eligibility.excluded.filter(({ reason }) => reason === "MARKETING_BLOCKED").length;
        const details = [optedOut ? `${optedOut} opted out` : "", blocked ? `${blocked} marketing blocked` : ""].filter(Boolean).join(" and ");
        toast.error(`Campaign cannot continue: ${details || "some contacts are unavailable"}.`);
        return;
      }
      navigate(`/campaigns?contactIds=${encodeURIComponent(eligibility.eligibleContactIds.join(","))}`);
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Campaign eligibility could not be checked.";
      setError(message); toast.error(message);
    } finally { setCheckingCampaignEligibility(false); }
  };
  const applySegment = (conditions: ContactSegmentCondition[]) => {
    setActiveSegment({ id: null, name: "Custom segment", conditions });
    setEditingSegment(null);
    setSegmentOpen(false);
    setPage(1);
  };
  const saveSegment = async (name: string, conditions: ContactSegmentCondition[]) => {
    if (!workspaceId || !accessToken || !canUpdate) throw new Error("You do not have permission to manage segments.");
    try {
      const editing = editingSegment;
      const saved = await apiRequest<SavedContactSegment>(
        editing
          ? `/workspaces/${workspaceId}/contacts/segments/${editing.id}`
          : `/workspaces/${workspaceId}/contacts/segments`,
        { method: editing ? "PATCH" : "POST", headers: { authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ name, conditions }) },
      );
      if (!editing || activeSegment?.id === editing.id) {
        setActiveSegment({ id: saved.id, name: saved.name, conditions: saved.conditions });
      }
      setSavedSegments((current) => editing
        ? current.map((segment) => segment.id === saved.id ? saved : segment)
        : [saved, ...current]);
      setEditingSegment(null);
      setSegmentVersion((value) => value + 1);
      setSegmentOpen(false);
      setPage(1);
      toast.success(editing ? "Segment updated successfully." : "Segment saved successfully.");
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Segment could not be saved."; toast.error(message); throw new Error(message);
    }
  };
  const deleteSegment = async () => {
    if (!workspaceId || !authorization || !segmentToDelete || !canUpdate) throw new Error("You do not have permission to manage segments.");
    const segment = segmentToDelete;
    try {
      await apiRequest(`/workspaces/${workspaceId}/contacts/segments/${segment.id}`, { method: "DELETE", headers: authorization });
      setSavedSegments((current) => current.filter(({ id }) => id !== segment.id));
      if (activeSegment?.id === segment.id) {
        setActiveSegment(null);
        setPage(1);
      }
      setSegmentToDelete(null);
      setSegmentVersion((value) => value + 1);
      toast.success("Segment deleted successfully.");
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Segment could not be deleted.";
      toast.error(message);
      throw caught;
    }
  };
  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-[var(--page-background)]"
      data-testid="contact-page"
    >
      <div
        className="flex-none border-b border-[var(--border)] bg-white"
        data-testid="contact-page-header"
      >
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--brand-hover)] text-white">
              <Users size={19} strokeWidth={1.9} />
            </div>
            <div>
              <h1 className="text-[18px] font-medium leading-6 text-[var(--text-primary)]">Contact Hub</h1>
              <div className="mt-1 text-[var(--text-secondary)]">
                Seamlessly manage all your Contacts in one place for Sales,
                Support and Beyond.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canCreate}
              onClick={() => setImportOpen(true)}
              className="flex h-10 items-center rounded-md border border-[var(--border-strong)] bg-white px-4 text-sm font-medium text-[#34443d] hover:bg-[#f6f8f7] disabled:opacity-50"
            >
              <FileDown size={17} className="mr-2" />
              Import Contacts
            </button>
            <button
              type="button"
              disabled={!canCreate}
              onClick={() => setCreateOpen(true)}
              className="flex h-10 items-center rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white hover:bg-[var(--brand-hover)] active:bg-[var(--brand-pressed)] disabled:opacity-50"
            >
              <Plus size={18} className="mr-2" />
              Create Contacts
            </button>
          </div>
        </div>
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col px-4 pb-6 sm:px-6 lg:px-8 lg:pb-7">
        <div className="contact-filter-toolbar relative mt-5 flex min-w-0 flex-none flex-nowrap items-center gap-2">
          <div className="relative min-w-[160px] flex-1 sm:max-w-[250px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              aria-label="Search contacts"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search by name or number"
              className="h-10 pl-9"
            />
          </div>
          <div ref={segmentRootRef} className="relative shrink-0">
            <button type="button" aria-label="Segment" aria-expanded={segmentMenuOpen} onClick={() => { setSegmentMenuOpen((open) => !open); setColumnsOpen(false); setMoreOpen(false); }} className={cn("relative flex h-10 w-[160px] items-center rounded-lg border border-[#dfe5e1] bg-white py-2 pl-9 pr-8 text-left text-[13px]", activeSegment && "border-[var(--brand-accent)] bg-[var(--brand-soft)] text-[var(--brand)]")}>
              <ListFilter className={cn("pointer-events-none absolute left-3 size-[16px] text-[#64726c]", activeSegment && "text-[var(--brand)]")} />
              <span className="truncate">{activeSegment?.name ?? "Segment"}</span>
              <ChevronDown className={cn("pointer-events-none absolute right-3 size-4 transition-transform", segmentMenuOpen && "rotate-180")} />
            </button>
            {segmentMenuOpen && (
              <div className="absolute left-0 top-11 z-30 w-[300px] overflow-hidden rounded-md border border-[var(--border)] bg-white shadow-[0_12px_30px_rgba(4,45,29,.10)]">
                <div className="border-b border-[var(--border-soft)] p-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input autoFocus aria-label="Search segments" value={segmentSearch} onChange={(event) => setSegmentSearch(event.target.value)} placeholder="Search saved segments..." className="h-9 w-full rounded-md border border-[var(--border-strong)] bg-white pl-8 pr-3 text-xs outline-none focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[var(--brand-accent)]/10" />
                  </div>
                </div>
                <div role="listbox" aria-label="Saved segments" className="max-h-56 overflow-y-auto p-1.5">
                  <button type="button" role="option" aria-selected={!activeSegment} onClick={() => { setActiveSegment(null); setSegmentMenuOpen(false); setSegmentSearch(""); setPage(1); }} className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-xs hover:bg-[var(--brand-soft)]">
                    <span>All contacts</span>{!activeSegment && <Check size={14} />}
                  </button>
                  {segmentsLoading ? (
                    <div className="space-y-2 px-3 py-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>
                  ) : savedSegments.map((segment) => (
                    <SavedSegmentOption
                      key={segment.id}
                      segment={segment}
                      selected={activeSegment?.id === segment.id}
                      canManage={canUpdate}
                      onSelect={() => { setActiveSegment({ id: segment.id, name: segment.name, conditions: segment.conditions }); setSegmentMenuOpen(false); setSegmentSearch(""); setPage(1); }}
                      onEdit={() => { setEditingSegment(segment); setSegmentMenuOpen(false); setSegmentSearch(""); setSegmentOpen(true); }}
                      onDelete={() => { setSegmentToDelete(segment); setSegmentMenuOpen(false); setSegmentSearch(""); }}
                    />
                  ))}
                  {!segmentsLoading && savedSegments.length === 0 && <p className="px-3 py-5 text-center">No saved segments found.</p>}
                </div>
                <div className="border-t border-[var(--border-soft)] p-2">
                  <button type="button" disabled={!canUpdate} onClick={() => { setEditingSegment(null); setSegmentMenuOpen(false); setSegmentSearch(""); setSegmentOpen(true); }} className="contact-filter-primary-action flex h-9 w-full items-center justify-center rounded-md bg-[var(--brand)] px-3 text-xs font-medium text-white disabled:opacity-50"><Plus size={14} className="mr-1.5" />Create new segment</button>
                </div>
              </div>
            )}
          </div>
          <SearchableTagFilter
            value={tag}
            options={availableTags}
            onChange={(value) => {
              setTag(value);
              setPage(1);
            }}
          />
          <button
            type="button"
            disabled={selected.length === 0 || !canSendCampaigns || checkingCampaignEligibility}
            onClick={() => void sendCampaign()}
            className="flex h-10 shrink-0 items-center rounded-lg border border-[#dfe5e1] bg-white px-3 text-[13px] font-medium text-[#47554f] hover:bg-[#f6f8f7] disabled:text-[var(--text-muted)]"
          >
            <Megaphone size={16} className="mr-2" />
            {checkingCampaignEligibility ? "Checking..." : "Send Campaign"}
          </button>
          <div className="relative shrink-0">
            <button
              type="button"
              aria-expanded={moreOpen}
              onClick={() => {
                setMoreOpen((open) => !open);
                setColumnsOpen(false);
              }}
              className="flex h-10 items-center rounded-lg border border-[#dfe5e1] bg-white px-3 text-[13px] text-[#47554f] hover:bg-[#f6f8f7]"
            >
              More Actions
              <ChevronDown size={15} className="ml-2" />
            </button>
            {moreOpen && (
              <div className="absolute left-0 top-11 z-20 min-w-[160px] rounded-md border bg-white p-1 shadow-md">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs"
                >
                  <FileUp size={15} />
                  Export contacts
                </button>
                <button
                  type="button"
                  disabled={!canDelete || selected.length === 0}
                  onClick={() => { setDeleteConfirmationOpen(true); setMoreOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 size={15} />Delete contacts
                </button>
                <button
                  type="button"
                  disabled={!canCreate}
                  onClick={() => {
                    setImportOpen(true);
                    setMoreOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs disabled:opacity-50"
                >
                  <FileDown size={15} />
                  Import contacts
                </button>
              </div>
            )}
          </div>
          <ContactSortPopover rules={sortRules} canViewPhone={canViewPhone} onApply={applySortRules} />
          <div className="relative shrink-0">
            <button
              type="button"
              aria-expanded={columnsOpen}
              onClick={() => {
                setColumnsOpen((open) => !open);
                setMoreOpen(false);
              }}
              className="flex h-10 items-center rounded-lg border border-[#dfe5e1] bg-white px-3 text-[13px] text-[#47554f] hover:bg-[#f6f8f7]"
            >
              <Columns3 size={16} className="mr-2" />
              Modify Columns
              <ChevronDown size={15} className="ml-2" />
            </button>
            {columnsOpen && (
              <div className="absolute right-0 top-11 z-20 w-[240px] rounded-md border bg-white p-3 shadow-md">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">Show columns</span>
                  <span className="text-[11px] text-[var(--text-muted)]">Drag to reorder</span>
                </div>
                {columnPreferences.order.map((column) => (
                  <div
                    key={column}
                    draggable
                    data-testid={`column-order-item-${column}`}
                    onDragStart={(event) => startColumnDrag(event, column)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      if (draggedColumn && draggedColumn !== column) setColumnDropTarget(column);
                    }}
                    onDragLeave={() => setColumnDropTarget((current) => current === column ? null : current)}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (draggedColumn) reorderColumn(draggedColumn, column);
                      finishColumnDrag();
                    }}
                    onDragEnd={finishColumnDrag}
                    className={cn(
                      "flex cursor-grab items-center gap-2 rounded-md border border-transparent px-1 py-1.5 text-xs active:cursor-grabbing",
                      draggedColumn === column && "opacity-45",
                      columnDropTarget === column && "border-[var(--brand)] bg-[var(--brand-soft)]",
                    )}
                  >
                    <GripVertical size={15} className="shrink-0 text-[var(--text-muted)]" aria-label={`Drag ${column} column`} />
                    <input
                      type="checkbox"
                      aria-label={column}
                      checked={visible(column)}
                      onChange={() => toggleColumn(column)}
                      className="size-4 accent-[var(--brand)]"
                    />
                    <span className="min-w-0 flex-1 truncate">{column}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {error && (
          <p
            role="alert"
            className="mt-3 flex-none rounded-md bg-[var(--danger-soft)] px-3 py-2"
          >
            {error}
          </p>
        )}
        <section className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-[#e3e8e5] bg-white shadow-[0_1px_2px_rgba(16,24,20,.04)]">
          <div
            ref={tableScrollRef}
            onScroll={handleTableScroll}
            className="min-h-0 flex-1 overflow-auto"
            data-testid="contact-table-scroll-region"
          >
            <table className="contact-data-table w-full min-w-[900px] border-collapse bg-white text-left">
              <thead className="contact-table-head sticky top-0 z-10 border-b border-[var(--border-soft)] bg-[var(--table-header)] shadow-[inset_0_-1px_0_var(--border-soft)]">
                <tr>
                  <th className="w-14 px-4 py-3.5">
                    <input
                      type="checkbox"
                      aria-label="Select all contacts"
                      checked={allPageSelected}
                      onChange={toggleAll}
                      className="size-[17px] accent-[var(--brand)]"
                    />
                  </th>
                  {orderedVisibleColumns.map((column) => <th key={column} className="px-3 py-3.5"><h3>{column}</h3></th>)}
                  <th className="w-16">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && <ContactTableSkeletonRows columns={orderedVisibleColumns} />}
                {!loading && contacts.map((contact) => (
                  <tr
                    key={contact.id}
                    tabIndex={0}
                    onClick={() => navigate(`/contacts/${contact.id}`)}
                    onKeyDown={(event) => { if (event.key === "Enter") navigate(`/contacts/${contact.id}`); }}
                    className="cursor-pointer border-b border-[var(--border-soft)] outline-none hover:bg-[var(--table-hover)] focus-visible:bg-[var(--table-selected)]"
                  >
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${contact.name}`}
                        checked={selected.includes(contact.id)}
                        onChange={() => toggleSelected(contact.id)}
                        className="size-[17px] accent-[var(--brand)]"
                      />
                    </td>
                    {orderedVisibleColumns.map((column) => <ContactDataCell key={column} column={column} contact={contact} />)}
                    <td>
                      <button
                        type="button"
                        aria-label={`Open conversation with ${contact.name}`}
                        onClick={(event) => { event.stopPropagation(); navigate(`/inbox?contactId=${contact.id}`); }}
                      >
                        <MessageCircle size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
                {loadingMore && (
                  <tr data-testid="contact-load-more-row">
                    <td colSpan={orderedVisibleColumns.length + 2} className="px-6 py-4">
                      <div role="status" className="flex items-center justify-center gap-3" aria-label="Loading more contacts">
                        <Skeleton className="h-2.5 w-44" />
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {!loading && contacts.length === 0 && (
              <div className="px-6 py-14 text-center">
                <p >No contacts found</p>
              </div>
            )}
          </div>
          <div className="flex flex-none items-center justify-between border-t px-4 py-3 text-xs">
            {loading ? <Skeleton data-testid="contact-total-skeleton" className="h-4 w-24" /> : <span>Total Users: <strong>{total}</strong></span>}
            {loadMoreError ? (
              <button type="button" onClick={retryLoadingMore} className="text-[var(--brand)] hover:underline">
                Retry loading more
              </button>
            ) : (
              !loading && <span aria-live="polite">Showing {contacts.length} of {total}</span>
            )}
          </div>
        </section>
      </div>
      <ContactDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={createContact}
        customFields={customFields}
      />
      <ImportContactsDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        existingContacts={contacts}
        customFields={customFields}
        onImport={importContacts}
      />
      <ConfirmationDialog
        open={deleteConfirmationOpen}
        onOpenChange={setDeleteConfirmationOpen}
        title="Delete selected contacts?"
        description={`${selected.length} selected ${selected.length === 1 ? "contact will" : "contacts will"} be removed from Contact Hub. The deleted ${selected.length === 1 ? "contact" : "contacts"} will remain in history.`}
        confirmLabel="Delete contacts"
        pendingLabel="Deleting..."
        tone="danger"
        onConfirm={deleteContacts}
      />
      <ConfirmationDialog
        open={Boolean(segmentToDelete)}
        onOpenChange={(open) => { if (!open) setSegmentToDelete(null); }}
        title="Delete this segment?"
        description={`The saved segment “${segmentToDelete?.name ?? ""}” will be deleted. Your contacts and their data will not be affected.`}
        confirmLabel="Delete segment"
        pendingLabel="Deleting..."
        tone="danger"
        onConfirm={deleteSegment}
      />
        <SegmentBuilderDialog
          open={segmentOpen}
          onClose={() => { setSegmentOpen(false); setEditingSegment(null); }}
          onApply={applySegment}
          onSave={saveSegment}
          tags={availableTags}
          customFields={customFields}
          initialSegment={editingSegment}
        />
    </div>
  );
}
