import {
  useMemo,
  useRef,
  useState,
  useEffect,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { readSheet, type CellValue } from "read-excel-file/browser";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import {
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ContactCustomFieldDefinition, ContactImportRecord } from "@/pages/contact.types";
import { cn } from "@/lib/utils";

type ImportStep = "upload" | "mapping" | "preview" | "complete";
type ImportField = "name" | "phone" | "whatsappId" | "profileName" | "email" | "source" | "tags" | "whatsappOpted" | "whatsappConsentSource" | "whatsappConsentAt" | "marketingBlocked" | "marketingBlockSource" | "marketingBlockReason";
type Mapping = Record<ImportField, string>;
type CustomFieldMapping = Record<string, string>;
type DuplicateMode = "skip" | "update";

type PreviewRow = {
  rowNumber: number;
  contact: ContactImportRecord;
  errors: string[];
  duplicate: boolean;
};

const importFields: Array<{
  key: ImportField;
  label: string;
  required: boolean;
}> = [
  { key: "name", label: "Contact name", required: true },
  { key: "phone", label: "Phone number", required: true },
  { key: "whatsappId", label: "WhatsApp ID", required: false },
  { key: "profileName", label: "WhatsApp profile name", required: false },
  { key: "email", label: "Email ID", required: false },
  { key: "source", label: "Source", required: false },
  { key: "tags", label: "Tags", required: false },
  { key: "whatsappOpted", label: "WhatsApp opted in", required: false },
  { key: "whatsappConsentSource", label: "Consent source", required: false },
  { key: "whatsappConsentAt", label: "Consent date and time", required: false },
  { key: "marketingBlocked", label: "Marketing blocked", required: false },
  { key: "marketingBlockSource", label: "Marketing block source", required: false },
  { key: "marketingBlockReason", label: "Marketing block reason", required: false },
];

const emptyMapping: Mapping = {
  name: "",
  phone: "",
  whatsappId: "",
  profileName: "",
  email: "",
  source: "",
  tags: "",
  whatsappOpted: "",
  whatsappConsentSource: "",
  whatsappConsentAt: "",
  marketingBlocked: "",
  marketingBlockSource: "",
  marketingBlockReason: "",
};

function DottedArrow() {
  return (
    <svg
      aria-hidden="true"
      className="h-3 w-8 shrink-0 text-[var(--border)]"
      viewBox="0 0 32 12"
      fill="none"
    >
      <line
        x1="1"
        y1="6"
        x2="25"
        y2="6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="1 3"
        strokeLinecap="round"
      />
      <path
        d="m25 2 4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}
function toE164(value: string) {
  const digits = normalizePhone(value);
  if (!digits) return "";
  if (value.trim().startsWith("+")) return `+${digits}`;
  return digits.length === 10 ? `+91${digits}` : `+${digits}`;
}
function splitTags(value: string) {
  return value
    .split(/[|,;]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}
function importedBoolean(value: string, label: string, errors: string[]) {
  if (!value.trim()) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "1", "opted in", "blocked"].includes(normalized)) return true;
  if (["false", "no", "0", "opted out", "not blocked"].includes(normalized)) return false;
  errors.push(`${label} must be Yes or No`);
  return undefined;
}
function importedDateTime(value: string, errors: string[]) {
  if (!value.trim()) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf()) || date.valueOf() > Date.now() + 5 * 60_000) {
    errors.push("Consent date and time is invalid or in the future");
    return undefined;
  }
  return date.toISOString();
}

function parseCsv(value: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      cell = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
      continue;
    }
    cell += character;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

