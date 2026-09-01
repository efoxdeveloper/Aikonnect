import assert from "node:assert/strict";
import { test } from "node:test";
import {
  nextWorkflowStep,
  resolveQuestionAnswer,
  resolveQuestionRoute,
} from "../src/modules/workflows/workflow.executor.js";

test("workflow question routes the first option to the YES branch", () => {
  assert.equal(resolveQuestionAnswer("Yes", ["Yes", "No"]), "YES");
  assert.equal(resolveQuestionAnswer("1", ["Yes", "No"]), "YES");
});

test("workflow question routes the second option to the NO branch and ignores unknown answers", () => {
  assert.equal(resolveQuestionAnswer("No", ["Yes", "No"]), "NO");
  assert.equal(resolveQuestionAnswer("2", ["Yes", "No"]), "NO");
  assert.equal(resolveQuestionAnswer("Maybe", ["Yes", "No"]), null);
});

test("free-text questions continue to the next connected chatbot node", () => {
  assert.equal(resolveQuestionRoute("Pawan", "TEXT", []), "NEXT");
  assert.equal(resolveQuestionRoute("", "TEXT", []), null);
  assert.equal(
    nextWorkflowStep(
      [
        {
          id: "edge-name-email",
          source: "question-name",
          target: "question-email",
          condition: "NEXT",
        },
      ],
      "question-name",
      "NEXT",
    ),
    "question-email",
  );
});

test("list questions can route more than Yes and No branches", () => {
  assert.equal(
    resolveQuestionRoute("Enterprise", "LIST", [
      "Starter",
      "Enterprise",
      "Agency",
    ]),
    "OPTION_1",
  );
  assert.equal(
    resolveQuestionRoute("3", "LIST", ["Starter", "Enterprise", "Agency"]),
    "OPTION_2",
  );
});
