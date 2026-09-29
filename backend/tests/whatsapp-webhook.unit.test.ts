import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  DOTENV_CONFIG_PATH: "tests/nonexistent-unit-test.env",
  NODE_ENV: "test",
  APP_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  ACCESS_TOKEN_SECRET: "unit-test-only-access-token-secret-000000",
  META_APP_SECRET: "test-app-secret",
  META_TOKEN_ENCRYPTION_KEY: "test-token-encryption-key-for-tests-32chars",
  META_WEBHOOK_VERIFY_TOKEN: "test-verify-token",
  LOG_LEVEL: "silent",
});

const { formatWhatsAppFailureReason } = await import("../src/modules/whatsapp/webhook.routes.js");

test("preserves Meta failure codes and delivery details", () => {
  const reason = formatWhatsAppFailureReason({
    id: "wamid-test",
    status: "failed",
    errors: [{ code: 131026, title: "Message undeliverable", error_data: { details: "Recipient is not reachable" }, fbtrace_id: "trace-test" }],
  });

  assert.equal(reason, "Meta error 131026: Message undeliverable: Recipient is not reachable: fbtrace_id=trace-test");
});

test("returns no failure reason when Meta sends a non-failed status", () => {
  assert.equal(formatWhatsAppFailureReason({ id: "wamid-test", status: "delivered" }), undefined);
});
