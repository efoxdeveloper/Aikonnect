import assert from "node:assert/strict";
import { test } from "node:test";
import { adminAuditQuerySchema, adminListQuerySchema, adminWalletAdjustmentSchema } from "../src/modules/admin/admin.schemas.js";

test("admin list query applies safe pagination defaults", () => {
  assert.deepEqual(adminListQuerySchema.parse({}), { page: 1, pageSize: 25 });
  assert.deepEqual(adminListQuerySchema.parse({ search: " Lotus ", page: "2", pageSize: "50" }), { search: "Lotus", page: 2, pageSize: 50 });
});

test("admin audit query rejects oversized pages and preserves filters", () => {
  assert.equal(adminAuditQuerySchema.safeParse({ pageSize: "101" }).success, false);
  assert.deepEqual(adminAuditQuerySchema.parse({ resourceType: "platform_admin", action: "GET" }), { page: 1, pageSize: 25, resourceType: "platform_admin", action: "GET" });
});

test("manual wallet adjustments require a positive minor-unit amount and preserve idempotency", () => {
  const parsed = adminWalletAdjustmentSchema.parse({ tenantId: "00000000-0000-4000-8000-000000000001", direction: "CREDIT", amountMinorUnits: "12500", idempotencyKey: "manual-entry-1", reason: "PROMOTIONAL_CREDIT" });
  assert.equal(parsed.amountMinorUnits, 12500n);
  assert.equal(parsed.direction, "CREDIT");
  assert.equal(adminWalletAdjustmentSchema.safeParse({ tenantId: "00000000-0000-4000-8000-000000000001", direction: "DEBIT", amountMinorUnits: "0", idempotencyKey: "manual-entry-1", reason: "ADJUSTMENT" }).success, false);
});
