import { describe, expect, it } from "vitest";
import { isNavigationItemActive, navigationGroups } from "@/config/navigation";

describe("navigation structure", () => {
  it("does not define static badges on Dashboard or Inbox", () => {
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

  it("puts Automation, Workflows, and Sequences in the Marketing secondary navigation", () => {
    const marketing = navigationGroups.find((group) => group.title === "Marketing");

    expect(marketing?.items.filter((item) => ["/automations", "/workflows", "/sequences"].includes(item.url ?? "")).map((item) => item.title)).toEqual(["Automation", "Workflows", "Sequences"]);
  });

  it("temporarily hides Click-to-WhatsApp Ads and the Commerce group", () => {
    const allItems = navigationGroups.flatMap((group) => group.items);

    expect(navigationGroups.some((group) => group.title === "Commerce")).toBe(false);
    expect(allItems.some((item) => item.title === "Click-to-WhatsApp Ads")).toBe(false);
    expect(allItems.some((item) => item.url === "/click-to-whatsapp-ads")).toBe(false);
  });

  it("hides Webhook Events from the Developer sidebar", () => {
    const developer = navigationGroups.find((group) => group.title === "Developer");

    expect(developer?.items.some((item) => item.title === "Webhook Events" || item.url === "/webhook-events")).toBe(false);
  });

  it("uses a link icon for Integrations in the Developer sidebar", () => {
    const developer = navigationGroups.find((group) => group.title === "Developer");
    const integrations = developer?.items.find((item) => item.url === "/integrations");

    expect(integrations?.icon.displayName).toBe("LinkIcon");
  });

  it("puts billing destinations in Settings and marks only the matching page active", () => {
    const settings = navigationGroups.find((group) => group.title === "Settings");
    const billingItems = settings?.items.filter((item) => item.url?.startsWith("/billing")) ?? [];

    expect(billingItems.map((item) => item.title)).toEqual(["Usage & wallet", "Subscriptions", "Plans & pricing"]);
    expect(billingItems.map((item) => isNavigationItemActive(item, "/billing/subscriptions"))).toEqual([false, true, false]);
  });

  it("places Assignment Rules in Settings and limits the item to inbox assignment managers", () => {
    const settings = navigationGroups.find((group) => group.title === "Settings");
    const assignmentRules = settings?.items.find((item) => item.url === "/assignment-rules");
    expect(assignmentRules?.title).toBe("Assignment Rules");
    expect(assignmentRules?.requiredPermission).toBe("conversations.assign");
    expect(isNavigationItemActive(assignmentRules!, "/assignment-rules")).toBe(true);
  });
});
