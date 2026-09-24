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
env.GROQ_API_KEY = undefined;
const { encryptSecret } = await import("../src/utils/crypto.js");
const { AppError } = await import("../src/middleware/error-handler.js");
const { addTemplateFromLibrary, createTemplate, listTemplateLibrary, syncTemplatesFromMeta } = await import("../src/modules/templates/template.service.js");

function stub(t: TestContext, target: any, method: string, implementation: (...args: any[]) => any) {
  const original = target[method];
  target[method] = implementation;
  t.after(() => { target[method] = original; });
}

function account() {
  return { metaWabaId: "waba-1", encryptedAccessToken: encryptSecret("business-token", "test-token-encryption-key-for-tests-32chars") };
}

test("submitting a template sends a Meta message template request and stores its identity", { concurrency: false }, async (t) => {
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
    saveAs: "submit", name: "Summer Sale", category: "Marketing", language: "English", templateType: "standard", headerType: "none", headerText: null, headerFileName: null, body: "Hi {{1}}, save today.", footer: null, content: { bodyExamples: ["Example"] },
  });
  assert.equal(result.status, "PENDING");
  assert.equal(result.metaTemplateId, "meta-template-1");
  assert.equal(result.metaTemplateName, "summer_sale");
  assert.equal(result.metaWabaId, "waba-1");
  assert.equal(result.metaLanguageCode, "en_US");
});

test("submitting an authentication template sends Meta's OTP components", { concurrency: false }, async (t) => {
  stub(t, prisma.template, "findFirst", async () => null);
  stub(t, prisma.whatsAppBusinessAccount, "findFirst", async () => account());
  stub(t, globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    assert.match(String(input), /\/v25\.0\/waba-1\/message_templates$/);
    assert.deepEqual(JSON.parse(String(init?.body)), {
      name: "login_code",
      language: "en_US",
      category: "AUTHENTICATION",
      components: [
        { type: "BODY", add_security_recommendation: true },
        { type: "FOOTER", code_expiration_minutes: 10 },
        { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE" }] },
      ],
    });
    return new Response(JSON.stringify({ id: "meta-auth-1", status: "PENDING" }), { status: 200 });
  });
  stub(t, prisma.template, "create", async (args: any) => ({ id: "template-auth-1", ...args.data, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, createdBy: null, updatedBy: null }));

  const result = await createTemplate("workspace", "user", {
    saveAs: "submit", name: "Login Code", category: "Authentication", language: "en_US", templateType: "standard", headerType: "none", body: "Your verification code is {{1}}.", content: { otpType: "COPY_CODE", addSecurityRecommendation: true, codeExpirationMinutes: 10 },
  });
  assert.equal(result.metaTemplateId, "meta-auth-1");
});

