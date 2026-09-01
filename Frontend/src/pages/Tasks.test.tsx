import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Tasks } from "@/pages/Tasks";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";

vi.mock("@/lib/api", () => ({ apiRequest: vi.fn() }));

const auth: AuthContextValue = {
  status: "authenticated", user: { id: "user-1", email: "owner@example.com", firstName: "Pawan", lastName: "Owner", emailVerifiedAt: null, memberships: [{ id: "membership-1", workspace: { id: "workspace-1", name: "Acme", slug: "acme", country: "India", timezone: "Asia/Kolkata", onboardingCompletedAt: null }, role: { id: "role-1", name: "Owner", slug: "owner", permissions: ["contacts.read", "contacts.update"] } }] }, accessToken: "access-token", login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(), changeEmail: vi.fn(), refreshUser: vi.fn(), logout: vi.fn(),
};

const task = { id: "task-1", title: "Follow up on pricing", description: "Send the proposal", dueAt: "2099-09-10T10:00:00.000Z", status: "OPEN", createdAt: "2026-08-30T10:00:00.000Z", completedAt: null, contact: { id: "contact-1", name: "Mohit", phone: "+918477892115" }, createdBy: { id: "user-1", firstName: "Pawan", lastName: "Owner", email: "owner@example.com" } } as const;
const taskResponse = { items: [task], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1, hasNext: false, hasPrevious: false } };
const contactResponse = { items: [{ id: "contact-1", name: "Mohit", phone: "+918477892115" }], pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1, hasNext: false, hasPrevious: false } };

describe("Tasks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the task table and keeps completion available", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(taskResponse).mockResolvedValueOnce(contactResponse);

    render(<AuthContext.Provider value={auth}><MemoryRouter><Tasks /></MemoryRouter></AuthContext.Provider>);

    expect(await screen.findByRole("heading", { name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByText("Follow up on pricing")).toBeInTheDocument();
    expect(screen.getByText("Mohit")).toBeInTheDocument();
    expect(screen.getByTestId("tasks-table-scroll-region")).toHaveClass("min-h-0", "overflow-auto");
    expect(screen.getByRole("button", { name: "Complete Follow up on pricing" })).toBeEnabled();
  });

  it("requires a title and contact before creating a task", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ items: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 1, hasNext: false, hasPrevious: false } }).mockResolvedValueOnce(contactResponse).mockResolvedValue({});

    render(<AuthContext.Provider value={auth}><MemoryRouter><Tasks /></MemoryRouter></AuthContext.Provider>);
    fireEvent.click(await screen.findByRole("button", { name: "Add Task" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close drawer" })).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Create task" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Task title/), { target: { value: "Call Mohit" } });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("combobox", { name: "Contact" }));
    fireEvent.click(await screen.findByRole("option", { name: /Mohit/ }));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(vi.mocked(apiRequest).mock.calls.some(([path, options]) => String(path).endsWith("/contacts/contact-1/tasks") && options?.method === "POST")).toBe(true));
  });
});
