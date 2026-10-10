import { describe, expect, it } from "vitest";
import { parseCampaignEventFrame } from "./campaign-events";

describe("campaign SSE event parsing", () => {
  it("recognizes campaign updates and ignores ready events and heartbeats", () => {
    expect(parseCampaignEventFrame("event: campaign.updated\r\ndata: {\"campaignId\":\"c-1\"}\r\n\r\n")).toBe(true);
    expect(parseCampaignEventFrame("event: campaign.ready\ndata: {}\n\n")).toBe(false);
    expect(parseCampaignEventFrame(": keep-alive\n\n")).toBe(false);
  });
});
