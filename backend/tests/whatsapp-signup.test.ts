import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

// Never load production configuration or connect to a real database in these tests.
Object.assign(process.env, {
  DOTENV_CONFIG_PATH: "tests/nonexistent-unit-test.env",
  NODE_ENV: "test",
  APP_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  ACCESS_TOKEN_SECRET: "unit-test-only-access-token-secret-000000",
  META_APP_ID: "test-app",
  META_APP_SECRET: "test-app-secret",
  META_TOKEN_ENCRYPTION_KEY: "test-token-encryption-key-for-tests-32chars",
  META_GRAPH_API_VERSION: "v25.0",
  LOG_LEVEL: "silent",
});
const { completeEmbeddedSignup } = await import("../src/modules/whatsapp/whatsapp.service.js");
const { prisma } = await import("../src/database/prisma.js");
const { AppError } = await import("../src/middleware/error-handler.js");
const { embeddedSignupSchema } = await import("../src/modules/whatsapp/whatsapp.schemas.js");
const { requireWorkspacePermission } = await import("../src/middleware/workspace-access.js");
const { PERMISSIONS } = await import("../src/modules/workspaces/permissions.js");

const signup = { code: "test-code", wabaId: "test-waba", phoneNumberId: "test-phone" };
const supportedFields = ["id", "display_phone_number", "verified_name", "quality_rating", "is_on_biz_app", "platform_type"];
const phone = { id: "test-phone", display_phone_number: "+15555550100", verified_name: "Test Business", quality_rating: "GREEN", is_on_biz_app: true, platform_type: "CLOUD_API" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

// Prisma delegates expose methods through a Proxy, not property descriptors;
// node:test's mock.method cannot discover them. Restore each replacement after use.
function stubDelegate(t: TestContext, target: any, method: string, implementation: (...args: any[]) => any) {
  const original = target[method];
  target[method] = implementation;
  t.after(() => { target[method] = original; });
}

function fixture(t: TestContext, options: {
  phone?: Record<string, unknown>;
  list?: unknown;
  subscription?: unknown;
  subscriptionFails?: boolean;
  phoneFails?: boolean;
  syncFails?: boolean;
  missingSyncId?: boolean;
} = {}) {
  const steps: string[] = [];
  const accountWrites: Record<string, any>[] = [];
  const phoneWrites: Record<string, any>[] = [];
  const warnings: string[] = [];
  stubDelegate(t, prisma, "$transaction", async (callback: (transaction: typeof prisma) => Promise<unknown>) => {
    steps.push("persist");
    return callback(prisma);
  });
  stubDelegate(t, prisma.whatsAppBusinessAccount, "upsert", async (args: Record<string, any>) => {
    accountWrites.push(args);
    return { id: "account-id", metaWabaId: signup.wabaId, status: "CONNECTED" };
  });
  stubDelegate(t, prisma.whatsAppPhoneNumber, "upsert", async (args: Record<string, any>) => {
    phoneWrites.push(args);
    return { id: "phone-id", metaPhoneNumberId: phone.id, status: "ACTIVE" };
  });
  stubDelegate(t, prisma.workspaceSetupProgress, "upsert", async () => ({}));
  stubDelegate(t, prisma.whatsAppBusinessAccount, "update", async (args: Record<string, any>) => {
    warnings.push(args.data.lastError);
    return {};
  });
  t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://graph.facebook.com");
    assert.ok(url.pathname.startsWith("/v25.0/"));
    if (url.pathname.endsWith("/oauth/access_token")) {
      steps.push("exchange");
      assert.equal(url.searchParams.get("code"), signup.code);
      return json({ access_token: "test-business-token" });
    }
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-business-token");
    if (url.pathname === "/v25.0/test-waba") return json({ id: signup.wabaId, name: "Test Business" });
    if (url.pathname.endsWith("/test-phone") || url.pathname.endsWith("/phone_numbers")) {
      steps.push("phone");
      // Model Meta's real contract: an unsupported field rejects the entire lookup.
      const fields = (url.searchParams.get("fields") ?? "").split(",");
      if (fields.some((field) => !supportedFields.includes(field)) || options.phoneFails) {
        return json({ error: { message: "(#100) Tried accessing nonexisting field (messaging_limit)", code: 100 } }, 400);
      }
      assert.deepEqual(fields, supportedFields);
      return json(url.pathname.endsWith("/phone_numbers") ? { data: options.list ?? [options.phone ?? phone] } : options.phone ?? phone);
    }
    assert.equal(init?.method, "POST");
    if (url.pathname.endsWith("/subscribed_apps")) {
      assert.ok(steps.includes("persist"), "webhooks must be able to resolve the saved account");
      steps.push("subscribe-start");
      // Expose races: sync must wait until this promise resolves.
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (options.subscriptionFails) return json({ error: { message: "Webhook permission denied", code: 200 } }, 403);
      steps.push("subscribed");
      return json(options.subscription ?? { success: true });
    }
    if (url.pathname.endsWith("/smb_app_data")) {
      assert.ok(steps.includes("subscribed"), "must await subscription before one-time sync");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.messaging_product, "whatsapp");
      assert.ok(["smb_app_state_sync", "history"].includes(body.sync_type));
      steps.push(body.sync_type);
      if (options.syncFails && body.sync_type === "smb_app_state_sync") return json({ error: { message: "Contacts sync unavailable", code: 100 } }, 400);
      return json(options.missingSyncId ? {} : { request_id: `request-${body.sync_type}` });
    }
    assert.fail(`Unexpected request: ${url.pathname}`);
  });
  return { steps, accountWrites, phoneWrites, warnings };
}