test("submitting supported template buttons sends Meta's button payloads", { concurrency: false }, async (t) => {
  stub(t, prisma.template, "findFirst", async () => null);
  stub(t, prisma.whatsAppBusinessAccount, "findFirst", async () => account());
  const payloads: any[] = [];
  stub(t, globalThis, "fetch", async (_input: string | URL, init?: RequestInit) => {
    payloads.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: `meta-button-${payloads.length}`, status: "PENDING" }), { status: 200 });
  });
  stub(t, prisma.template, "create", async (args: any) => ({ id: "template-button-1", ...args.data, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, createdBy: null, updatedBy: null }));

  await createTemplate("workspace", "user", { saveAs: "submit", name: "Call and link", category: "Utility", language: "en_US", templateType: "standard", headerType: "none", body: "Contact support", content: { buttons: ["website", "call"], websiteUrl: "https://example.com/support", phoneNumber: "+1 (415) 555-2671", buttonTexts: { website: "Visit support", call: "Call support" } } });
  await createTemplate("workspace", "user", { saveAs: "submit", name: "Open flow", category: "Marketing", language: "en_US", templateType: "standard", headerType: "none", body: "Complete the form", content: { buttons: ["flow"], flowId: "123456789", flowNavigateScreen: "WELCOME", buttonTexts: { flow: "Start now" } } });
  await createTemplate("workspace", "user", { saveAs: "submit", name: "View catalog", category: "Marketing", language: "en_US", templateType: "standard", headerType: "none", body: "Browse our products", content: { buttons: ["catalog"], buttonTexts: { catalog: "View products" } } });
  await createTemplate("workspace", "user", { saveAs: "submit", name: "Copy code", category: "Marketing", language: "en_US", templateType: "standard", headerType: "none", body: "Use code {{1}} at checkout", content: { buttons: ["offer"], offerCodeExample: "SAVE25" } });

  assert.deepEqual(payloads.map((payload) => payload.components.at(-1)), [
    { type: "BUTTONS", buttons: [{ type: "URL", text: "Visit support", url: "https://example.com/support" }, { type: "PHONE_NUMBER", text: "Call support", phone_number: "14155552671" }] },
    { type: "BUTTONS", buttons: [{ type: "FLOW", text: "Start now", flow_id: "123456789", navigate_screen: "WELCOME", flow_action: "navigate" }] },
    { type: "BUTTONS", buttons: [{ type: "CATALOG", text: "View products" }] },
    { type: "BUTTONS", buttons: [{ type: "COPY_CODE", example: "SAVE25" }] },
  ]);
});

test("AI preflight runs before Meta submission and allows a passing review", { concurrency: false }, async (t) => {
  env.GROQ_API_KEY = "test-groq-key";
  t.after(() => { env.GROQ_API_KEY = undefined; });
  stub(t, prisma.template, "findFirst", async () => null);
  stub(t, prisma.whatsAppBusinessAccount, "findFirst", async () => account());
  const requests: string[] = [];
  stub(t, globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    requests.push(String(input));
    if (String(input).includes("api.groq.com")) {
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-groq-key");
      assert.equal(JSON.parse(String(init?.body)).max_tokens, 900);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ decision: "pass", summary: "The template is ready for Meta review.", issues: [] }) } }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: "meta-template-ai-1", status: "PENDING" }), { status: 200 });
  });
  stub(t, prisma.template, "create", async (args: any) => ({ id: "template-ai-1", ...args.data, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, createdBy: null, updatedBy: null }));

  const result = await createTemplate("workspace", "user", {
    saveAs: "submit", name: "AI checked", category: "Marketing", language: "English", templateType: "standard", headerType: "none", body: "Hi {{1}}, your order is ready.", content: { bodyExamples: ["Example"] },
  });
  assert.equal(result.metaTemplateId, "meta-template-ai-1");
  assert.equal(requests[0], "https://api.groq.com/openai/v1/chat/completions");
  assert.match(requests[1], /message_templates$/);
});

test("AI preflight blocks a rejected template before contacting Meta", { concurrency: false }, async (t) => {
  env.GROQ_API_KEY = "test-groq-key";
  t.after(() => { env.GROQ_API_KEY = undefined; });
  stub(t, prisma.template, "findFirst", async () => null);
  let metaCalled = false;
  stub(t, globalThis, "fetch", async (input: string | URL) => {
    if (String(input).includes("api.groq.com")) return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ decision: "block", summary: "The message requests sensitive credentials.", issues: [{ severity: "error", field: "body", message: "The body requests a password.", suggestion: "Remove the credential request." }] }) } }] }), { status: 200 });
    metaCalled = true;
    return new Response("{}", { status: 200 });
  });
  stub(t, prisma.template, "create", async (args: any) => ({ id: "template-ai-rejected-1", ...args.data, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, createdBy: null, updatedBy: null }));

  const result = await createTemplate("workspace", "user", {
    saveAs: "submit", name: "Credential request", category: "Marketing", language: "en_US", templateType: "standard", headerType: "none", body: "Send us your password to continue.", content: {},
  });
  assert.equal(result.status, "REJECTED");
  assert.match(result.metaRejectionReason ?? "", /password/);
  assert.equal(metaCalled, false);
});

