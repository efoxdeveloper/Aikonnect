import assert from "node:assert/strict";
import { test } from "node:test";

Object.assign(process.env, {
  DOTENV_CONFIG_PATH: "tests/nonexistent-unit-test.env",
  NODE_ENV: "test",
  APP_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  ACCESS_TOKEN_SECRET: "unit-test-only-access-token-secret-000000",
  LOG_LEVEL: "silent",
});

const { prisma } = await import("../src/database/prisma.js");
const { authenticateDeveloperApiKey, requireDeveloperScope } = await import("../src/middleware/developer-api-key.js");
const { publicTextMessageSchema, requestIdempotencyKey, sendMessageSchema } = await import("../src/modules/developer-api/developer-api.schemas.js");

test("developer send schema accepts a template request and rejects malformed recipients", () => {
  const parsed = sendMessageSchema.parse({ to: "919876543210", templateKey: "order-update", parameters: ["123"] });
  assert.equal(parsed.to, "919876543210");
  assert.equal(parsed.pricingType, "REGULAR");
  assert.deepEqual(parsed.parameters, ["123"]);
  assert.equal(sendMessageSchema.safeParse({ to: "not-a-phone", templateKey: "order-update" }).success, false);
});

test("developer API requires an Idempotency-Key header", () => {
  assert.equal(requestIdempotencyKey("message-123"), "message-123");
  assert.throws(() => requestIdempotencyKey(undefined), (error: any) => error.code === "IDEMPOTENCY_KEY_REQUIRED");
});

test("Interakt-compatible public message schema accepts the simple text payload", () => {
  const parsed = publicTextMessageSchema.parse({ userId: "customer-123", fullPhoneNumber: "+919876543210", callbackData: "order-123", type: "Text", data: { message: "Hello from Marento" } });
  assert.equal(parsed.type, "Text");
  assert.equal(parsed.data.message, "Hello from Marento");
  assert.equal(publicTextMessageSchema.safeParse({ fullPhoneNumber: "+919876543210", type: "Text", data: { message: "Hello" } }).success, false);
  assert.equal(publicTextMessageSchema.safeParse({ fullPhoneNumber: "+919876543210", type: "Image", data: { message: "Hello" } }).success, false);
  assert.equal(publicTextMessageSchema.safeParse({ fullPhoneNumber: "+919876543210", type: "Text", data: { message: "" } }).success, false);
});

test("developer API key authentication enforces validity and scopes", async () => {
  const secret = "sk_live_unit_test_key_123456789";
  const original = (prisma as any).publicApiKey.findUnique;
  (prisma as any).publicApiKey.findUnique = async () => ({ id: "key-1", workspaceId: "workspace-1", scopes: ["messages.send"], revokedAt: null, expiresAt: null });
  const request: any = { headers: { "x-api-key": secret } };
  let authError: unknown;
  await authenticateDeveloperApiKey(request, {}, (error?: unknown) => { authError = error; });
  assert.equal(authError, undefined);
  assert.deepEqual(request.developerApiKey, { id: "key-1", workspaceId: "workspace-1", scopes: ["messages.send"] });

  let scopeError: any;
  await new Promise<void>((resolve) => requireDeveloperScope("messages.send")(request, {}, (error?: unknown) => { scopeError = error; resolve(); }));
  assert.equal(scopeError, undefined);

  let missingScopeError: any;
  await new Promise<void>((resolve) => requireDeveloperScope("contacts.write")({ developerApiKey: request.developerApiKey } as any, {}, (error?: unknown) => { missingScopeError = error; resolve(); }));
  assert.equal(missingScopeError.code, "API_KEY_SCOPE_REQUIRED");

  (prisma as any).publicApiKey.findUnique = original;
});

test("developer API accepts the raw Basic API-key format used by integrations", async () => {
  const secret = "sk_live_unit_test_basic_key_123456789";
  const original = (prisma as any).publicApiKey.findUnique;
  (prisma as any).publicApiKey.findUnique = async () => ({ id: "key-basic", workspaceId: "workspace-basic", scopes: ["messages.send"], revokedAt: null, expiresAt: null });
  const request: any = { headers: { authorization: `Basic ${secret}` } };
  let authError: unknown;
  await authenticateDeveloperApiKey(request, {}, (error?: unknown) => { authError = error; });
  assert.equal(authError, undefined);
  assert.equal(request.developerApiKey.workspaceId, "workspace-basic");
  (prisma as any).publicApiKey.findUnique = original;
});