function getAutomaticMapping(headers: string[]): Mapping {
  const aliases: Record<ImportField, string[]> = {
    name: ["name", "fullname", "contactname", "customername", "firstname"],
    phone: [
      "phone",
      "phonenumber",
      "mobile",
      "mobilenumber",
      "whatsappnumber",
      "contactnumber",
    ],
    whatsappId: ["whatsappid", "waid", "whatsappcontactid"],
    profileName: ["profilename", "whatsappprofilename", "waprofilename", "displayname"],
    email: ["email", "emailid", "emailaddress"],
    source: ["source", "leadsource", "contactsource"],
    tags: ["tag", "tags", "labels", "label"],
    whatsappOpted: ["whatsappopted", "whatsappoptedin", "optedin", "marketingoptin"],
    whatsappConsentSource: ["consentsource", "optinsource", "optoutsource", "whatsappconsentsource"],
    whatsappConsentAt: ["consentdatetime", "consentdateandtime", "consentat", "optedat", "optinat", "optoutat"],
    marketingBlocked: ["marketingblocked", "blockedfrommarketing", "campaignblocked"],
    marketingBlockSource: ["marketingblocksource", "blocksource"],
    marketingBlockReason: ["marketingblockreason", "blockreason", "unsubscribereason"],
  };
  return importFields.reduce(
    (result, field) => {
      result[field.key] =
        headers.find((header) =>
          aliases[field.key].includes(normalizeHeader(header)),
        ) ?? "";
      return result;
    },
    { ...emptyMapping },
  );
}

function getAutomaticCustomMapping(headers: string[], customFields: ContactCustomFieldDefinition[]): CustomFieldMapping {
  return Object.fromEntries(customFields.map((field) => {
    const aliases = new Set([normalizeHeader(field.label), normalizeHeader(field.key)]);
    return [field.key, headers.find((header) => aliases.has(normalizeHeader(header))) ?? ""];
  }));
}

function exactDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function parseCustomValue(field: ContactCustomFieldDefinition, rawValue: string): { value?: unknown; error?: string } {
  const raw = rawValue.trim();
  if (!raw) return field.required ? { error: `${field.label} is required` } : {};
  if (field.type === "TEXT") return { value: raw };
  if (field.type === "NUMBER") {
    const value = Number(raw);
    return Number.isFinite(value) ? { value } : { error: `${field.label} must be a number` };
  }
  if (field.type === "DATE") return exactDate(raw) ? { value: raw } : { error: `${field.label} must use YYYY-MM-DD` };
  if (field.type === "BOOLEAN") {
    const normalized = raw.toLowerCase();
    if (["true", "yes", "1"].includes(normalized)) return { value: true };
    if (["false", "no", "0"].includes(normalized)) return { value: false };
    return { error: `${field.label} must be Yes or No` };
  }
  const canonicalOptions = new Map(field.options.map((option) => [option.toLowerCase(), option]));
  if (field.type === "SELECT") {
    const value = canonicalOptions.get(raw.toLowerCase());
    return value ? { value } : { error: `${field.label} has an unavailable option` };
  }
  const selected = splitTags(raw);
  const values = selected.map((item) => canonicalOptions.get(item.toLowerCase()));
  if (values.some((value) => value === undefined) || new Set(values).size !== values.length) {
    return { error: `${field.label} has unavailable or duplicate options` };
  }
  return { value: values as string[] };
}

function spreadsheetCell(value: CellValue | null) {
  if (value === null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

async function readContactFile(file: File): Promise<string[][]> {
  const lowerName = file.name.toLowerCase();
  const csv = lowerName.endsWith(".csv") || file.type === "text/csv";
  const xlsx = lowerName.endsWith(".xlsx") || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (!csv && !xlsx) throw new Error("Please choose a CSV or Excel (.xlsx) file.");
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("The contact file must be smaller than 10 MB.");
  }
  if (xlsx) {
    try {
      return (await readSheet(file)).map((row) => row.map(spreadsheetCell));
    } catch {
      throw new Error("We could not read this Excel file. Make sure it is a valid .xlsx workbook.");
    }
  }
  const content = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("We could not read this CSV file. Please try again."));
    reader.readAsText(file);
  });
  return parseCsv(content);
}

