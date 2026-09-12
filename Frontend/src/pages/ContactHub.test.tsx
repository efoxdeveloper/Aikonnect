import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContactHub } from "@/pages/ContactHub";
import { ApiError, apiRequest } from "@/lib/api";
import { toast } from "react-toastify";

const routerMocks = vi.hoisted(() => ({ navigate: vi.fn() }));
const spreadsheetMocks = vi.hoisted(() => ({ readSheet: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => ({ ...(await importOriginal<typeof import("react-router-dom")>()), useNavigate: () => routerMocks.navigate }));
vi.mock("read-excel-file/browser", () => ({ readSheet: spreadsheetMocks.readSheet }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    accessToken: "access-token",
    user: {
      memberships: [
        {
          workspace: { id: "workspace-1" },
          role: {
            permissions: [
              "contacts.read",
              "contacts.create",
              "contacts.update",
              "contacts.delete",
              "contacts.phone.view",
              "contacts.fields.view",
              "campaigns.send",
            ],
          },
        },
      ],
    },
  }),
}));
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    details?: unknown;

    constructor(status: number, message: string, code = "API_ERROR", details?: unknown) {
      super(message);
      this.status = status;
      this.code = code;
      this.details = details;
    }
  },
  apiRequest: vi.fn(),
}));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

type ApiContact = {
  id: string;
  name: string;
  phone: string;
  whatsappId: string | null;
  profileName: string | null;
  email: string | null;
  source: string;
  tags: Array<{ id: string; name: string; color: null }>;
  createdAt: string;
  updatedAt: string;
  hasPhone: true;
  hasWhatsappId: boolean;
  whatsappOpted: boolean;
  marketingBlocked: boolean;
  customAttributes?: Record<string, unknown>;
};
const seedContacts: ApiContact[] = [
  ["1", "Shani Deshwal", "+919897033994", null, "WhatsApp", ["ctwa"]],
  ["2", "Tech Tree Digital...", "+917906922123", null, "WhatsApp", []],
  ["3", "Shavez Akhter Jou...", "+919695266786", null, "WhatsApp", ["ctwa"]],
  ["4", "Harshit Mishra", "+917903281867", null, "WhatsApp", []],
].map(([id, name, phone, email, source, tags]) => ({
  id: id as string,
  name: name as string,
  phone: phone as string,
  email: email as string | null,
  source: source as string,
  tags: (tags as string[]).map((tag) => ({ id: tag, name: tag, color: null })),
  createdAt: "2025-11-19T00:00:00.000Z",
  updatedAt: "2025-11-19T00:00:00.000Z",
  hasPhone: true,
  whatsappId: null,
  profileName: null,
  hasWhatsappId: false,
  whatsappOpted: true,
  marketingBlocked: false,
  customAttributes: id === "1" ? { company: "Acme", customer_tier: 4, lead_status: "Customer" } : id === "3" ? { company: "Beta", customer_tier: 2, lead_status: "Lead" } : {},
}));
const contactColumnLabels = ["Contact Name", "Phone Number", "Email ID", "Created On", "Source", "Tags"];
let apiContacts: ApiContact[] = [];
let apiSegments: Array<{ id: string; name: string; conditions: Array<{ type: string; field: string; operator: string; value?: unknown }>; createdAt: string; updatedAt: string }> = [];
let apiCustomFields: Array<Record<string, unknown>> = [];
let createApiError: unknown = null;