for (const omitPhoneId of [false, true]) {
  test(`signup uses supported fields and ordered sync (${omitPhoneId ? "WABA discovery" : "explicit phone"})`, async (t) => {
    const state = fixture(t);
    const result = await completeEmbeddedSignup("workspace-id", { ...signup, phoneNumberId: omitPhoneId ? undefined : phone.id });
    assert.equal(result.coexistence, true);
    assert.deepEqual(result.syncWarnings, []);
    assert.deepEqual(result.syncRequestIds, ["request-smb_app_state_sync", "request-history"]);
    assert.deepEqual(state.steps, ["exchange", "phone", "persist", "subscribe-start", "subscribed", "smb_app_state_sync", "history"]);
    assert.equal(state.accountWrites[0]?.create.workspaceId, "workspace-id");
    assert.notEqual(state.accountWrites[0]?.create.encryptedAccessToken, "test-business-token");
    // Limits are not supplied by this resource; do not invent or overwrite them.
    assert.equal("messagingLimit" in state.phoneWrites[0]!.create, false);
    assert.equal("messagingLimit" in state.phoneWrites[0]!.update, false);
  });
}

test("provider field rejection preserves its reason and stage instead of a generic 500", async (t) => {
  const state = fixture(t, { phoneFails: true });
  await assert.rejects(completeEmbeddedSignup("workspace-id", signup), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 502);
    assert.equal(error.code, "META_API_ERROR");
    assert.match(error.message, /loading the WhatsApp phone number:.*nonexisting field/);
    assert.equal((error.details as { providerCode: number }).providerCode, 100);
    return true;
  });
  assert.equal(state.accountWrites.length, 0);
  assert.equal(state.steps.filter((step) => step === "exchange").length, 1);
});

