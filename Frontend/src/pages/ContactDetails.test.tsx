import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContactDetails } from "@/pages/ContactDetails";
import { apiRequest } from "@/lib/api";
import type { ContactCustomFieldDefinition } from "@/pages/contact.types";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ accessToken: "access-token", user: { memberships: [{ workspace: { id: "workspace-1" }, role: { permissions: ["contacts.read", "contacts.update", "contacts.phone.view", "contacts.fields.view"] } }] } }) }));
vi.mock("@/lib/api", () => ({ ApiError: class ApiError extends Error {}, apiRequest: vi.fn() }));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const contact = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Shavez Akhter Journalist",
  phone: "+919695266786",
  hasPhone: true,
  whatsappId: "919695266786",
  hasWhatsappId: true,
  profileName: "Shavez WhatsApp",
  email: "shavez@example.com",
  source: "WhatsApp",
  whatsappOpted: true,
  whatsappOptInSource: "Website form",
  whatsappOptedInAt: "2026-08-17T05:40:00.000Z",
  whatsappOptOutSource: null,
  whatsappOptedOutAt: null,
  marketingBlocked: false,
  marketingBlockedAt: null,
  marketingBlockSource: null,
  marketingBlockReason: null,
  marketingEligible: true,
  tags: [{ id: "tag-1", name: "ctwa", color: null }],
  customAttributes: { appointmentTime: "10:30 AM", customer_tier: 3 },
  createdAt: "2026-08-17T05:47:00.000Z",
  updatedAt: "2026-08-18T06:30:00.000Z",
};

const actor = { id: "user-1", firstName: "Yogesh", lastName: "Duvedi", email: "yogesh@example.com" };
let tasks: Array<Record<string, unknown>>;
let notes: Array<Record<string, unknown>>;
let customFields: ContactCustomFieldDefinition[];
let historyMessages: Array<Record<string, unknown>>;

function installApiMock() {
  vi.mocked(apiRequest).mockImplementation(async (path, options = {}) => {
    const method = options.method ?? "GET";
    if (path.includes("/contacts/custom-fields")) {
      if (path.endsWith("/contacts/custom-fields") && method === "POST") {
        const body = JSON.parse(String(options.body));
        const field = { id: `field-${customFields.length + 1}`, key: body.label.toLowerCase().replace(/\s+/g, "_"), label: body.label, type: body.type, options: body.options, required: body.required, position: customFields.length, archivedAt: null, createdAt: "2026-08-24T09:00:00.000Z", updatedAt: "2026-08-24T09:00:00.000Z" } as ContactCustomFieldDefinition;
        customFields = [...customFields, field];
        return field as never;
      }
      return customFields as never;
    }
    if (path.endsWith("/tasks?page=1&pageSize=100")) return { items: tasks, pagination: { total: tasks.length } } as never;
    if (path.endsWith("/notes?page=1&pageSize=100")) return { items: notes, pagination: { total: notes.length } } as never;
    if (path.endsWith("/conversations/history?page=1&pageSize=100")) return { conversations: [], messages: historyMessages } as never;
    if (path.endsWith("/tasks") && method === "POST") {
      const body = JSON.parse(String(options.body));
      const task = { id: `task-${tasks.length + 1}`, ...body, status: "OPEN", completedAt: null, createdAt: "2026-08-24T09:00:00.000Z", createdBy: actor };
      tasks = [task, ...tasks];
      return task as never;
    }
    if (path.includes("/tasks/") && method === "PATCH") {
      const id = path.split("/").at(-1);
      const body = JSON.parse(String(options.body));
      tasks = tasks.map((task) => task.id === id ? { ...task, ...body, completedAt: body.status === "COMPLETED" ? "2026-08-24T09:05:00.000Z" : null } : task);
      return tasks.find((task) => task.id === id) as never;
    }
    if (path.endsWith("/notes") && method === "POST") {
      const body = JSON.parse(String(options.body));
      const note = { id: `note-${notes.length + 1}`, title: body.title || body.content.split("\n")[0], content: body.content, createdAt: "2026-08-24T09:10:00.000Z", updatedAt: "2026-08-24T09:10:00.000Z", createdBy: actor };
      notes = [note, ...notes];
      return note as never;
    }
    if (path.includes("/notes/") && method === "PATCH") {
      const id = path.split("/").at(-1);
      const body = JSON.parse(String(options.body));
      notes = notes.map((note) => note.id === id ? { ...note, ...body, title: body.content.split("\n")[0], updatedAt: "2026-08-24T09:15:00.000Z" } : note);
      return notes.find((note) => note.id === id) as never;
    }
    if (path.includes("/notes/") && method === "DELETE") {
      const id = path.split("/").at(-1);
      notes = notes.filter((note) => note.id !== id);
      return undefined as never;
    }
    if (path.endsWith(`/contacts/${contact.id}`) && method === "PATCH") {
      const body = JSON.parse(String(options.body));
      const tagNames = body.tags ?? contact.tags.map(({ name }) => name);
      const opted = body.whatsappOpted ?? contact.whatsappOpted;
      const blocked = body.marketingBlocked ?? (body.whatsappOpted === false ? true : contact.marketingBlocked);
      return { ...contact, ...body, whatsappOpted: opted, whatsappOptInSource: opted && body.whatsappConsentSource ? body.whatsappConsentSource : contact.whatsappOptInSource, whatsappOptedInAt: opted && body.whatsappConsentAt ? body.whatsappConsentAt : contact.whatsappOptedInAt, whatsappOptOutSource: !opted ? body.whatsappConsentSource : contact.whatsappOptOutSource, whatsappOptedOutAt: !opted ? body.whatsappConsentAt : contact.whatsappOptedOutAt, marketingBlocked: blocked, marketingBlockedAt: blocked ? new Date().toISOString() : null, marketingBlockSource: blocked ? body.marketingBlockSource ?? body.whatsappConsentSource ?? "Manual" : null, marketingBlockReason: blocked ? body.marketingBlockReason ?? "WhatsApp opt-out" : null, marketingEligible: opted && !blocked, tags: tagNames.map((name: string, index: number) => ({ id: `tag-${index + 1}`, name, color: null })) } as never;
    }
    if (path.endsWith(`/contacts/${contact.id}`)) return contact as never;
    throw new Error(`Unhandled API request: ${method} ${path}`);
  });
}

