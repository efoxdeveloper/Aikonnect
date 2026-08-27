import assert from "node:assert/strict";
import test from "node:test";
import { toSlug } from "../src/utils/slug.js";

test("workspace and role names are normalized into stable slugs", () => {
  assert.equal(toSlug("  Éfox WhatsApp — Sales Team!  "), "efox-whatsapp-sales-team");
});

test("slug generation strips unsupported characters and repeated separators", () => {
  assert.equal(toSlug("Finance___&&&& Operations"), "finance-operations");
  assert.equal(toSlug("---"), "");
});
