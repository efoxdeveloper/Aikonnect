import assert from "node:assert/strict";
import { test } from "node:test";
import { assignConversationSchema, createConversationNoteSchema, inboxConversationListQuerySchema, updateConversationStatusSchema } from "../src/modules/conversations/conversation.schemas.js";

test("inbox conversation query accepts agent and unassigned filters and rejects malformed member ids", () => {
  assert.equal(inboxConversationListQuerySchema.parse({ assigneeMembershipId: "unassigned" }).assigneeMembershipId, "unassigned");
  assert.equal(inboxConversationListQuerySchema.parse({ assigneeMembershipId: "11111111-1111-4111-8111-111111111111" }).assigneeMembershipId, "11111111-1111-4111-8111-111111111111");
  assert.equal(inboxConversationListQuerySchema.safeParse({ assigneeMembershipId: "not-a-member" }).success, false);
});

test("conversation assignment accepts an active-member id or explicit unassignment", () => {
  assert.deepEqual(assignConversationSchema.parse({ assigneeMembershipId: "11111111-1111-4111-8111-111111111111" }), { assigneeMembershipId: "11111111-1111-4111-8111-111111111111" });
  assert.deepEqual(assignConversationSchema.parse({ assigneeMembershipId: null }), { assigneeMembershipId: null });
  assert.equal(assignConversationSchema.safeParse({ assigneeMembershipId: "not-a-member" }).success, false);
});

test("conversation status accepts only supported lifecycle states", () => {
  assert.equal(updateConversationStatusSchema.parse({ status: "RESOLVED" }).status, "RESOLVED");
  assert.equal(updateConversationStatusSchema.safeParse({ status: "ARCHIVED" }).success, false);
});

test("internal notes require trimmed non-empty content and enforce the content limit", () => {
  assert.deepEqual(createConversationNoteSchema.parse({ content: "  Follow up tomorrow  " }), { content: "Follow up tomorrow" });
  assert.equal(createConversationNoteSchema.safeParse({ content: "   " }).success, false);
  assert.equal(createConversationNoteSchema.safeParse({ content: "x".repeat(5001) }).success, false);
});
