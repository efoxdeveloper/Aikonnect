import assert from "node:assert/strict";
import { test } from "node:test";
import { assignmentRuleInputSchema, reorderAssignmentRulesSchema } from "../src/modules/assignment-rules/assignment-rule.schemas.js";

const memberA = "00000000-0000-4000-8000-000000000001";
const memberB = "00000000-0000-4000-8000-000000000002";

test("assignment rule input accepts direct and round-robin routing", () => {
  assert.equal(assignmentRuleInputSchema.parse({ name: "VIP chats", strategy: "AGENT", memberIds: [memberA] }).enabled, true);
  assert.deepEqual(assignmentRuleInputSchema.parse({ name: "Sales rotation", strategy: "ROUND_ROBIN", memberIds: [memberA, memberB] }).memberIds, [memberA, memberB]);
});

test("assignment rule input rejects empty, duplicate, and invalid direct-agent targets", () => {
  for (const input of [
    { name: " ", strategy: "AGENT", memberIds: [memberA] },
    { name: "Invalid", strategy: "AGENT", memberIds: [memberA, memberB] },
    { name: "Duplicate", strategy: "ROUND_ROBIN", memberIds: [memberA, memberA] },
    { name: "No agents", strategy: "ROUND_ROBIN", memberIds: [] },
  ]) assert.equal(assignmentRuleInputSchema.safeParse(input).success, false);
});

test("rule reordering accepts a bounded UUID list", () => {
  assert.deepEqual(reorderAssignmentRulesSchema.parse({ ruleIds: [memberA, memberB] }).ruleIds, [memberA, memberB]);
  assert.equal(reorderAssignmentRulesSchema.safeParse({ ruleIds: ["bad-id"] }).success, false);
});
