import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  META_APP_ID: "test-app",
  META_APP_SECRET: "test-app-secret",
  META_TOKEN_ENCRYPTION_KEY: "test-token-encryption-key-for-tests-32chars",
  META_GRAPH_API_VERSION: "v25.0",
});

const { prisma } = await import("../src/database/prisma.js");
const { env } = await import("../src/config/env.js");
const { encryptSecret } = await import("../src/utils/crypto.js");
const { AppError } = await import("../src/middleware/error-handler.js");
const { createTemplate, syncTemplatesFromMeta } = await import("../src/modules/templates/template.service.js");

function stub(t: TestContext, target: any, method: string, implementation: (...args: any[]) => any) {
  const original = target[method];
  target[method] = implementation;
  t.after(() => { target[method] = original; });
}

function account() {
  return { metaWabaId: "waba-1", encryptedAccessToken: encryptSecret("business-token", "test-token-encryption-key-for-tests-32chars") };
}

test("submitting a template sends a Meta message template request and stores its identity", async (t) => {
  stub(t, prisma.template, "findFirst", async () => null);
  stub(t, prisma.whatsAppBusinessAccount, "findFirst", async () => account());
  stub(t, globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    assert.match(String(input), /\/v25\.0\/waba-1\/message_templates$/);
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer business-token");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      name: "summer_sale",
      language: "en_US",
      category: "MARKETING",
      components: [{ type: "BODY", text: "Hi {{1}}, save today.", example: { body_text: [["Example"]] } }],
    });
    return new Response(JSON.stringify({ id: "meta-template-1", status: "PENDING" }), { status: 200 });
  });
  stub(t, prisma.template, "create", async (args: any) => ({
    id: "template-1", ...args.data, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, createdBy: null, updatedBy: null,
  }));

  const result = await createTemplate("workspace", "user", {
    saveAs: "submit", name: "Summer Sale", category: "Marketing", language: "English", templateType: "standard", headerType: "none", headerText: null, headerFileName: null, body: "Hi {{1}}, save today.", footer: null, content: {},
  });
  assert.equal(result.status, "PENDING");
  assert.equal(result.metaTemplateId, "meta-template-1");
  assert.equal(result.metaTemplateName, "summer_sale");
  assert.equal(result.metaWabaId, "waba-1");
  assert.equal(result.metaLanguageCode, "en_US");
});

test("sync imports Meta templates into the workspace library", async (t) => {
  const creates: any[] = [];
  stub(t, prisma.whatsAppBusinessAccount, "findFirst", async () => account());
  stub(t, globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    assert.match(String(input), /\/v25\.0\/waba-1\/message_templates/);
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer business-token");
    return new Response(JSON.stringify({ data: [{ id: "meta-template-2", name: "order_update", status: "APPROVED", category: "UTILITY", language: "en_US", components: [{ type: "BODY", text: "Order {{1}} is ready." }] }] }), { status: 200 });
  });
  stub(t, prisma.template, "findFirst", async () => null);
  stub(t, prisma.template, "create", async (args: any) => { creates.push(args); return {}; });

  const result = await syncTemplatesFromMeta("workspace", "user");
  assert.deepEqual(result, { imported: 1, wabaId: "waba-1", debug: { wabaId: "waba-1", tokenSource: "embedded_signup", pages: 1, remoteCount: 1, importedCount: 1, categories: { Utility: 1 } } });
  assert.equal(creates[0].data.metaTemplateId, "meta-template-2");
  assert.equal(creates[0].data.metaTemplateName, "order_update");
  assert.equal(creates[0].data.status, "APPROVED");
  assert.equal(creates[0].data.templateKey, "order-update");
});

test("Meta template submission requires an active WhatsApp connection", async (t) => {
  stub(t, prisma.template, "findFirst", async () => null);
  stub(t, prisma.whatsAppBusinessAccount, "findFirst", async () => null);
  let called = false;
  stub(t, globalThis, "fetch", async () => { called = true; return new Response("{}", { status: 200 }); });
  await assert.rejects(
    createTemplate("workspace", "user", { saveAs: "submit", name: "No Connection", category: "Marketing", language: "en_US", templateType: "standard", headerType: "none", body: "Hello", content: {} }),
    (error: any) => error?.code === "WHATSAPP_NOT_CONNECTED",
  );
  assert.equal(called, false);
});

test("template operations prefer the configured Meta System User token", async (t) => {
  env.META_SYSTEM_USER_ACCESS_TOKEN = "system-user-token";
  t.after(() => { env.META_SYSTEM_USER_ACCESS_TOKEN = undefined; });
  stub(t, prisma.whatsAppBusinessAccount, "findFirst", async () => account());
  stub(t, globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    assert.match(String(input), /\/v25\.0\/waba-1\/message_templates/);
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer system-user-token");
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  });

  const result = await syncTemplatesFromMeta("workspace", "user");
  assert.deepEqual(result, { imported: 0, wabaId: "waba-1", debug: { wabaId: "waba-1", tokenSource: "system_user", pages: 1, remoteCount: 0, importedCount: 0, categories: {} } });
});

test("template sync exposes safe Meta permission diagnostics", async (t) => {
  env.META_SYSTEM_USER_ACCESS_TOKEN = "system-user-token";
  t.after(() => { env.META_SYSTEM_USER_ACCESS_TOKEN = undefined; });
  stub(t, prisma.whatsAppBusinessAccount, "findFirst", async () => account());
  stub(t, globalThis, "fetch", async () => new Response(JSON.stringify({ error: { message: "(#10) Permission denied", code: 10, error_subcode: 200, type: "OAuthException" } }), { status: 400 }));

  await assert.rejects(
    syncTemplatesFromMeta("workspace", "user"),
    (error: any) => error?.code === "META_API_ERROR"
      && error.details?.wabaId === "waba-1"
      && error.details?.tokenSource === "system_user"
      && error.details?.providerCode === 10
      && typeof error.details?.diagnosis === "string"
      && !JSON.stringify(error.details).includes("system-user-token"),
  );
});

test("Meta template submission rejects invalid variables and website URLs before calling Meta", async (t) => {
  stub(t, prisma.template, "findFirst", async () => null);
  stub(t, prisma.whatsAppBusinessAccount, "findFirst", async () => account());
  let called = false;
  stub(t, globalThis, "fetch", async () => { called = true; return new Response("{}", { status: 200 }); });

  await assert.rejects(
    createTemplate("workspace", "user", { saveAs: "submit", name: "Invalid variables", category: "Marketing", language: "en_US", templateType: "standard", headerType: "none", body: "Hi {{2}}", content: {} }),
    (error: unknown) => error instanceof AppError && error.code === "META_TEMPLATE_VARIABLES_INVALID",
  );
  await assert.rejects(
    createTemplate("workspace", "user", { saveAs: "submit", name: "Invalid URL", category: "Marketing", language: "en_US", templateType: "standard", headerType: "none", body: "Visit us", content: { buttons: ["website"], websiteUrl: "javascript:alert(1)" } }),
    (error: unknown) => error instanceof AppError && error.code === "META_TEMPLATE_BUTTON_URL_INVALID",
  );
  assert.equal(called, false);
});