function importRow(
  row: string[],
  headers: string[],
  mapping: Mapping,
  customMapping: CustomFieldMapping,
  customFields: ContactCustomFieldDefinition[],
  defaultSource: string,
  defaultTags: string,
  rowNumber: number,
  seenPhones: Set<string>,
  existingPhones: Set<string>,
): PreviewRow {
  const valueFor = (field: ImportField) => {
    const headerIndex = mapping[field] ? headers.indexOf(mapping[field]) : -1;
    return headerIndex >= 0 ? (row[headerIndex] ?? "").trim() : "";
  };
  const name = valueFor("name");
  const rawPhone = valueFor("phone");
  const phone = toE164(rawPhone);
  const email = valueFor("email");
  const whatsappId = valueFor("whatsappId");
  const profileName = valueFor("profileName");
  const source = valueFor("source") || defaultSource;
  const tags = splitTags(valueFor("tags") || defaultTags);
  const normalizedPhone = normalizePhone(phone);
  const errors: string[] = [];
  const whatsappOpted = importedBoolean(valueFor("whatsappOpted"), "WhatsApp opted in", errors);
  const marketingBlocked = importedBoolean(valueFor("marketingBlocked"), "Marketing blocked", errors);
  const whatsappConsentAt = importedDateTime(valueFor("whatsappConsentAt"), errors);
  if (whatsappOpted === false && marketingBlocked === false) errors.push("Opted-out contacts must remain blocked from marketing");
  if (!name) errors.push("Name is required");
  if (!rawPhone) errors.push("Phone number is required");
  else if (!/^\+[1-9]\d{6,14}$/.test(phone))
    errors.push("Phone number is invalid");
  if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.push("Email is invalid");
  if (whatsappId && !/^[A-Za-z0-9._:-]+$/.test(whatsappId)) errors.push("WhatsApp ID is invalid");
  const duplicate = Boolean(
    normalizedPhone &&
      (seenPhones.has(normalizedPhone) || existingPhones.has(normalizedPhone)),
  );
  const customAttributes: Record<string, unknown> = {};
  customFields.forEach((field) => {
    const header = customMapping[field.key];
    const headerIndex = header ? headers.indexOf(header) : -1;
    const parsed = parseCustomValue(field, headerIndex >= 0 ? row[headerIndex] ?? "" : "");
    if (parsed.error) errors.push(parsed.error);
    else if (parsed.value !== undefined) customAttributes[field.key] = parsed.value;
  });
  if (normalizedPhone) seenPhones.add(normalizedPhone);
  return {
    rowNumber,
    contact: {
      name, phone, whatsappId, profileName, email: email || "-", source, tags, customAttributes,
      ...(whatsappOpted !== undefined ? { whatsappOpted } : {}),
      ...(valueFor("whatsappConsentSource") ? { whatsappConsentSource: valueFor("whatsappConsentSource") } : {}),
      ...(whatsappConsentAt ? { whatsappConsentAt } : {}),
      ...(marketingBlocked !== undefined ? { marketingBlocked } : {}),
      ...(valueFor("marketingBlockSource") ? { marketingBlockSource: valueFor("marketingBlockSource") } : {}),
      ...(valueFor("marketingBlockReason") ? { marketingBlockReason: valueFor("marketingBlockReason") } : {}),
    },
    errors,
    duplicate,
  };
}

