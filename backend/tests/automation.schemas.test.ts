import assert from "node:assert/strict";
import { test } from "node:test";
import { createAutomationSchema } from "../src/modules/automations/automation.schemas.js";

test("automation schema accepts a simple trigger, condition and ordered actions", () => {
  const result = createAutomationSchema.safeParse({
    name: "Demo Lead Automation",
    description: "Handle demo requests",
    trigger: { type: "MESSAGE_RECEIVED", config: {} },
    conditions: [{ id: "condition-1", field: "message.text", operator: "contains", value: "demo", connector: "AND" }],
    actions: [{ id: "action-1", type: "SEND_MESSAGE", order: 1, config: { message: "Hi {{contact.name}}" } }],
  });
  assert.equal(result.success, true);
});

test("automation schema rejects unknown triggers and malformed action ordering", () => {
  const result = createAutomationSchema.safeParse({
    name: "Invalid automation",
    trigger: { type: "NOT_A_TRIGGER", config: {} },
    actions: [{ id: "action-1", type: "SEND_MESSAGE", order: 0, config: {} }],
  });
  assert.equal(result.success, false);
});