test("AI preflight reports Groq quota failures clearly", { concurrency: false }, async (t) => {
  env.GROQ_API_KEY = "test-groq-key";
  t.after(() => { env.GROQ_API_KEY = undefined; });
  stub(t, globalThis, "fetch", async () => new Response(JSON.stringify({ error: { message: "Rate limit reached" } }), { status: 429 }));

  await assert.rejects(
    import("../src/modules/templates/template-ai.service.js").then(({ reviewTemplateWithAI }) => reviewTemplateWithAI({ name: "Test", category: "Marketing", language: "en_US", headerType: "none", body: "Hello", buttons: [] })),
    (error: unknown) => error instanceof AppError && error.code === "TEMPLATE_AI_RATE_LIMITED" && error.message.includes("free-tier quota"),
  );
});

test("sync imports Meta templates into the workspace library", { concurrency: false }, async (t) => {
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

test("lists Meta's predefined template library with server-side filters", { concurrency: false }, async (t) => {
  stub(t, prisma.whatsAppBusinessAccount, "findFirst", async () => account());
  stub(t, globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    assert.match(String(input), /\/v25\.0\/message_template_library\?language=en_US&category=UTILITY&search=delivery&limit=25/);
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer business-token");
    return new Response(JSON.stringify({ data: [{ id: "library-1", name: "order_delivery_update", language: "en_US", category: "UTILITY", topic: "ORDER_MANAGEMENT", body: "Your order {{1}} is on its way.", buttons: [{ type: "URL", text: "Track order" }] }], paging: { cursors: { after: "next-page" } } }), { status: 200 });
  });

  const result = await listTemplateLibrary("workspace", { language: "en_US", category: "UTILITY", search: "delivery", limit: 25 });
  assert.equal(result.items[0]?.name, "order_delivery_update");
  assert.equal(result.items[0]?.body, "Your order {{1}} is on its way.");
  assert.deepEqual(result.items[0]?.buttons, [{ type: "URL", text: "Track order" }]);
  assert.equal(result.paging.cursors?.after, "next-page");
});

test("adds a Meta library template to the customer WABA and syncs it locally", { concurrency: false }, async (t) => {
  stub(t, prisma.whatsAppBusinessAccount, "findFirst", async () => account());
  stub(t, prisma.template, "findFirst", async () => null);
  stub(t, prisma.template, "create", async (args: any) => ({ id: "local-library-1", ...args.data, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, createdBy: null, updatedBy: null }));
  let requestCount = 0;
  stub(t, globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    requestCount += 1;
    if (init?.method === "POST") {
      assert.match(String(input), /\/v25\.0\/waba-1\/message_templates$/);
      assert.deepEqual(JSON.parse(String(init.body)), { name: "my_delivery_update", language: "en_US", category: "UTILITY", library_template_name: "order_delivery_update", library_template_button_inputs: [{ type: "URL", url: { base_url: "https://shop.example/track", url_suffix_example: "https://shop.example/track" } }] });
      return new Response(JSON.stringify({ id: "meta-library-1", status: "PENDING" }), { status: 200 });
    }
    assert.match(String(input), /\/v25\.0\/waba-1\/message_templates\?fields=/);
    return new Response(JSON.stringify({ data: [{ id: "meta-library-1", name: "my_delivery_update", status: "PENDING", category: "UTILITY", language: "en_US", components: [{ type: "BODY", text: "Your order {{1}} is on its way." }] }] }), { status: 200 });
  });

  const result = await addTemplateFromLibrary("workspace", "user", { libraryTemplateName: "order_delivery_update", name: "My Delivery Update", language: "en_US", category: "UTILITY", libraryTemplateButtonInputs: [{ type: "URL", value: "https://shop.example/track" }] });
  assert.equal(requestCount, 2);
  assert.equal(result.remote.id, "meta-library-1");
  assert.equal(result.sync.imported, 1);
});

