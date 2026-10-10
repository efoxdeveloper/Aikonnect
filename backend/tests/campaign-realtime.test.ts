import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { Response } from "express";

const { publishCampaignUpdated, streamCampaignUpdates } = await import("../src/realtime/campaign.js");

class FakeResponse extends EventEmitter {
  writableEnded = false;
  destroyed = false;
  output = "";
  status() { return this; }
  set() { return this; }
  flushHeaders() {}
  write(value: string) { this.output += value; return true; }
  flush() {}
}

test("campaign SSE updates are isolated to the subscribed workspace and campaign", () => {
  const response = new FakeResponse();
  const close = streamCampaignUpdates("workspace-a", "campaign-a", response as unknown as Response);
  assert.match(response.output, /event: campaign\.ready/);
  publishCampaignUpdated("workspace-b", "campaign-a");
  publishCampaignUpdated("workspace-a", "campaign-b");
  assert.equal((response.output.match(/event:/g) ?? []).length, 1);
  publishCampaignUpdated("workspace-a", "campaign-a");
  assert.match(response.output, /event: campaign\.updated/);
  close();
  const lengthAfterClose = response.output.length;
  publishCampaignUpdated("workspace-a", "campaign-a");
  assert.equal(response.output.length, lengthAfterClose);
});