function renderDetails() {
  return render(<MemoryRouter initialEntries={[`/contacts/${contact.id}`]}><Routes><Route path="/contacts/:contactId" element={<ContactDetails />} /><Route path="/contacts" element={<p>Contacts list</p>} /></Routes></MemoryRouter>);
}

describe("ContactDetails", () => {
  beforeEach(() => {
    tasks = [];
    notes = [{ id: "note-1", title: "Hey", content: "Hey", createdAt: "2026-08-24T08:00:00.000Z", updatedAt: "2026-08-24T08:00:00.000Z", createdBy: actor }];
    historyMessages = [{ id: "message-1", conversationId: "conversation-1", direction: "INCOMING", type: "TEXT", status: "DELIVERED", text: "Hello from WhatsApp", sentAt: "2026-08-24T08:30:00.000Z", metaMessageId: "wamid-1" }];
    customFields = [{ id: "field-1", key: "customer_tier", label: "Customer tier", type: "NUMBER", options: [], required: false, position: 0, archivedAt: null, createdAt: "2026-08-24T07:00:00.000Z", updatedAt: "2026-08-24T07:00:00.000Z" }];
    vi.mocked(apiRequest).mockReset();
    installApiMock();
  });

  it("renders a layout-matched skeleton while contact details are loading", () => {
    vi.mocked(apiRequest).mockImplementationOnce(() => new Promise<never>(() => undefined));
    renderDetails();

    expect(screen.getByRole("status", { name: "Loading contact details" })).toBeInTheDocument();
    expect(screen.getByTestId("contact-details-skeleton")).toHaveClass("h-full", "overflow-hidden");
    expect(screen.getByRole("heading", { level: 3, name: "Contact Details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to contacts" })).toBeInTheDocument();
    const loadingTabs = screen.getByTestId("contact-details-loading-tabs");
    for (const label of ["Timeline", "Tasks", "Documents", "Notes", "Call Log"]) {
      expect(within(loadingTabs).getByText(label)).toBeInTheDocument();
    }
    expect(loadingTabs.querySelector('[data-slot="skeleton"]')).not.toBeInTheDocument();
    expect(screen.queryByText("Loading contact details...")).not.toBeInTheDocument();
  });

  it("loads contact data into bounded detail and activity regions", async () => {
    renderDetails();

    expect(await screen.findByRole("heading", { name: contact.name })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Contact Details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to contacts" })).toBeInTheDocument();
    expect(screen.getByTestId("contact-details-page")).toHaveClass("h-full", "overflow-hidden");
    expect(screen.getByTestId("contact-details-scroll-region")).toHaveClass("min-h-0", "overflow-y-auto");
    expect(screen.getByRole("button", { name: "Add custom field" })).toHaveClass("flex-none", "border-t");
    expect(screen.getAllByText(contact.phone).length).toBeGreaterThan(0);
    expect(screen.getByText(contact.email)).toBeInTheDocument();
    expect(screen.getByText(contact.whatsappId)).toBeInTheDocument();
    expect(screen.getByText(contact.profileName)).toBeInTheDocument();
    expect(screen.getByText("appointmentTime")).toBeInTheDocument();
    expect(screen.getByText("Contact created via WhatsApp")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(`/workspaces/workspace-1/contacts/${contact.id}`, expect.objectContaining({ headers: { authorization: "Bearer access-token" } }));
  });

  it("renders persisted conversation messages in the contact timeline", async () => {
    renderDetails();

    expect(await screen.findByText("Hello from WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Incoming message")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(`/workspaces/workspace-1/contacts/${contact.id}/conversations/history?page=1&pageSize=100`, expect.objectContaining({ headers: { authorization: "Bearer access-token" } }));
  });

  it("shows table fields in Details and saves hover-initiated inline edits", async () => {
    renderDetails();
    await screen.findByRole("heading", { name: contact.name });

    expect(screen.getByText("Phone Number")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp ID")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp Profile Name")).toBeInTheDocument();
    expect(screen.getByText("Email ID")).toBeInTheDocument();
    expect(screen.getByText("Created On")).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Tags")).toBeInTheDocument();
    expect(screen.queryByText("Contact ID")).not.toBeInTheDocument();
    const editName = screen.getByRole("button", { name: "Edit Contact Name" });
    expect(editName).toHaveClass("opacity-0", "group-hover:opacity-100");

    fireEvent.click(editName);
    fireEvent.change(screen.getByRole("textbox", { name: "Contact Name" }), { target: { value: "Shavez Akhter" } });
    expect(screen.getByTestId("contact-edit-footer")).toHaveClass("flex-none", "border-t");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByRole("heading", { name: "Shavez Akhter" })).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(`/workspaces/workspace-1/contacts/${contact.id}`, expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ name: "Shavez Akhter", phone: contact.phone, whatsappId: contact.whatsappId, profileName: contact.profileName, email: contact.email, source: contact.source, tags: ["ctwa"], customAttributes: contact.customAttributes }),
    }));
  });

  it("captures opt-out metadata and automatically blocks campaign eligibility", async () => {
    renderDetails();
    await screen.findByRole("heading", { name: contact.name });
    expect(screen.getByText("Website form")).toBeInTheDocument();
    expect(screen.getByText("Eligible")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit WhatsApp Opted" }));
    fireEvent.change(screen.getByRole("combobox", { name: "WhatsApp Opted" }), { target: { value: "false" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Consent source" }), { target: { value: "WhatsApp keyword STOP" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(`/workspaces/workspace-1/contacts/${contact.id}`, expect.objectContaining({
      method: "PATCH",
      body: expect.stringContaining('"whatsappOpted":false'),
    })));
    const updateCall = vi.mocked(apiRequest).mock.calls.find(([path, options]) => path.endsWith(`/contacts/${contact.id}`) && options?.method === "PATCH");
    const payload = JSON.parse(String(updateCall?.[1]?.body));
    expect(payload).toMatchObject({ whatsappOpted: false, whatsappConsentSource: "WhatsApp keyword STOP", marketingBlocked: true, marketingBlockReason: "WhatsApp opt-out" });
    expect(await screen.findByText("Not eligible")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp keyword STOP")).toBeInTheDocument();
  });

  it("renders typed custom values, edits them, and creates field definitions", async () => {
    renderDetails();
    await screen.findByRole("heading", { name: contact.name });

    expect(screen.getByText("Customer tier")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit Customer tier" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Customer tier" }), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(`/workspaces/workspace-1/contacts/${contact.id}`, expect.objectContaining({
      method: "PATCH",
      body: expect.stringContaining('"customer_tier":5'),
    })));

    fireEvent.click(screen.getByRole("button", { name: "Manage fields" }));
    expect(screen.getByRole("heading", { name: "Manage custom fields" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New field" }));
    fireEvent.change(screen.getByLabelText("Field label"), { target: { value: "Company" } });
    fireEvent.click(screen.getByRole("combobox", { name: "Field type" }));
    const numberOption = screen.getByRole("option", { name: "Number" });
    let portalLayer: HTMLElement | null = numberOption;
    while (portalLayer && !portalLayer.classList.contains("z-[160]")) portalLayer = portalLayer.parentElement;
    expect(portalLayer).not.toBeNull();
    fireEvent.click(numberOption);
    fireEvent.click(screen.getByRole("button", { name: "Create field" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/workspaces/workspace-1/contacts/custom-fields", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ label: "Company", type: "NUMBER", options: [], required: false }),
    })));
    expect((await screen.findAllByText("Company")).length).toBeGreaterThan(0);
  });

  it("creates and completes a task for the contact", async () => {
    renderDetails();
    await screen.findByRole("heading", { name: contact.name });
    fireEvent.click(screen.getByRole("button", { name: "Tasks" }));

    expect(await screen.findByRole("heading", { name: "No tasks yet" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New Task" }));
    fireEvent.change(screen.getByLabelText("Task title"), { target: { value: "Call customer" } });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: "Discuss renewal" } });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    expect(await screen.findByText("Call customer")).toBeInTheDocument();
    expect(screen.getByText("Discuss renewal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Complete Call customer" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining("/tasks/task-1"), expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "COMPLETED" }) })));
  });

  it("offers separate chat and uploaded document views", async () => {
    renderDetails();
    await screen.findByRole("heading", { name: contact.name });
    fireEvent.click(screen.getByRole("button", { name: "Documents" }));

    expect(screen.getByRole("button", { name: "Chat Documents" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No chat documents" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Uploaded Documents" }));
    expect(screen.getByRole("heading", { name: "No uploaded documents" })).toBeInTheDocument();
  });

  it("creates and soft-deletes notes from the two-pane notes view", async () => {
    renderDetails();
    await screen.findByRole("heading", { name: contact.name });
    fireEvent.click(screen.getByRole("button", { name: "Notes" }));

    expect((await screen.findAllByText("Hey")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "New Note" }));
    const editor = screen.getByRole("textbox", { name: "Note" });
    expect(screen.queryByRole("button", { name: "Save note" })).not.toBeInTheDocument();
    fireEvent.change(editor, { target: { value: "Discard this draft" } });
    expect(screen.getByRole("button", { name: "Save note" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Save note" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), { target: { value: "Meeting summary\nCustomer requested a callback." } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));

    expect(await screen.findByText("Meeting summary")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Edit note" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Meeting summary"));
    expect(screen.getByText(/Customer requested a callback\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit note" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), { target: { value: "Updated meeting summary\nCall tomorrow." } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect((await screen.findAllByText("Updated meeting summary")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Call tomorrow\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    expect(screen.getByRole("heading", { name: "Delete this note?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining("/notes/note-2"), expect.objectContaining({ method: "DELETE" })));
    await waitFor(() => expect(screen.queryAllByText("Updated meeting summary")).toHaveLength(0));
  });

  it("adds a tag through the backend update endpoint", async () => {
    renderDetails();
    await screen.findByRole("heading", { name: contact.name });

    fireEvent.click(screen.getByRole("button", { name: "Add Tag" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New tag" }), { target: { value: "vip" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith(`/workspaces/workspace-1/contacts/${contact.id}`, expect.objectContaining({ method: "PATCH", body: JSON.stringify({ tags: ["ctwa", "vip"] }) })));
    expect(await screen.findByText("vip")).toBeInTheDocument();
  });
});
