import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createWorkflowSchema,
  workflowGraphError,
} from "../src/modules/workflows/workflow.schemas.js";

test("workflow schema accepts an entry trigger and ordered steps", () => {
  const result = createWorkflowSchema.safeParse({
    name: "New lead nurture",
    trigger: { type: "CONTACT_CREATED", config: {} },
    conditions: [],
    steps: [
      {
        id: "step-1",
        type: "SEND_MESSAGE",
        order: 1,
        config: { message: "Welcome {{contact.name}}" },
      },
      {
        id: "step-2",
        type: "WAIT",
        order: 2,
        config: { amount: 2, unit: "days" },
      },
    ],
  });
  assert.equal(result.success, true);
});

test("workflow schema accepts a question with separate branch actions and edges", () => {
  const result = createWorkflowSchema.safeParse({
    name: "Demo qualification",
    trigger: { type: "MESSAGE_RECEIVED", config: {} },
    steps: [
      {
        id: "question-1",
        type: "ASK_QUESTION",
        branch: "MAIN",
        order: 1,
        config: {
          question: "Would you like a demo?",
          options: ["Yes", "No"],
          variable: "answer",
        },
      },
      {
        id: "yes-1",
        type: "SEND_MESSAGE",
        branch: "YES",
        order: 2,
        config: { message: "Great, our team will contact you." },
      },
      {
        id: "no-1",
        type: "SEND_MESSAGE",
        branch: "NO",
        order: 3,
        config: { message: "No problem, thanks for letting us know." },
      },
    ],
    edges: [
      {
        id: "edge-yes",
        source: "question-1",
        target: "yes-1",
        condition: "YES",
      },
      { id: "edge-no", source: "question-1", target: "no-1", condition: "NO" },
    ],
  });
  assert.equal(result.success, true);
});

test("workflow schema rejects recursive workflow steps", () => {
  const result = createWorkflowSchema.safeParse({
    name: "Recursive workflow",
    trigger: { type: "CONTACT_CREATED", config: {} },
    steps: [{ id: "step-1", type: "START_WORKFLOW", order: 1, config: {} }],
  });
  assert.equal(result.success, false);
});

test("workflow schema accepts positioned multi-question chatbot graphs", () => {
  const result = createWorkflowSchema.safeParse({
    name: "Lead qualification chatbot",
    trigger: { type: "MESSAGE_RECEIVED", config: {} },
    steps: [
      {
        id: "question-name",
        type: "ASK_QUESTION",
        order: 1,
        position: { x: 320, y: 120 },
        config: {
          mode: "TEXT",
          question: "What is your name?",
          options: [],
          variable: "name",
        },
      },
      {
        id: "question-email",
        type: "ASK_QUESTION",
        order: 2,
        position: { x: 680, y: 120 },
        config: {
          mode: "TEXT",
          question: "What is your email?",
          options: [],
          variable: "email",
        },
      },
    ],
    edges: [
      {
        id: "edge-start",
        source: "trigger",
        target: "question-name",
        condition: "NEXT",
      },
      {
        id: "edge-name-email",
        source: "question-name",
        target: "question-email",
        condition: "NEXT",
      },
    ],
  });
  assert.equal(result.success, true);
  assert.equal(
    result.success ? workflowGraphError(result.data) : "invalid",
    null,
  );
});

test("workflow graph validation rejects cycles and disconnected nodes", () => {
  const result = createWorkflowSchema.parse({
    name: "Invalid graph",
    trigger: { type: "MESSAGE_RECEIVED", config: {} },
    steps: [
      { id: "one", type: "SEND_MESSAGE", order: 1, config: { message: "One" } },
      { id: "two", type: "SEND_MESSAGE", order: 2, config: { message: "Two" } },
    ],
    edges: [
      { id: "start", source: "trigger", target: "one", condition: "NEXT" },
      { id: "one-two", source: "one", target: "two", condition: "NEXT" },
      { id: "two-one", source: "two", target: "one", condition: "NEXT" },
    ],
  });
  assert.match(workflowGraphError(result) ?? "", /incoming connection|cycle/i);
  assert.match(
    workflowGraphError({
      ...result,
      edges: result.edges.slice(0, 1),
    }) ?? "",
    /connect every chatbot node/i,
  );
});
