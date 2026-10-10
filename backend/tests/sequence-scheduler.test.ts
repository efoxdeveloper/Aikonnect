import assert from "node:assert/strict";
import { test } from "node:test";
import { campaignStepTime } from "../src/modules/sequences/sequence-scheduler.js";

test("sequence scheduler selects the next allowed weekday send time", () => {
  const from = new Date("2026-10-09T19:00:00.000Z"); // Friday after the UTC send window.
  const result = campaignStepTime(from, { timezone: "UTC", sendWindowStart: "09:00", sendWindowEnd: "18:00", sendDays: [1, 2, 3, 4, 5] });
  assert.equal(result.toISOString(), "2026-10-12T09:00:00.000Z");
});

test("sequence scheduler respects the workspace timezone and weekend settings", () => {
  const from = new Date("2026-10-10T18:00:00.000Z");
  const result = campaignStepTime(from, { timezone: "Asia/Kolkata", sendWindowStart: "09:00", sendWindowEnd: "18:00", sendDays: [0] });
  assert.equal(result.toISOString(), "2026-10-11T03:30:00.000Z");
});
