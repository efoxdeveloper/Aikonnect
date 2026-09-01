import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCondition } from "../src/modules/automations/automation.executor.js";

const context = {
  contact: {
    id: "contact-1", name: "Rahul Sharma", phoneE164: "+919876543210", email: "rahul@example.com",
    customAttributes: { plan: "pro" }, tagAssignments: [{ tag: { name: "New Lead" } }],
  },
  conversation: { id: "conversation-1", status: "OPEN" },
  message: { text: "I want a demo", type: "TEXT" },
};

test("automation conditions evaluate message and contact fields", () => {
  assert.equal(evaluateCondition({ id: "one", field: "message.text", operator: "contains", value: "demo", connector: "AND" }, context), true);
  assert.equal(evaluateCondition({ id: "two", field: "contact.tags", operator: "is", value: "New Lead", connector: "AND" }, context), true);
  assert.equal(evaluateCondition({ id: "custom", field: "contact.custom.plan", operator: "equals", value: "pro", connector: "AND" }, context), true);
  assert.equal(evaluateCondition({ id: "three", field: "conversation.status", operator: "is_not", value: "CLOSED", connector: "AND" }, context), true);
});

test("empty and numeric condition operators remain deterministic", () => {
  assert.equal(evaluateCondition({ id: "one", field: "contact.email", operator: "is_not_empty", connector: "AND" }, context), true);
  assert.equal(evaluateCondition({ id: "two", field: "message.text", operator: "greater_than", value: 10, connector: "AND" }, context), false);
});