function downloadTemplate(customFields: ContactCustomFieldDefinition[]) {
  const escapeCell = (value: string) => /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  const sampleValue = (field: ContactCustomFieldDefinition) => {
    if (field.type === "NUMBER") return "10";
    if (field.type === "DATE") return "2026-08-24";
    if (field.type === "BOOLEAN") return "Yes";
    if (field.type === "SELECT") return field.options[0] ?? "";
    if (field.type === "MULTI_SELECT") return field.options.slice(0, 2).join(";");
    return "Example value";
  };
  const baseHeaders = ["Contact Name", "Phone Number", "WhatsApp ID", "WhatsApp Profile Name", "Email ID", "Source", "Tags", "WhatsApp Opted In", "Consent Source", "Consent Date and Time", "Marketing Blocked", "Marketing Block Source", "Marketing Block Reason"];
  const baseRow = ["Aarav Sharma", "+91 9876543210", "919876543210", "Aarav", "aarav@example.com", "Import", "lead;vip", "Yes", "Website form", "2026-08-24T10:30:00+05:30", "No", "", ""];
  const csv = `${[...baseHeaders, ...customFields.map(({ label }) => label)].map(escapeCell).join(",")}\n${[...baseRow, ...customFields.map(sampleValue)].map(escapeCell).join(",")}\n`;
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "interakt-contacts-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ImportContactsDrawer({
  open,
  onClose,
  existingContacts,
  customFields,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  existingContacts: ContactImportRecord[];
  customFields: ContactCustomFieldDefinition[];
  onImport: (
    contacts: ContactImportRecord[],
    duplicatePolicy: DuplicateMode,
  ) => Promise<{ imported: number; skipped: number }>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({ ...emptyMapping });
  const [customMapping, setCustomMapping] = useState<CustomFieldMapping>({});
  const [defaultSource, setDefaultSource] = useState("Import");
  const [defaultTags, setDefaultTags] = useState("");
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>("skip");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [summary, setSummary] = useState({
    imported: 0,
    skipped: 0,
    invalid: 0,
  });
  const [importing, setImporting] = useState(false);

  const existingPhones = useMemo(
    () =>
      new Set(existingContacts.map((contact) => normalizePhone(contact.phone))),
    [existingContacts],
  );
  useEffect(() => {
    if (!headers.length || !customFields.length) return;
    const automatic = getAutomaticCustomMapping(headers, customFields);
    setCustomMapping((current) => {
      const next = { ...current };
      let changed = false;
      customFields.forEach((field) => {
        if (!(field.key in next)) {
          next[field.key] = automatic[field.key] ?? "";
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [customFields, headers]);
  const previewRows = useMemo(() => {
    if (!headers.length || !rows.length) return [];
    const seenPhones = new Set<string>();
    return rows.map((row, index) =>
      importRow(
        row,
        headers,
        mapping,
        customMapping,
        customFields,
        defaultSource,
        defaultTags,
        index + 2,
        seenPhones,
        existingPhones,
      ),
    );
  }, [customFields, customMapping, defaultSource, defaultTags, existingPhones, headers, mapping, rows]);
  const validRows = previewRows.filter(
    (row) =>
      row.errors.length === 0 && (duplicateMode === "update" || !row.duplicate),
  );
  const duplicateRows = previewRows.filter((row) => row.duplicate);
  const invalidRows = previewRows.filter((row) => row.errors.length > 0);

  const reset = () => {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({ ...emptyMapping });
    setCustomMapping({});
    setError(null);
    setSummary({ imported: 0, skipped: 0, invalid: 0 });
    setDragging(false);
    setImporting(false);
  };
  const close = () => {
    reset();
    onClose();
  };
  const processFile = async (file: File) => {
    try {
        const parsed = await readContactFile(file);
        if (parsed.length < 2 || parsed[0].length < 2) {
          setError(
            "Your file must include a header row and at least one contact row.",
          );
          return;
        }
        const nextHeaders = parsed[0].map(
          (header, index) => header || `Column ${index + 1}`,
        );
        const contactRows = parsed.slice(1).filter((row) => row.some(Boolean));
        if (contactRows.length > 500) {
          setError("Import up to 500 contacts at a time.");
          return;
        }
        setFileName(file.name);
        setHeaders(nextHeaders);
        setRows(contactRows);
        setMapping(getAutomaticMapping(nextHeaders));
        setCustomMapping(getAutomaticCustomMapping(nextHeaders, customFields));
        setError(null);
        setStep("mapping");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not read this file. Please try again.");
    }
  };
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
    event.target.value = "";
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void processFile(file);
  };
  const importContacts = async () => {
    setImporting(true);
    setError(null);
    try {
      const result = await onImport(
        validRows.map((row) => row.contact),
        duplicateMode,
      );
      setSummary({
        imported: result.imported,
        skipped: result.skipped,
        invalid: invalidRows.length,
      });
      setStep("complete");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The contacts could not be imported.",
      );
    } finally {
      setImporting(false);
    }
  };
  const canContinue = Boolean(mapping.name && mapping.phone && customFields.every((field) => !field.required || customMapping[field.key]));

  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
      direction="right"
    >
      <DrawerContent className="h-full max-h-screen border-l border-[var(--border)]">
        <DrawerHeader className="relative flex-none border-b border-[var(--border-soft)] bg-[var(--brand-soft)]/45 pr-14">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-[var(--brand)] text-white">
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <DrawerTitle>Import contacts</DrawerTitle>
              <p className="mt-1">
                Bring contacts in from a CSV file.
              </p>
            </div>
          </div>
          <DrawerCloseButton />
        </DrawerHeader>

        {step !== "complete" && (
          <div className="flex flex-none justify-center border-b border-[var(--border-soft)] px-6 py-4">
            <div className="flex items-center gap-4 text-[11px] font-medium">
              <span
                className={cn(
                  step === "upload"
                    ? "font-semibold text-[var(--brand)]"
                    : "text-[var(--text-muted)]",
                )}
              >
                1. Upload
              </span>
              <DottedArrow />
              <span
                className={cn(
                  step === "mapping"
                    ? "font-semibold text-[var(--brand)]"
                    : "text-[var(--text-muted)]",
                )}
              >
                2. Map fields
              </span>
              <DottedArrow />
              <span
                className={cn(
                  step === "preview"
                    ? "font-semibold text-[var(--brand)]"
                    : "text-[var(--text-muted)]",
                )}
              >
                3. Review
              </span>
            </div>
          </div>
        )}

        {step === "upload" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              <div
                className={cn(
                  "rounded-lg border-2 border-dashed p-8 text-center transition-colors",
                  dragging
                    ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                    : "border-[var(--border)] bg-[#fbfcfd]",
                )}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
                  <Upload size={22} />
                </div>
                <h2 className="mt-4 text-sm font-medium text-[var(--text-primary)]">
                  Drag and drop your CSV or Excel file here
                </h2>
                <p className="mt-1">
                  or choose a file from your computer
                </p>
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="mt-5 h-10 rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white hover:bg-[var(--brand-hover)]"
                >
                  Choose contact file
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleFile}
                  className="hidden"
                />
                <p className="mt-4">
                  CSV or Excel (.xlsx) · Maximum file size 10 MB
                </p>
              </div>
              {error && (
                <p
                  role="alert"
                  className="mt-4 flex items-start gap-2 rounded-md bg-red-50 px-3 py-2.5"
                >
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {error}
                </p>
              )}
              <div className="mt-6 rounded-lg border border-[var(--border-soft)] bg-white p-4">
                <p >
                  Prepare your file
                </p>
                <ul className="mt-3 space-y-2 text-xs leading-5 text-[var(--text-secondary)]">
                  <li>
                    • Include a header row with contact name and phone number.
                  </li>
                  <li>
                    • Tags can be separated with commas, semicolons, or pipes.
                  </li>
                  <li>• You can map your own column names in the next step.</li>
                </ul>
                <button
                  type="button"
                  onClick={() => downloadTemplate(customFields)}
                  className="mt-4 flex items-center text-xs font-medium text-[var(--brand)] hover:underline"
                >
                  <Download size={14} className="mr-1.5" />
                  Download CSV template
                </button>
              </div>
            </div>
            <div className="flex flex-none justify-end border-y border-[var(--border)] bg-white px-6 py-4">
              <button
                type="button"
                onClick={close}
                className="h-10 rounded-md border border-[var(--border)] px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--brand-soft)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {step === "mapping" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6">
              <div className="flex items-start gap-3 rounded-md bg-[var(--brand-soft)] px-3 py-3 text-xs text-[var(--text-secondary)]">
                <FileSpreadsheet
                  size={16}
                  className="mt-0.5 shrink-0 text-[var(--brand)]"
                />
                <div>
                  <p >
                    {fileName}
                  </p>
                  <p className="mt-0.5">
                    {rows.length} contact rows detected. Match your columns
                    below.
                  </p>
                </div>
              </div>
              <div>
                <p >
                  Map your fields
                </p>
                <p className="mt-1">
                  Name and phone number are required. Other fields can use
                  defaults.
                </p>
                <div className="mt-4 space-y-3">
                  {importFields.map((field) => (
                    <div
                      key={field.key}
                      className="grid grid-cols-[1fr_1fr] items-center gap-3"
                    >
                      <label
                        htmlFor={`map-${field.key}`}
                        className="text-xs font-medium text-[var(--text-secondary)]"
                      >
                        {field.label}
                        {field.required && (
                          <span className="ml-1 text-[var(--danger)]">*</span>
                        )}
                      </label>
                      <Select
                        value={mapping[field.key] || "__none__"}
                        onValueChange={(value) =>
                          setMapping((current) => ({
                            ...current,
                            [field.key]: value === "__none__" ? "" : value,
                          }))
                        }
                      >
                        <SelectTrigger
                          id={`map-${field.key}`}
                          aria-label={`Map ${field.label}`}
                          className="h-9 text-xs"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">
                            Do not import
                          </SelectItem>
                          {headers.map((header) => (
                            <SelectItem
                              key={`${field.key}-${header}`}
                              value={header}
                            >
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  {customFields.map((field) => (
                    <div key={field.id} className="grid grid-cols-[1fr_1fr] items-center gap-3">
                      <label htmlFor={`map-custom-${field.key}`} className="text-xs font-medium text-[var(--text-secondary)]">
                        {field.label}
                        {field.required && <span className="ml-1 text-[var(--danger)]">*</span>}
                        <span className="ml-1 font-normal text-[var(--text-muted)]">(custom)</span>
                      </label>
                      <Select value={customMapping[field.key] || "__none__"} onValueChange={(value) => setCustomMapping((current) => ({ ...current, [field.key]: value === "__none__" ? "" : value }))}>
                        <SelectTrigger id={`map-custom-${field.key}`} aria-label={`Map ${field.label}`} className="h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="__none__">Do not import</SelectItem>{headers.map((header) => <SelectItem key={`${field.key}-${header}`} value={header}>{header}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                {customFields.some((field) => field.required && !customMapping[field.key]) && <div role="alert" className="mt-3 text-[var(--danger)]">Map every required custom field before reviewing the import.</div>}
              </div>
              <div>
                <p >
                  Defaults for blank cells
                </p>
                <div className="mt-3 grid gap-4">
                  <div>
                    <label
                      htmlFor="import-default-source"
                      className="mb-2 block text-xs font-medium text-[var(--text-secondary)]"
                    >
                      Default source
                    </label>
                    <Select
                      value={defaultSource}
                      onValueChange={setDefaultSource}
                    >
                      <SelectTrigger
                        id="import-default-source"
                        aria-label="Default source"
                        className="h-9 text-xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Import">Import</SelectItem>
                        <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                        <SelectItem value="Manual">Manual</SelectItem>
                        <SelectItem value="Website">Website</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label
                      htmlFor="import-default-tags"
                      className="mb-2 block text-xs font-medium text-[var(--text-secondary)]"
                    >
                      Default tags{" "}
                      <span className="font-normal text-[var(--text-muted)]">
                        (optional)
                      </span>
                    </label>
                    <Input
                      id="import-default-tags"
                      value={defaultTags}
                      onChange={(event) => setDefaultTags(event.target.value)}
                      placeholder="e.g. imported, 2026"
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-none items-center justify-between border-y border-[var(--border)] bg-white px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  setStep("upload");
                  setError(null);
                }}
                className="flex h-10 items-center rounded-md border border-[var(--border)] px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--brand-soft)]"
              >
                <ArrowLeft size={15} className="mr-1.5" />
                Back
              </button>
              <button
                type="button"
                disabled={!canContinue}
                onClick={() => setStep("preview")}
                className="flex h-10 items-center rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Review import
                <ArrowRight size={15} className="ml-1.5" />
              </button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md bg-emerald-50 p-3">
                  <p >
                    {validRows.length}
                  </p>
                  <p >
                    Ready to import
                  </p>
                </div>
                <div className="rounded-md bg-amber-50 p-3">
                  <p >
                    {duplicateRows.length}
                  </p>
                  <p >Duplicates</p>
                </div>
                <div className="rounded-md bg-red-50 p-3">
                  <p >
                    {invalidRows.length}
                  </p>
                  <p >Needs attention</p>
                </div>
              </div>
              <div className="mt-6">
                <p >
                  Duplicate contacts
                </p>
                <div className="mt-2">
                  <Select
                    value={duplicateMode}
                    onValueChange={(value) =>
                      setDuplicateMode(value as DuplicateMode)
                    }
                  >
                    <SelectTrigger
                      aria-label="Duplicate handling"
                      className="h-9 text-xs"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">
                        Skip duplicates already in your contacts
                      </SelectItem>
                      <SelectItem value="update">
                        Update existing contacts with imported values
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-6 overflow-hidden rounded-md border border-[var(--border)]">
                <div className="grid grid-cols-[44px_1fr_1fr_80px] gap-2 border-b border-[var(--border)] bg-[#fbfcfd] px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  <span>Row</span>
                  <span>Name</span>
                  <span>Phone</span>
                  <span>Status</span>
                </div>
                <div className="max-h-[250px] overflow-y-auto">
                  {previewRows.map((row) => {
                    const invalid = row.errors.length > 0;
                    const skipped =
                      !invalid && row.duplicate && duplicateMode === "skip";
                    return (
                      <div
                        key={row.rowNumber}
                        className="grid grid-cols-[44px_1fr_1fr_80px] gap-2 border-b border-[var(--border-soft)] px-3 py-2.5 text-xs last:border-0"
                      >
                        <span className="text-[var(--text-muted)]">
                          {row.rowNumber}
                        </span>
                        <span className="truncate text-[var(--text-primary)]">
                          {row.contact.name || "—"}
                        </span>
                        <span className="truncate text-[var(--text-secondary)]">
                          {row.contact.phone || "—"}
                        </span>
                        <span
                          className={cn(
                            "font-medium",
                            invalid
                              ? "text-[var(--danger)]"
                              : skipped
                                ? "text-amber-700"
                                : "text-emerald-700",
                          )}
                        >
                          {invalid ? "Invalid" : skipped ? "Skipped" : "Ready"}
                        </span>
                        {invalid && (
                          <p className="col-span-3 col-start-2">
                            {row.errors.join(" · ")}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              {error && (
                <p role="alert" className="mt-4 flex items-start gap-2 rounded-md bg-red-50 px-3 py-2.5">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  {error}
                </p>
              )}
            </div>
            <div className="flex flex-none items-center justify-between border-y border-[var(--border)] bg-white px-6 py-4">
              <button
                type="button"
                onClick={() => setStep("mapping")}
                className="flex h-10 items-center rounded-md border border-[var(--border)] px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--brand-soft)]"
              >
                <ArrowLeft size={15} className="mr-1.5" />
                Back
              </button>
              <button
                type="button"
                disabled={!validRows.length || importing}
                onClick={() => void importContacts()}
                className="flex h-10 items-center rounded-md bg-[var(--brand)] px-4 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importing ? "Importing..." : `Import ${validRows.length} contacts`}
              </button>
            </div>
          </div>
        )}

        {step === "complete" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={30} />
              </div>
              <h2 className="mt-5 text-lg font-medium text-[var(--text-primary)]">
                Import complete
              </h2>
              <p className="mt-2">
                Your contacts have been added to Contact Hub.
              </p>
              <div className="mt-6 grid w-full max-w-[280px] grid-cols-3 divide-x rounded-md border border-[var(--border)] py-3">
                <div>
                  <p >
                    {summary.imported}
                  </p>
                  <p >
                    Imported
                  </p>
                </div>
                <div>
                  <p >
                    {summary.skipped}
                  </p>
                  <p >
                    Skipped
                  </p>
                </div>
                <div>
                  <p >
                    {summary.invalid}
                  </p>
                  <p >
                    Invalid
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-none justify-end border-y border-[var(--border)] bg-white px-6 py-4">
              <button
                type="button"
                onClick={close}
                className="flex h-10 items-center rounded-md bg-[var(--brand)] px-5 text-sm font-medium text-white hover:bg-[var(--brand-hover)]"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
