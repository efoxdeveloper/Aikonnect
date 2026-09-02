import { describe, expect, it } from "vitest";
import { navigationGroups } from "@/config/navigation";

describe("navigation structure", () => {
  it("does not show badges on Dashboard or Inbox", () => {
    const main = navigationGroups.find((group) => group.title === "Main");
    const dashboard = main?.items.find((item) => item.title === "Dashboard");
    const inbox = main?.items.find((item) => item.title === "Inbox");

    expect(dashboard?.badge).toBeUndefined();
    expect(inbox?.badge).toBeUndefined();
  });

  it("keeps Contacts inside Sales & CRM without a standalone Leads item", () => {
    const main = navigationGroups.find((group) => group.title === "Main");
    const sales = navigationGroups.find((group) => group.title === "Sales & CRM");

    expect(main?.items.some((item) => item.url === "/contacts")).toBe(false);
    expect(sales?.items.some((item) => item.title === "Contacts" && item.url === "/contacts")).toBe(true);
    expect(sales?.items.some((item) => item.title === "Leads" || item.url === "/leads")).toBe(false);
  });
});
