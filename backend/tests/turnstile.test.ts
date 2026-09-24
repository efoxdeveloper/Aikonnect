import assert from "node:assert/strict";
import { test } from "node:test";
import { env } from "../src/config/env.js";
import { AppError } from "../src/middleware/error-handler.js";
import { verifyTurnstileToken } from "../src/services/turnstile.service.js";

test("validates the Turnstile token through Cloudflare Siteverify", async () => {
  const originalFetch = globalThis.fetch;
  const originalSecret = env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
  let requestBody: Record<string, string> | undefined;
  env.CLOUDFLARE_TURNSTILE_SECRET_KEY = "test-secret";
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, string>;
    return new Response(JSON.stringify({ success: true, hostname: new URL(env.APP_URL).hostname, action: "signup" }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    await verifyTurnstileToken("turnstile-token", "127.0.0.1");
    assert.deepEqual(requestBody, { secret: "test-secret", response: "turnstile-token", remoteip: "127.0.0.1" });

    globalThis.fetch = (async () => new Response(JSON.stringify({ success: false, "error-codes": ["timeout-or-duplicate"] }), { status: 200 })) as typeof fetch;
    await assert.rejects(
      () => verifyTurnstileToken("replayed-token"),
      (error: unknown) => error instanceof AppError && error.code === "CAPTCHA_INVALID" && error.statusCode === 422,
    );
  } finally {
    globalThis.fetch = originalFetch;
    env.CLOUDFLARE_TURNSTILE_SECRET_KEY = originalSecret;
  }
});