for (const subscriptionOptions of [{ subscriptionFails: true }, { subscription: { success: false } }, { subscription: {} }]) {
  test(`failed/unconfirmed subscription skips both syncs: ${JSON.stringify(subscriptionOptions)}`, async (t) => {
    const state = fixture(t, subscriptionOptions);
    const result = await completeEmbeddedSignup("workspace-id", signup);
    assert.deepEqual(result.syncRequestIds, []);
    assert.equal(result.syncWarnings.length, 1);
    assert.match(result.syncWarnings[0]!, /synchronization were not started/);
    assert.deepEqual(state.warnings, result.syncWarnings);
    assert.equal(state.steps.includes("history"), false);
    assert.equal(state.steps.includes("smb_app_state_sync"), false);
    assert.equal(state.accountWrites.length, 1);
  });
}

test("a contacts sync failure is reported without retrying the one-time request or discarding history", async (t) => {
  const state = fixture(t, { syncFails: true });
  const result = await completeEmbeddedSignup("workspace-id", signup);
  assert.deepEqual(result.syncRequestIds, ["request-history"]);
  assert.match(result.syncWarnings[0]!, /Contacts sync unavailable/);
  assert.equal(state.steps.filter((step) => step === "smb_app_state_sync").length, 1);
});

test("a sync response without a request ID is reported as unconfirmed", async (t) => {
  fixture(t, { missingSyncId: true });
  const result = await completeEmbeddedSignup("workspace-id", signup);
  assert.deepEqual(result.syncRequestIds, []);
  assert.equal(result.syncWarnings.length, 2);
  assert.match(result.syncWarnings[0]!, /did not return a request ID/);
});

for (const invalidPhone of [{ ...phone, is_on_biz_app: false }, { ...phone, platform_type: "ON_PREMISE" }, { id: phone.id }]) {
  test(`incomplete coexistence is not saved as active: ${JSON.stringify(invalidPhone)}`, async (t) => {
    const state = fixture(t, { phone: invalidPhone });
    await assert.rejects(completeEmbeddedSignup("workspace-id", signup), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 422);
      assert.match(error.code, /^META_COEXISTENCE_/);
      return true;
    });
    assert.equal(state.accountWrites.length, 0);
  });
}

for (const list of [[null], [], [phone, { ...phone, id: "another-phone" }]]) {
  test(`invalid or ambiguous WABA phone lists do not cause a 500: ${JSON.stringify(list)}`, async (t) => {
    const state = fixture(t, { list });
    await assert.rejects(completeEmbeddedSignup("workspace-id", { ...signup, phoneNumberId: undefined }), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.ok([422, 502].includes(error.statusCode));
      return true;
    });
    assert.equal(state.accountWrites.length, 0);
  });
}

test("signup validates callback fields while permitting a missing phone ID", () => {
  assert.equal(embeddedSignupSchema.safeParse(signup).success, true);
  assert.equal(embeddedSignupSchema.safeParse({ code: "test", wabaId: "test-waba" }).success, true);
  for (const input of [{ code: "test" }, { ...signup, code: " " }, { ...signup, wabaId: "../bad" }, { ...signup, phoneNumberId: "?fields=bad" }]) {
    assert.equal(embeddedSignupSchema.safeParse(input).success, false);
  }
});

test("signup permission guard rejects anonymous, non-member, and insufficient-role requests before Meta calls", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => assert.fail("Must not call Meta"));
  let membership: unknown = null;
  stubDelegate(t, prisma.workspaceMember, "findUnique", async () => membership);
  const guard = requireWorkspacePermission(PERMISSIONS.WHATSAPP_MANAGE);
  for (const [auth, member, expectedCode] of [
    [undefined, null, "AUTHENTICATION_REQUIRED"],
    [{ userId: "test-user" }, null, "WORKSPACE_ACCESS_DENIED"],
    [{ userId: "test-user" }, { status: "ACTIVE", role: { permissions: [] } }, "PERMISSION_DENIED"],
  ] as const) {
    membership = member;
    const error = await new Promise<unknown>((resolve) => {
      void guard({ auth, params: { workspaceId: "workspace-id" } } as any, {} as any, resolve);
    });
    assert.ok(error instanceof AppError);
    assert.equal(error.code, expectedCode);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});