beforeEach(() => {
  window.localStorage.clear();
  apiContacts = structuredClone(seedContacts);
  apiSegments = [];
  createApiError = null;
  apiCustomFields = [{
    id: "field-1",
    key: "company",
    label: "Company",
    type: "TEXT",
    options: [],
    required: false,
    position: 0,
    archivedAt: null,
    createdAt: "2026-08-24T07:00:00.000Z",
    updatedAt: "2026-08-24T07:00:00.000Z",
  }, {
    id: "field-2", key: "customer_tier", label: "Customer tier", type: "NUMBER", options: [], required: false, position: 1, archivedAt: null,
    createdAt: "2026-08-24T07:00:00.000Z", updatedAt: "2026-08-24T07:00:00.000Z",
  }, {
    id: "field-3", key: "lead_status", label: "Lead status", type: "SELECT", options: ["Lead", "Customer"], required: false, position: 2, archivedAt: null,
    createdAt: "2026-08-24T07:00:00.000Z", updatedAt: "2026-08-24T07:00:00.000Z",
  }];
  spreadsheetMocks.readSheet.mockReset();
  routerMocks.navigate.mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
  vi.mocked(apiRequest)
    .mockReset()
    .mockImplementation(async (path, options = {}) => {
      const url = new URL(String(path), "http://test.local");
      if (url.pathname.endsWith("/contacts/tags")) {
        return [
          ...new Set(
            apiContacts.flatMap((contact) =>
              contact.tags.map(({ name }) => name),
            ),
          ),
        ].map((name) => ({ id: name, name, contactCount: 1 })) as never;
      }
      if (url.pathname.endsWith("/contacts/custom-fields")) {
        return apiCustomFields as never;
      }
      if (url.pathname.endsWith("/contacts/marketing/eligibility") && options.method === "POST") {
        const body = JSON.parse(String(options.body)) as { contactIds: string[] };
        const eligibleContactIds: string[] = [];
        const excluded: Array<{ contactId: string; reason: "NOT_FOUND" | "OPTED_OUT" | "MARKETING_BLOCKED" }> = [];
        body.contactIds.forEach((contactId) => {
          const contact = apiContacts.find(({ id }) => id === contactId);
          if (!contact) excluded.push({ contactId, reason: "NOT_FOUND" });
          else if (!contact.whatsappOpted) excluded.push({ contactId, reason: "OPTED_OUT" });
          else if (contact.marketingBlocked) excluded.push({ contactId, reason: "MARKETING_BLOCKED" });
          else eligibleContactIds.push(contactId);
        });
        return { eligibleContactIds, excluded } as never;
      }
      if (url.pathname.endsWith("/contacts/segments") && options.method === "POST") {
        const body = JSON.parse(String(options.body));
        const segment = { id: `segment-${apiSegments.length + 1}`, ...body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        apiSegments.unshift(segment);
        return segment as never;
      }
      const segmentMatch = url.pathname.match(/\/contacts\/segments\/([^/]+)$/);
      if (segmentMatch && options.method === "PATCH") {
        const body = JSON.parse(String(options.body));
        const index = apiSegments.findIndex(({ id }) => id === segmentMatch[1]);
        const segment = { ...apiSegments[index], ...body, updatedAt: new Date().toISOString() };
        apiSegments[index] = segment;
        return segment as never;
      }
      if (segmentMatch && options.method === "DELETE") {
        apiSegments = apiSegments.filter(({ id }) => id !== segmentMatch[1]);
        return undefined as never;
      }
      if (url.pathname.endsWith("/contacts/segments")) {
        const search = url.searchParams.get("search")?.toLowerCase();
        const items = search ? apiSegments.filter(({ name }) => name.toLowerCase().includes(search)) : apiSegments;
        return { items, pagination: { total: items.length } } as never;
      }
    if (url.pathname.endsWith("/contacts/import")) {
        const body = JSON.parse(String(options.body)) as {
          contacts: Array<{
            name: string;
            phone: string;
            whatsappId?: string | null;
            profileName?: string | null;
            email: string;
            source: string;
            tags: string[];
            whatsappOpted?: boolean;
            marketingBlocked?: boolean;
            customAttributes?: Record<string, unknown>;
          }>;
        };
        body.contacts.forEach((contact, index) =>
          apiContacts.unshift({
            ...contact,
            whatsappId: contact.whatsappId ?? null,
            profileName: contact.profileName ?? null,
            id: `import-${index}`,
            email: contact.email || null,
            tags: contact.tags.map((name) => ({ id: name, name, color: null })),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            hasPhone: true,
            hasWhatsappId: Boolean(contact.whatsappId),
            whatsappOpted: contact.whatsappOpted ?? true,
            marketingBlocked: contact.whatsappOpted === false ? true : contact.marketingBlocked ?? false,
          }),
        );
        return {
          summary: {
            total: body.contacts.length,
            created: body.contacts.length,
            updated: 0,
            skipped: 0,
          },
      } as never;
    }
    if (url.pathname.endsWith("/contacts/bulk/delete")) {
      const body = JSON.parse(String(options.body)) as { contactIds: string[] };
      apiContacts = apiContacts.filter((contact) => !body.contactIds.includes(contact.id));
      return { deletedCount: body.contactIds.length } as never;
    }
      if (url.pathname.endsWith("/contacts") && options.method === "POST") {
        if (createApiError) throw createApiError;
        const contact = JSON.parse(String(options.body)) as {
          name: string;
          phone: string;
          whatsappId?: string | null;
          profileName?: string | null;
          email: string;
          source: string;
          tags: string[];
          whatsappOpted?: boolean;
          marketingBlocked?: boolean;
          customAttributes?: Record<string, unknown>;
        };
        apiContacts.unshift({
          ...contact,
          whatsappId: contact.whatsappId ?? null,
          profileName: contact.profileName ?? null,
          id: `created-${apiContacts.length}`,
          email: contact.email || null,
          tags: contact.tags.map((name) => ({ id: name, name, color: null })),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          hasPhone: true,
          hasWhatsappId: Boolean(contact.whatsappId),
          whatsappOpted: contact.whatsappOpted ?? true,
          marketingBlocked: contact.whatsappOpted === false ? true : contact.marketingBlocked ?? false,
        });
        return apiContacts[0] as never;
      }
      let items = [...apiContacts];
      const search = url.searchParams.get("search")?.toLowerCase();
      const tag = url.searchParams.get("tags");
      if (search)
        items = items.filter((contact) =>
          `${contact.name} ${contact.phone} ${contact.email ?? ""}`
            .toLowerCase()
            .includes(search),
        );
      if (tag)
        items = items.filter((contact) =>
          contact.tags.some(({ name }) => name === tag),
        );
      const segmentConditions = url.searchParams.get("segmentConditions");
      if (segmentConditions) {
        const conditions = JSON.parse(segmentConditions) as Array<{ type: string; field: string; operator: string; value?: unknown }>;
        items = items.filter((contact) => conditions.every((condition) => {
          const raw = condition.type === "tag" ? contact.tags.map(({ name }) => name)
            : condition.type === "custom_field" ? contact.customAttributes?.[condition.field]
            : condition.field === "phone" ? contact.phone : condition.field === "email" ? contact.email ?? ""
              : condition.field === "source" ? contact.source : condition.field === "whatsappOpted" ? contact.whatsappOpted : condition.field === "marketingBlocked" ? contact.marketingBlocked : contact.name;
          const values = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
          const empty = values.length === 0 || values.every((value) => value === "");
          if (condition.operator === "is_empty") return empty;
          if (condition.operator === "is_not_empty") return !empty;
          const expected = condition.value;
          const equal = (value: unknown) => typeof value === "string" && typeof expected === "string"
            ? value.toLowerCase() === expected.toLowerCase() : value === expected;
          if (condition.operator === "is") return values.some(equal);
          if (condition.operator === "is_not") return values.every((value) => !equal(value));
          const contains = values.some((value) => typeof value === "string" && typeof expected === "string" && value.toLowerCase().includes(expected.toLowerCase()));
          if (condition.operator === "contains") return contains;
          if (condition.operator === "not_contains") return !contains;
          const numeric = Number(values[0]); const expectedNumeric = Number(expected);
          if (condition.operator === "greater_than") return numeric > expectedNumeric;
          if (condition.operator === "greater_than_or_equal") return numeric >= expectedNumeric;
          if (condition.operator === "less_than") return numeric < expectedNumeric;
          if (condition.operator === "less_than_or_equal") return numeric <= expectedNumeric;
          if (condition.operator === "before") return String(values[0]) < String(expected);
          if (condition.operator === "after") return String(values[0]) > String(expected);
          if (condition.operator === "on") return String(values[0]) === String(expected);
          return false;
        }));
      }
      const sortRules = url.searchParams.get("sort")
        ? JSON.parse(String(url.searchParams.get("sort"))) as Array<{ field: string; direction: "asc" | "desc" }>
        : [{ field: url.searchParams.get("sortBy") ?? "createdAt", direction: url.searchParams.get("sortOrder") === "asc" ? "asc" as const : "desc" as const }];
      const sortValue = (contact: ApiContact, field: string) => {
        if (field === "name") return contact.name;
        if (field === "phone") return contact.phone;
        if (field === "email") return contact.email;
        if (field === "source") return contact.source;
        if (field === "profileName") return contact.profileName;
        if (field === "updatedAt") return contact.updatedAt;
        return contact.createdAt;
      };
      items.sort((left, right) => {
        for (const rule of sortRules) {
          const leftValue = sortValue(left, rule.field);
          const rightValue = sortValue(right, rule.field);
          if (leftValue === null && rightValue !== null) return 1;
          if (leftValue !== null && rightValue === null) return -1;
          const compared = String(leftValue ?? "").localeCompare(String(rightValue ?? ""), undefined, { numeric: true });
          if (compared !== 0) return compared * (rule.direction === "asc" ? 1 : -1);
        }
        return left.id.localeCompare(right.id) * (sortRules.at(-1)?.direction === "asc" ? 1 : -1);
      });
      const page = Number(url.searchParams.get("page") ?? 1);
      const pageSize = Number(url.searchParams.get("pageSize") ?? 25);
      const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
      return {
        items: items.slice((page - 1) * pageSize, page * pageSize),
        pagination: {
          page,
          pageSize,
          total: items.length,
          totalPages,
          hasNext: page < totalPages,
          hasPrevious: page > 1,
        },
      } as never;
    });
});

describe("ContactHub", () => {
  it("renders table-shaped skeleton rows while contacts are loading", () => {
    vi.mocked(apiRequest).mockImplementationOnce(() => new Promise<never>(() => undefined));
    render(<ContactHub />);

    expect(screen.getAllByTestId("contact-row-skeleton")).toHaveLength(8);
    expect(screen.getByTestId("contact-total-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Loading contacts...")).not.toBeInTheDocument();
  });

  it("keeps page controls fixed and assigns scrolling to the table data region", async () => {
    render(<ContactHub />);
    const totalUsers = await screen.findByText(/Total Users:/);
    const table = screen.getByRole("table");

    expect(screen.getByTestId("contact-page")).toHaveClass(
      "h-full",
      "overflow-hidden",
    );
    expect(screen.getByTestId("contact-page-header")).toHaveClass(
      "bg-white",
      "flex-none",
    );
    const toolbar = screen.getByRole("button", { name: "Segment" }).closest(".contact-filter-toolbar");
    expect(toolbar).toBeInTheDocument();
    expect(toolbar).toHaveClass("flex-nowrap", "min-w-0", "gap-2");
    expect(toolbar).not.toHaveClass("flex-wrap");
    expect(table).toHaveClass("contact-data-table", "bg-white");
    expect(table.querySelector("thead")).toHaveClass("contact-table-head", "bg-[var(--table-header)]");
    expect(screen.getByTestId("contact-table-scroll-region")).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-auto",
    );
    expect(screen.getAllByRole("rowgroup")[0]).toHaveClass(
      "sticky",
      "top-0",
      "border-b",
      "border-[var(--border-soft)]",
      "bg-[var(--table-header)]",
      "shadow-[inset_0_-1px_0_var(--border-soft)]",
    );
    const contactNameHeader = screen.getByRole("columnheader", { name: "Contact Name" });
    expect(within(contactNameHeader).getByRole("heading", { level: 3, name: "Contact Name" })).toBeInTheDocument();
    expect(contactNameHeader.parentElement).not.toHaveClass("text-[13px]", "font-semibold");
    expect(
      screen.getByTestId("contact-table-scroll-region"),
    ).not.toContainElement(totalUsers.parentElement);
    expect(screen.queryByRole("button", { name: "Previous page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
  });

  it("keeps table headers non-interactive and provides sorting only from the toolbar", async () => {
    render(<ContactHub />);
    await screen.findByText("Shani Deshwal");

    for (const label of contactColumnLabels) {
      const header = screen.getByRole("columnheader", { name: label });
      expect(header).not.toHaveAttribute("aria-sort");
      expect(within(header).queryByRole("button")).not.toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Configure sorting" })).toBeInTheDocument();
  });

  it("uses purple styling for contact tags", async () => {
    render(<ContactHub />);
    await screen.findByText("Shani Deshwal");

    expect(screen.getAllByText("ctwa").some((tag) => tag.classList.contains("bg-[var(--premium-soft)]") && tag.classList.contains("text-[var(--premium)]"))).toBe(true);
  });

  it("builds and applies ordered multi-field sorting from the toolbar", async () => {
    render(<ContactHub />);
    await screen.findByText("Shani Deshwal");
    const latestContactSort = () => {
      const request = [...vi.mocked(apiRequest).mock.calls].reverse().find(([path]) => new URL(String(path), "http://test.local").pathname.endsWith("/contacts"));
      return JSON.parse(new URL(String(request?.[0]), "http://test.local").searchParams.get("sort") ?? "[]");
    };

    fireEvent.click(screen.getByRole("button", { name: "Configure sorting" }));
    expect(screen.getByRole("heading", { name: "Sort contacts" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Field for sort priority 1" })).toHaveTextContent("Created On");

    fireEvent.click(screen.getByRole("combobox", { name: "Field for sort priority 1" }));
    fireEvent.click(screen.getByRole("option", { name: "Source" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Direction for sort priority 1" }));
    fireEvent.click(screen.getByRole("option", { name: "Ascending" }));
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));

    expect(screen.getByRole("combobox", { name: "Field for sort priority 2" })).toHaveTextContent("Contact Name");
    fireEvent.click(screen.getByRole("button", { name: "Apply sort" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Configure sorting" })).toHaveTextContent("2"));
    await waitFor(() => expect(latestContactSort()).toEqual([
        { field: "source", direction: "asc" },
        { field: "name", direction: "asc" },
    ]));

    fireEvent.click(screen.getByRole("button", { name: "Configure sorting" }));
    const primaryRule = screen.getByTestId("contact-sort-rule-0");
    const secondaryRule = screen.getByTestId("contact-sort-rule-1");
    fireEvent.dragStart(secondaryRule);
    fireEvent.dragOver(primaryRule);
    fireEvent.drop(primaryRule);
    fireEvent.click(screen.getByRole("button", { name: "Apply sort" }));

    await waitFor(() => expect(latestContactSort()).toEqual([
      { field: "name", direction: "asc" },
      { field: "source", direction: "asc" },
    ]));

    fireEvent.click(screen.getByRole("button", { name: "Configure sorting" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove sort priority 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply sort" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Configure sorting" })).toHaveTextContent("1"));
    expect(latestContactSort()).toEqual([{ field: "name", direction: "asc" }]);

    fireEvent.click(screen.getByRole("button", { name: "Configure sorting" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    expect(screen.getByRole("combobox", { name: "Field for sort priority 1" })).toHaveTextContent("Created On");
    expect(screen.getByRole("combobox", { name: "Direction for sort priority 1" })).toHaveTextContent("Descending");
  }, 10_000);

  it("loads the next contact batch once when the table is scrolled near the bottom", async () => {
    apiContacts = Array.from({ length: 30 }, (_, index) => ({
      ...seedContacts[index % seedContacts.length],
      id: String(index + 1),
      name: `Contact ${index + 1}`,
      phone: `+91900000${String(index).padStart(4, "0")}`,
      createdAt: new Date(Date.UTC(2026, 0, 30 - index)).toISOString(),
      updatedAt: new Date(Date.UTC(2026, 0, 30 - index)).toISOString(),
    }));
    render(<ContactHub />);

    expect(await screen.findByText("Contact 25")).toBeInTheDocument();
    expect(screen.queryByText("Contact 26")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 25 of 30")).toBeInTheDocument();

    const scrollRegion = screen.getByTestId("contact-table-scroll-region");
    Object.defineProperties(scrollRegion, {
      scrollTop: { configurable: true, value: 700 },
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1200 },
    });
    fireEvent.scroll(scrollRegion);
    fireEvent.scroll(scrollRegion);

    expect(await screen.findByText("Contact 30")).toBeInTheDocument();
    expect(screen.getByText("Showing 30 of 30")).toBeInTheDocument();
    const countPageTwoRequests = () => vi.mocked(apiRequest).mock.calls.filter(([path]) => {
      const url = new URL(String(path), "http://test.local");
      return url.pathname.endsWith("/contacts") && url.searchParams.get("page") === "2";
    }).length;
    expect(countPageTwoRequests()).toBe(1);

    fireEvent.scroll(scrollRegion);
    await waitFor(() => expect(countPageTwoRequests()).toBe(1));
  });

  it("keeps loaded contacts visible and retries a failed infinite-scroll request", async () => {
    apiContacts = Array.from({ length: 30 }, (_, index) => ({
      ...seedContacts[index % seedContacts.length],
      id: String(index + 1),
      name: `Retry Contact ${index + 1}`,
      phone: `+91800000${String(index).padStart(4, "0")}`,
      createdAt: new Date(Date.UTC(2026, 0, 30 - index)).toISOString(),
      updatedAt: new Date(Date.UTC(2026, 0, 30 - index)).toISOString(),
    }));
    const defaultImplementation = vi.mocked(apiRequest).getMockImplementation();
    let shouldFailPageTwo = true;
    vi.mocked(apiRequest).mockImplementation(async (path, options) => {
      const url = new URL(String(path), "http://test.local");
      if (
        shouldFailPageTwo &&
        url.pathname.endsWith("/contacts") &&
        url.searchParams.get("page") === "2"
      ) {
        shouldFailPageTwo = false;
        throw new Error("Temporary request failure");
      }
      if (!defaultImplementation) throw new Error("Missing API test implementation");
      return defaultImplementation(path, options);
    });
    render(<ContactHub />);

    expect(await screen.findByText("Retry Contact 25")).toBeInTheDocument();
    const scrollRegion = screen.getByTestId("contact-table-scroll-region");
    Object.defineProperties(scrollRegion, {
      scrollTop: { configurable: true, value: 700 },
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1200 },
    });
    fireEvent.scroll(scrollRegion);

    const retryButton = await screen.findByRole("button", { name: "Retry loading more" });
    expect(screen.getByText("Retry Contact 1")).toBeInTheDocument();
    expect(screen.getByText("Retry Contact 25")).toBeInTheDocument();
    expect(screen.queryByText("Retry Contact 26")).not.toBeInTheDocument();
    fireEvent.click(retryButton);

    expect(await screen.findByText("Retry Contact 30")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry loading more" })).not.toBeInTheDocument();
    expect(screen.getByText("Showing 30 of 30")).toBeInTheDocument();
  });

  it("renders the contact table and filters contacts by search", async () => {
    render(<ContactHub />);

    expect(
      screen.getByRole("heading", { name: "Contact Hub" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Shani Deshwal")).toBeInTheDocument();
    expect(screen.getByText("Tech Tree Digital...")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search contacts" }), {
      target: { value: "Shani" },
    });

    await waitFor(() =>
      expect(
        screen.queryByText("Tech Tree Digital..."),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Shani Deshwal")).toBeInTheDocument();
  });

  it("opens contact details when a table row is clicked", async () => {
    render(<ContactHub />);
    const contactName = await screen.findByText("Shani Deshwal");

    fireEvent.click(contactName.closest("tr") as HTMLTableRowElement);

    expect(routerMocks.navigate).toHaveBeenCalledWith("/contacts/1");
  });

  it("searches available tags and filters contacts without a portal dropdown", async () => {
    render(<ContactHub />);
    await screen.findByText("Shani Deshwal");
    fireEvent.click(screen.getByRole("button", { name: "Select tag" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search tags" }), {
      target: { value: "ctw" },
    });

    expect(screen.getByRole("option", { name: "ctwa" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "ctwa" }));

    expect(
      screen.getByRole("button", { name: "Select tag" }),
    ).toHaveTextContent("ctwa");
    await waitFor(() =>
      expect(
        screen.queryByText("Tech Tree Digital..."),
      ).not.toBeInTheDocument(),
    );
  });

  it("enables campaign sending after selecting a contact", async () => {
    render(<ContactHub />);
    await screen.findByText("Shani Deshwal");
    const sendCampaign = screen.getByRole("button", { name: "Send Campaign" });
    expect(sendCampaign.querySelector("svg")).toHaveClass("lucide-megaphone");
    expect(sendCampaign).toBeDisabled();

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Shani Deshwal" }),
    );

    expect(sendCampaign).toBeEnabled();
    expect(routerMocks.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Select Shani Deshwal" })).toHaveClass("size-[17px]", "accent-[var(--brand)]");
    expect(screen.getByRole("checkbox", { name: "Select all contacts" })).toHaveClass("size-[17px]", "accent-[var(--brand)]");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Shani Deshwal" }).closest("td") as HTMLTableCellElement);
    expect(routerMocks.navigate).not.toHaveBeenCalled();
    fireEvent.click(sendCampaign);
    await waitFor(() => expect(routerMocks.navigate).toHaveBeenCalledWith("/campaigns?contactIds=1"));
  });

  it("prevents opted-out contacts from entering the campaign flow", async () => {
    apiContacts[0] = { ...apiContacts[0], whatsappOpted: false, marketingBlocked: true } as ApiContact;
    render(<ContactHub />);
    await screen.findByText("Shani Deshwal");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Shani Deshwal" }));
    fireEvent.click(screen.getByRole("button", { name: "Send Campaign" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Campaign cannot continue: 1 opted out."));
    expect(routerMocks.navigate).not.toHaveBeenCalled();
  });

  it("soft deletes selected contacts from More Actions", async () => {
    render(<ContactHub />);
    await screen.findByText("Shani Deshwal");

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Shani Deshwal" }));
    fireEvent.click(screen.getByRole("button", { name: "More Actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete contacts" }));
    const confirmation = screen.getByRole("alertdialog", { name: "Delete selected contacts?" });
    expect(within(confirmation).getByText(/remain in history/i)).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Delete contacts" }));

    await waitFor(() => expect(screen.queryByText("Shani Deshwal")).not.toBeInTheDocument());
    expect(apiRequest).toHaveBeenCalledWith(
      "/workspaces/workspace-1/contacts/bulk/delete",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ contactIds: ["1"] }) }),
    );
    expect(toast.success).toHaveBeenCalledWith("Contact deleted successfully.");
  });

  it("allows columns to be hidden without removing the selection column", () => {
    render(<ContactHub />);
    fireEvent.click(screen.getByRole("button", { name: "Modify Columns" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Email ID" }));

    expect(
      screen.queryByRole("columnheader", { name: "Email ID" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Contact Name" }),
    ).toBeInTheDocument();
  });

  it("restores the saved column selection from local storage after remounting", async () => {
    const firstRender = render(<ContactHub />);
    await screen.findByText("Shani Deshwal");
    fireEvent.click(screen.getByRole("button", { name: "Modify Columns" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Email ID" }));

    expect(JSON.parse(window.localStorage.getItem("contact-hub-columns-v2") ?? "{}").visible)
      .not.toContain("Email ID");
    firstRender.unmount();
    render(<ContactHub />);
    await screen.findByText("Shani Deshwal");

    expect(screen.queryByRole("columnheader", { name: "Email ID" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Modify Columns" }));
    expect(screen.getByRole("checkbox", { name: "Email ID" })).not.toBeChecked();
  });

  it("falls back to all columns when the saved column selection is corrupted", async () => {
    window.localStorage.setItem("contact-hub-columns-v2", "not-json");
    render(<ContactHub />);
    await screen.findByText("Shani Deshwal");

    contactColumnLabels.forEach((column) => {
      expect(screen.getByRole("columnheader", { name: column })).toBeInTheDocument();
    });
  });

  it("reorders table columns by dragging and restores the saved sequence", async () => {
    const firstRender = render(<ContactHub />);
    await screen.findByText("Shani Deshwal");
    fireEvent.click(screen.getByRole("button", { name: "Modify Columns" }));
    const phoneColumn = screen.getByTestId("column-order-item-Phone Number");
    const nameColumn = screen.getByTestId("column-order-item-Contact Name");
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: vi.fn(),
      getData: vi.fn(),
    };

    fireEvent.dragStart(phoneColumn, { dataTransfer });
    fireEvent.dragOver(nameColumn, { dataTransfer });
    fireEvent.drop(nameColumn, { dataTransfer });

    const visibleHeaderOrder = () => screen.getAllByRole("columnheader")
      .map((header) => header.textContent?.trim() ?? "")
      .filter((header) => contactColumnLabels.includes(header));
    expect(visibleHeaderOrder().slice(0, 2)).toEqual(["Phone Number", "Contact Name"]);
    const firstContactCells = screen.getByText("Shani Deshwal").closest("tr")?.querySelectorAll("td");
    expect(firstContactCells?.[1]).toHaveTextContent("+91 9897033994");
    expect(firstContactCells?.[2]).toHaveTextContent("Shani Deshwal");
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem("contact-hub-columns-v2") ?? "{}");
      expect(stored.order.slice(0, 2)).toEqual(["Phone Number", "Contact Name"]);
    });

    firstRender.unmount();
    render(<ContactHub />);
    await screen.findByText("Shani Deshwal");
    expect(visibleHeaderOrder().slice(0, 2)).toEqual(["Phone Number", "Contact Name"]);
  });

  it("creates a contact from the create contact dialog", async () => {
    render(<ContactHub />);
    fireEvent.click(screen.getByRole("button", { name: "Create Contacts" }));
    const drawer = screen.getByRole("dialog", { name: "Create contact" });

    fireEvent.change(within(drawer).getByLabelText(/Contact name/), {
      target: { value: "New Customer" },
    });
    const countrySelector = within(drawer).getByRole("combobox", {
      name: "Country selector",
    });
    expect(countrySelector).toHaveAttribute("data-country", "in");
    fireEvent.click(countrySelector);
    const indiaOption = screen.getByRole("option", { name: "India +91" });
    expect(indiaOption.querySelector("img")).toHaveAttribute(
      "data-country",
      "in",
    );
    fireEvent.click(indiaOption);
    fireEvent.change(within(drawer).getByLabelText(/Phone number/), {
      target: { value: "+91 9000000000" },
    });
    fireEvent.change(within(drawer).getByLabelText(/Tags/), {
      target: { value: "new, vip" },
    });
    fireEvent.change(await within(drawer).findByRole("textbox", { name: "Company" }), {
      target: { value: "Acme India" },
    });
    fireEvent.click(
      within(drawer).getByRole("button", { name: "Create contact" }),
    );

    expect(await screen.findByText("New Customer")).toBeInTheDocument();
    expect(screen.getByText("+91 9000000000")).toBeInTheDocument();
    expect(screen.getByText("new")).toBeInTheDocument();
    expect(screen.getByText("vip")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiContacts[0]?.whatsappId).toBeNull();
    expect(apiContacts[0]?.profileName).toBeNull();
    expect(apiContacts[0]?.customAttributes).toEqual({ company: "Acme India" });
    const createCall = vi.mocked(apiRequest).mock.calls.find(([path, options]) => new URL(String(path), "http://test.local").pathname.endsWith("/contacts") && options?.method === "POST");
    const createPayload = JSON.parse(String(createCall?.[1]?.body));
    expect(createPayload).toMatchObject({ whatsappOpted: true, whatsappConsentSource: "Manual" });
    expect(createPayload).not.toHaveProperty("userId");
  });

  it("blocks contact creation until required custom fields are completed", async () => {
    apiCustomFields[0] = { ...apiCustomFields[0], required: true };
    render(<ContactHub />);
    fireEvent.click(screen.getByRole("button", { name: "Create Contacts" }));
    const drawer = screen.getByRole("dialog", { name: "Create contact" });
    const requiredCompany = await within(drawer).findByRole("textbox", { name: "Company" });
    fireEvent.change(within(drawer).getByLabelText(/Contact name/), { target: { value: "Missing Company" } });
    fireEvent.change(within(drawer).getByLabelText(/Phone number/), { target: { value: "+91 9000000001" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Create contact" }));

    expect(requiredCompany).toBeRequired();
    expect(requiredCompany).toHaveAttribute("aria-invalid", "true");
    expect(requiredCompany).toHaveClass("border-[var(--danger)]");
    expect(screen.getByText("Please fix the highlighted fields before creating the contact.")).toBeInTheDocument();
    expect(apiContacts.some(({ name }) => name === "Missing Company")).toBe(false);
  });

  it("highlights the phone field when the API rejects a duplicate contact", async () => {
    createApiError = new ApiError(409, "A contact with this phone number already exists.", "CONTACT_PHONE_EXISTS");
    render(<ContactHub />);
    fireEvent.click(screen.getByRole("button", { name: "Create Contacts" }));
    const drawer = screen.getByRole("dialog", { name: "Create contact" });
    fireEvent.change(within(drawer).getByLabelText(/Contact name/), { target: { value: "Duplicate Contact" } });
    fireEvent.change(within(drawer).getByLabelText(/Phone number/), { target: { value: "+91 9000000000" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Create contact" }));

    const phone = within(drawer).getByLabelText(/Phone number/);
    expect(await screen.findByText("Please fix the highlighted fields before creating the contact.")).toBeInTheDocument();
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(phone).toHaveClass("border-[var(--danger)]");
    expect(screen.getByText("A contact with this phone number already exists.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Create contact" })).toBeInTheDocument();
  });

  it("imports a CSV through mapping, validation, and duplicate review", async () => {
    render(<ContactHub />);
    fireEvent.click(screen.getByRole("button", { name: "More Actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Import contacts" }));

    const csv = new File(
      [
        "Contact Name,Phone Number,Email ID,Source,Tags,Company\nNew Imported,+91 9000000000,new@example.com,Website,new|vip,Acme Imports\nShani Deshwal,+91 9897033994,,Import,old,Existing Company\nBad Row,123,bad-email,Manual,,Invalid Company",
      ],
      "contacts.csv",
      { type: "text/csv" },
    );
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [csv] },
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Review import" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review import" }));
    expect(
      await screen.findByRole("button", { name: "Import 1 contacts" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Duplicates")).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Import 1 contacts" }));
    expect(await screen.findByText("Import complete")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByText("New Imported")).toBeInTheDocument();
    expect(screen.getByText("new")).toBeInTheDocument();
    expect(screen.getByText("vip")).toBeInTheDocument();
    expect(apiContacts.find(({ name }) => name === "New Imported")?.customAttributes).toEqual({ company: "Acme Imports" });
  });

  it("imports an Excel .xlsx workbook through the same mapping and review flow", async () => {
    spreadsheetMocks.readSheet.mockResolvedValue([
      ["Contact Name", "Phone Number", "Email ID", "Source", "Tags", "Company", "Customer tier", "Lead status", "WhatsApp Opted In", "Consent Source", "Consent Date and Time"],
      ["Excel Imported", "+91 9111111111", "excel@example.com", "Import", "excel;lead", "Excel Corp", 5, "Lead", "No", "Support request", "2026-08-20T10:30:00+05:30"],
    ]);
    render(<ContactHub />);
    fireEvent.click(screen.getByRole("button", { name: "More Actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Import contacts" }));
    const workbook = new File([new Uint8Array([80, 75, 3, 4])], "contacts.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [workbook] } });

    expect(await screen.findByRole("button", { name: "Review import" })).toBeInTheDocument();
    expect(spreadsheetMocks.readSheet).toHaveBeenCalledWith(workbook);
    fireEvent.click(screen.getByRole("button", { name: "Review import" }));
    fireEvent.click(await screen.findByRole("button", { name: "Import 1 contacts" }));
    expect(await screen.findByText("Import complete")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(await screen.findByText("Excel Imported")).toBeInTheDocument();
    expect(apiContacts.find(({ name }) => name === "Excel Imported")?.customAttributes).toEqual({
      company: "Excel Corp", customer_tier: 5, lead_status: "Lead",
    });
    expect(apiContacts.find(({ name }) => name === "Excel Imported")).toMatchObject({ whatsappOpted: false, marketingBlocked: true, whatsappConsentSource: "Support request" });
  });

  it("rejects files outside CSV and Excel .xlsx", async () => {
    render(<ContactHub />);
    fireEvent.click(screen.getByRole("button", { name: "More Actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Import contacts" }));
    const file = new File(["not a csv"], "contacts.txt", {
      type: "text/plain",
    });
    fireEvent.change(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [file] } },
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please choose a CSV or Excel (.xlsx) file.",
    );
  });

  it("uses a filter icon and applies a custom tag segment", async () => {
    render(<ContactHub />);
    await screen.findByText("Shani Deshwal");
    const segmentButton = screen.getByRole("button", { name: "Segment" });
    expect(segmentButton.querySelector("svg")).toHaveClass("lucide-list-filter");
    fireEvent.click(segmentButton);

    expect(screen.getByRole("textbox", { name: "Search segments" })).toBeInTheDocument();
    const createSegmentButton = screen.getByRole("button", { name: "Create new segment" });
    expect(createSegmentButton).toHaveClass("contact-filter-primary-action", "text-white");
    fireEvent.click(createSegmentButton);
    expect(
      screen.getByRole("heading", { name: "Create Segment" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Create Segment" }).parentElement).toHaveClass("z-[1400]");
    fireEvent.click(screen.getByRole("button", { name: "Select a tag" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search segment tags" }), {
      target: { value: "ctw" },
    });
    fireEvent.click(screen.getByRole("option", { name: /^ctwa$/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Apply Without Saving" }),
    );

    expect(
      screen.queryByRole("heading", { name: "Create Segment" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByText("Tech Tree Digital..."),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Shani Deshwal")).toBeInTheDocument();
  });

  it("applies and saves typed custom-field filters through backend query conditions", async () => {
    render(<ContactHub />);
    await screen.findByText("Shani Deshwal");
    fireEvent.click(screen.getByRole("button", { name: "Segment" }));
    fireEvent.click(screen.getByRole("button", { name: "Create new segment" }));
    fireEvent.click(screen.getByRole("button", { name: "Fields" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Condition field" }), { target: { value: "custom:customer_tier" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Condition operator" }), { target: { value: "greater_than" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Condition value" }), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Segment name"), { target: { value: "High-tier contacts" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Segment" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Segment saved successfully."));
    expect(apiSegments[0]?.conditions).toEqual([{ type: "custom_field", field: "customer_tier", operator: "greater_than", value: 3 }]);
    await waitFor(() => expect(screen.queryByText("Shavez Akhter Jou...")).not.toBeInTheDocument());
    expect(screen.getByText("Shani Deshwal")).toBeInTheDocument();
    expect(screen.queryByText("Tech Tree Digital...")).not.toBeInTheDocument();
  });

  it("keeps segment actions enabled and highlights missing required fields", async () => {
    render(<ContactHub />);
    await screen.findByText("Shani Deshwal");
    fireEvent.click(screen.getByRole("button", { name: "Segment" }));
    fireEvent.click(screen.getByRole("button", { name: "Create new segment" }));

    const saveButton = screen.getByRole("button", { name: "Save Segment" });
    const applyButton = screen.getByRole("button", {
      name: "Apply Without Saving",
    });
    expect(saveButton).toBeEnabled();
    expect(applyButton).toBeEnabled();

    fireEvent.click(saveButton);

    expect(screen.getByLabelText(/Segment name/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Select a tag" }),
    ).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Segment name is required.")).toBeInTheDocument();
    expect(screen.getByText("Select a tag to continue.")).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalledWith(
      expect.stringContaining("/contacts/segments"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("saves, searches, and reapplies a segment through backend filtering", async () => {
    render(<ContactHub />);
    await screen.findByText("Shani Deshwal");
    fireEvent.click(screen.getByRole("button", { name: "Segment" }));
    fireEvent.click(screen.getByRole("button", { name: "Create new segment" }));

    fireEvent.change(screen.getByLabelText("Segment name"), {
      target: { value: "CTWA customers" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Select a tag" }));
    fireEvent.click(screen.getByRole("option", { name: /^ctwa$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Segment" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Segment saved successfully."));
    await waitFor(() => expect(screen.queryByText("Tech Tree Digital...")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Segment" })).toHaveTextContent("CTWA customers");

    fireEvent.click(screen.getByRole("button", { name: "Segment" }));
    const segmentSearch = screen.getByRole("textbox", { name: "Search segments" });
    fireEvent.change(segmentSearch, { target: { value: "ctwa" } });
    const savedSegment = await screen.findByRole("option", { name: "CTWA customers" });
    expect(savedSegment).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: "All contacts" }));
    expect(await screen.findByText("Tech Tree Digital...")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Segment" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search segments" }), {
      target: { value: "ctwa" },
    });
    fireEvent.click(await screen.findByRole("option", { name: "CTWA customers" }));
    await waitFor(() => expect(screen.queryByText("Tech Tree Digital...")).not.toBeInTheDocument());

    expect(apiRequest).toHaveBeenCalledWith(
      expect.stringContaining("segmentConditions="),
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("edits and deletes a saved segment without deleting contacts", async () => {
    apiSegments = [{
      id: "segment-vip",
      name: "VIP contacts",
      conditions: [{ type: "tag", field: "tags", operator: "is", value: "ctwa" }],
      createdAt: "2026-08-24T10:00:00.000Z",
      updatedAt: "2026-08-24T10:00:00.000Z",
    }];
    render(<ContactHub />);
    await screen.findByText("Shani Deshwal");

    fireEvent.click(screen.getByRole("button", { name: "Segment" }));
    await screen.findByRole("option", { name: "VIP contacts" });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Manage VIP contacts" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));

    expect(screen.getByRole("heading", { name: "Edit Segment" })).toBeInTheDocument();
    expect(screen.getByLabelText("Segment name")).toHaveValue("VIP contacts");
    expect(screen.getByRole("button", { name: "Select a tag" })).toHaveTextContent("ctwa");
    fireEvent.change(screen.getByLabelText("Segment name"), { target: { value: "Priority contacts" } });
    fireEvent.click(screen.getByRole("button", { name: "Update Segment" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Segment updated successfully."));
    fireEvent.click(screen.getByRole("button", { name: "Segment" }));
    fireEvent.click(await screen.findByRole("option", { name: "Priority contacts" }));
    expect(screen.getByRole("button", { name: "Segment" })).toHaveTextContent("Priority contacts");

    fireEvent.click(screen.getByRole("button", { name: "Segment" }));
    fireEvent.pointerDown(await screen.findByRole("button", { name: "Manage Priority contacts" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const confirmation = screen.getByRole("alertdialog", { name: "Delete this segment?" });
    expect(within(confirmation).getByText(/contacts and their data will not be affected/i)).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Delete segment" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Segment deleted successfully."));
    expect(screen.getByRole("button", { name: "Segment" })).toHaveTextContent(/^Segment$/);
    expect(apiContacts).toHaveLength(seedContacts.length);
    expect(apiSegments).toHaveLength(0);
  });
});
