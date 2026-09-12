import { describe, expect, it } from "vitest";
import { navigationGroups } from "@/config/navigation";

describe("navigation structure", () => {
  it("does not show badges on Dashboard or Inbox", () => {
    const primary = navigationGroups[0];
    const dashboard = primary.items.find((item) => item.title === "Dashboard");
    const inbox = primary.items.find((item) => item.title === "Inbox");

    expect(dashboard?.badge).toBeUndefined();
    expect(inbox?.badge).toBeUndefined();
  });

  it("keeps Contacts inside Sales & CRM without a standalone Leads item", () => {
    const primary = navigationGroups[0];
    const sales = navigationGroups.find((group) => group.title === "Sales & CRM");

    expect(primary.items.some((item) => item.url === "/contacts")).toBe(false);
    expect(sales?.items.some((item) => item.title === "Contacts" && item.url === "/contacts")).toBe(true);
    expect(sales?.items.some((item) => item.title === "Leads" || item.url === "/leads")).toBe(false);
  });

  it("keeps Dashboard and Inbox as direct items without a Main parent", () => {
    expect(navigationGroups[0].title).toBeUndefined();
    expect(navigationGroups[0].items.map((item) => item.title)).toEqual(["Dashboard", "Inbox"]);
  });

  it("temporarily hides Click-to-WhatsApp Ads and the Commerce group", () => {
    const allItems = navigationGroups.flatMap((group) => group.items);

    expect(navigationGroups.some((group) => group.title === "Commerce")).toBe(false);
    expect(allItems.some((item) => item.title === "Click-to-WhatsApp Ads")).toBe(false);
    expect(allItems.some((item) => item.url === "/click-to-whatsapp-ads")).toBe(false);
  });
});
