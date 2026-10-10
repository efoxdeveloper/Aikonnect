import assert from "node:assert/strict";
import { test } from "node:test";
import { updateAutomationSettingsSchema } from "../src/modules/automations/automation-settings.schemas.js";

test("automation settings accept a valid timezone, send window, days and retry policy", () => {
  const result = updateAutomationSettingsSchema.safeParse({ timezone: "Asia/Kolkata", sendWindowStart: "09:00", sendWindowEnd: "18:00", sendDays: [1, 2, 3, 4, 5], retryLimit: 3 });
  assert.equal(result.success, true);
});

test("automation settings reject invalid timezones, reversed windows, empty days and excessive retries", () => {
  const base = { timezone: "Asia/Kolkata", sendWindowStart: "09:00", sendWindowEnd: "18:00", sendDays: [1, 2, 3, 4, 5], retryLimit: 3 };
  assert.equal(updateAutomationSettingsSchema.safeParse({ ...base, timezone: "Mars/Olympus" }).success, false);
  assert.equal(updateAutomationSettingsSchema.safeParse({ ...base, sendWindowStart: "18:00", sendWindowEnd: "09:00" }).success, false);
  assert.equal(updateAutomationSettingsSchema.safeParse({ ...base, sendDays: [] }).success, false);
  assert.equal(updateAutomationSettingsSchema.safeParse({ ...base, retryLimit: 11 }).success, false);
});