test("Meta template submission requires an active WhatsApp connection", { concurrency: false }, async (t) => {
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

test("template operations prefer the configured Meta System User token", { concurrency: false }, async (t) => {
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

test("template sync exposes safe Meta permission diagnostics", { concurrency: false }, async (t) => {
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

test("Meta template submission rejects invalid variables and website URLs before calling Meta", { concurrency: false }, async (t) => {
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

test("Meta rejects a body with too many variables before the provider is called", { concurrency: false }, async (t) => {
  stub(t, prisma.template, "findFirst", async () => null);
  stub(t, prisma.whatsAppBusinessAccount, "findFirst", async () => account());
  let called = false;
  stub(t, globalThis, "fetch", async () => { called = true; return new Response("{}", { status: 200 }); });

  await assert.rejects(
    createTemplate("workspace", "user", {
      saveAs: "submit", name: "Too many variables", category: "Marketing", language: "en_US", templateType: "standard", headerType: "none", body: "Hi {{1}} {{2}}", content: { bodyExamples: ["one", "two"] },
    }),
    (error: unknown) => error instanceof AppError
      && error.statusCode === 422
      && error.code === "META_TEMPLATE_VARIABLE_RATIO_INVALID"
      && error.message === "Your template has too many variables for its text. Add more descriptive text or reduce the number of placeholders."
      && JSON.stringify(error.details).includes('"field":"body"')
      && JSON.stringify(error.details).includes('"variableCount":2')
      && JSON.stringify(error.details).includes('"suggestedAction"'),
  );
  assert.equal(called, false);
});

test("Meta body variables cannot be at the start or end of the text", { concurrency: false }, async (t) => {
  stub(t, prisma.template, "findFirst", async () => null);
  stub(t, prisma.whatsAppBusinessAccount, "findFirst", async () => account());
  let called = false;
  stub(t, globalThis, "fetch", async () => { called = true; return new Response("{}", { status: 200 }); });

  for (const body of ["{{1}} is your order", "Your order is {{1}}"] ) {
    await assert.rejects(
      createTemplate("workspace", "user", {
        saveAs: "submit", name: `Boundary ${body.slice(0, 3)}`, category: "Marketing", language: "en_US", templateType: "standard", headerType: "none", body, content: { bodyExamples: ["order-1"] },
      }),
      (error: unknown) => error instanceof AppError && error.statusCode === 422 && error.code === "META_TEMPLATE_VARIABLE_RATIO_INVALID",
    );
  }
  assert.equal(called, false);
});

test("Meta subcode 2388293 is returned as a safe template validation error", { concurrency: false }, async (t) => {
  stub(t, prisma.template, "findFirst", async () => null);
  stub(t, prisma.whatsAppBusinessAccount, "findFirst", async () => account());
  stub(t, globalThis, "fetch", async () => new Response(JSON.stringify({ error: {
    message: "(#100) Provider details that must not be shown to the user",
    code: 100,
    error_subcode: 2388293,
    type: "OAuthException",
    error_data: { access_token: "secret-token" },
  } }), { status: 400 }));

  await assert.rejects(
    createTemplate("workspace", "user", {
      saveAs: "submit", name: "Provider ratio error", category: "Marketing", language: "en_US", templateType: "standard", headerType: "none", body: "Hi {{1}}, your order is ready.", content: { bodyExamples: ["order-1"] },
    }),
    (error: unknown) => error instanceof AppError
      && error.statusCode === 422
      && error.code === "META_TEMPLATE_VARIABLE_RATIO_INVALID"
      && error.message === "Your template has too many variables for its text. Add more descriptive text or reduce the number of placeholders."
      && !JSON.stringify(error).includes("Provider details")
      && !JSON.stringify(error).includes("secret-token"),
  );
});
