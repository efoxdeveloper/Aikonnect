import assert from "node:assert/strict";
import { test } from "node:test";
import { createSequenceSchema, enrollSequenceSchema } from "../src/modules/sequences/sequence.schemas.js";

test("sequence schema accepts ordered approved-template message steps", () => {
  const result = createSequenceSchema.safeParse({ name: "New lead follow-up", steps: [{ id: "step-1", delayMinutes: 0, templateKey: "welcome", templateVariables: [{ source: "contact", field: "name", fallback: "there" }] }] });
  assert.equal(result.success, true);
});

test("sequence schema rejects missing templates, invalid delays and empty step lists", () => {
  const base = { name: "Invalid", steps: [{ id: "step-1", delayMinutes: 0, templateKey: "welcome", templateVariables: [] }] };
  assert.equal(createSequenceSchema.safeParse({ ...base, steps: [] }).success, false);
  assert.equal(createSequenceSchema.safeParse({ ...base, steps: [{ ...base.steps[0], templateKey: "" }] }).success, false);
  assert.equal(createSequenceSchema.safeParse({ ...base, steps: [{ ...base.steps[0], delayMinutes: -1 }] }).success, false);
});

test("sequence enrollment accepts unique contact IDs", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const result = enrollSequenceSchema.parse({ contactIds: [id, id] });
  assert.deepEqual(result.contactIds, [id]);
});
