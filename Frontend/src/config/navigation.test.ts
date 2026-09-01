import { describe, expect, it } from "vitest";
import { navigationGroups } from "@/config/navigation";

describe("navigation structure", () => {
  it("keeps Contacts inside Sales & CRM without a standalone Leads item", () => {
    const main = navigationGroups.find((group) => group.title === "Main");
    const sales = navigationGroups.find((group) => group.title === "Sales & CRM");

    expect(main?.items.some((item) => item.url === "/contacts")).toBe(false);
    expect(sales?.items.some((item) => item.title === "Contacts" && item.url === "/contacts")).toBe(true);
    expect(sales?.items.some((item) => item.title === "Leads" || item.url === "/leads")).toBe(false);
  });
});
