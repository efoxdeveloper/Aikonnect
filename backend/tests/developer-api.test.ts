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
const { apiCampaignResponse, publicMessageResponse } = await import("../src/modules/developer-api/developer-api.controller.js");
const { createApiCampaignSchema, publicAudioMessageSchema, publicDocumentMessageSchema, publicImageMessageSchema, publicInteractiveButtonMessageSchema, publicMessageSchema, publicStickerMessageSchema, publicTextMessageSchema, publicVideoMessageSchema, requestIdempotencyKey, sendMessageSchema } = await import("../src/modules/developer-api/developer-api.schemas.js");
const { createApiCampaign } = await import("../src/modules/developer-api/developer-api.service.js");

test("API campaign schema follows the Interakt create campaign contract", () => {
  const parsed = createApiCampaignSchema.parse({ campaign_name: "Harsh Test", campaign_type: "PublicAPI", template_name: "newtemplate", language_code: "en" });
  assert.equal(parsed.campaign_name, "Harsh Test");
  assert.equal(createApiCampaignSchema.safeParse({ ...parsed, campaign_type: "Other" }).success, false);
  assert.equal(createApiCampaignSchema.safeParse({ ...parsed, template_name: " " }).success, false);
  assert.equal(createApiCampaignSchema.safeParse({ campaign_name: "Campaign", campaign_type: "PublicAPI", template_name: "template" }).success, false);
});

test("API campaign creation is workspace scoped and stores an API campaign from an approved template", async () => {
  const originalTemplateLookup = (prisma as any).template.findMany;
  const originalCampaignCreate = (prisma as any).campaign.create;
  let templateQuery: any;
  let campaignCreate: any;
  (prisma as any).template.findMany = async (query: unknown) => {
    templateQuery = query;
    return [{ name: "Order update", templateKey: "order-update", metaTemplateName: "newtemplate", metaLanguageCode: "en", language: "English", category: "Utility", body: "Your order is ready", status: "APPROVED" }];
  };
  (prisma as any).campaign.create = async (query: unknown) => {
    campaignCreate = query;
    return { id: "campaign-123", name: "Harsh Test" };
  };
  try {
    const result = await createApiCampaign("workspace-123", { campaign_name: "Harsh Test", campaign_type: "PublicAPI", template_name: "newtemplate", language_code: "en" });
    assert.deepEqual(result, { campaignId: "campaign-123", name: "Harsh Test" });
    assert.equal(templateQuery.where.workspaceId, "workspace-123");
    assert.equal(templateQuery.where.OR.length, 3);
    assert.equal(templateQuery.where.OR[0].metaTemplateName.equals, "newtemplate");
    assert.equal(campaignCreate.data.kind, "API");
    assert.equal(campaignCreate.data.templateKey, "order-update");
    assert.equal(campaignCreate.data.templateLanguageCode, "en");
    assert.deepEqual(apiCampaignResponse(result), {
      result: true,
      message: "Api Campaign Created created successfully",
      data: { campaignId: "campaign-123", name: "Harsh Test", type: "PublicAPI" },
    });
  } finally {
    (prisma as any).template.findMany = originalTemplateLookup;
    (prisma as any).campaign.create = originalCampaignCreate;
  }
});

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

test("Marento-compatible public message schema accepts the simple text payload", () => {
  const parsed = publicTextMessageSchema.parse({ userId: "customer-123", fullPhoneNumber: "+919876543210", callbackData: "order-123", type: "Text", data: { message: "Hello from Marento" } });
  assert.equal(parsed.type, "Text");
  assert.equal(parsed.data.message, "Hello from Marento");
  assert.equal(publicTextMessageSchema.safeParse({ fullPhoneNumber: "+919876543210", type: "Text", data: { message: "Hello" } }).success, false);
  assert.equal(publicTextMessageSchema.safeParse({ fullPhoneNumber: "+919876543210", type: "Image", data: { message: "Hello" } }).success, false);
  assert.equal(publicTextMessageSchema.safeParse({ fullPhoneNumber: "+919876543210", type: "Text", data: { message: "" } }).success, false);
});

test("Marento-compatible public message schema accepts an image URL and optional caption", () => {
  const input = { fullPhoneNumber: "+919876543210", callbackData: "order-image-123", type: "Image", data: { message: "Your receipt", mediaUrl: "https://cdn.example.com/receipt.jpg" } };
  const parsed = publicImageMessageSchema.parse(input);
  assert.equal(parsed.type, "Image");
  assert.equal(parsed.data.mediaUrl, input.data.mediaUrl);
  assert.equal(publicMessageSchema.safeParse(input).success, true);
  assert.equal(publicMessageSchema.safeParse({ ...input, data: { ...input.data, mediaUrl: "file:///receipt.jpg" } }).success, false);
  assert.equal(publicMessageSchema.safeParse({ ...input, data: { ...input.data, mediaUrl: "not-a-url" } }).success, false);
});

test("public message responses match the Marento queued-message contract", () => {
  assert.deepEqual(publicMessageResponse({ replayed: false, data: { messageId: "message-123" } }), {
    statusCode: 202,
    body: {
      result: true,
      message: "Message queued for sending via Marento. Check webhook for delivery status",
      id: "message-123",
    },
  });
  assert.deepEqual(publicMessageResponse({ replayed: true, data: { messageId: "message-123" } }), {
    statusCode: 200,
    body: {
      result: true,
      message: "Message was already queued. Check webhook for delivery status",
      id: "message-123",
    },
  });
});

test("Marento-compatible public message schema accepts a document URL, caption, and filename", () => {
  const input = { fullPhoneNumber: "+919876543210", callbackData: "order-document-123", type: "Document", data: { message: "Your invoice", mediaUrl: "https://cdn.example.com/invoice.pdf", fileName: "invoice-123.pdf" } };
  const parsed = publicDocumentMessageSchema.parse(input);
  assert.equal(parsed.type, "Document");
  assert.equal(parsed.data.mediaUrl, input.data.mediaUrl);
  assert.equal(parsed.data.fileName, input.data.fileName);
  assert.equal(publicMessageSchema.safeParse(input).success, true);
  assert.equal(publicMessageSchema.safeParse({ ...input, data: { ...input.data, fileName: "x".repeat(256) } }).success, false);
  assert.equal(publicMessageSchema.safeParse({ ...input, data: { ...input.data, mediaUrl: "ftp://cdn.example.com/invoice.pdf" } }).success, false);
});

test("Marento-compatible public message schema accepts a video URL, caption, and filename", () => {
  const input = { fullPhoneNumber: "+919876543210", callbackData: "order-video-123", type: "Video", data: { message: "Watch this update", mediaUrl: "https://cdn.example.com/update.mp4", fileName: "update.mp4" } };
  const parsed = publicVideoMessageSchema.parse(input);
  assert.equal(parsed.type, "Video");
  assert.equal(parsed.data.mediaUrl, input.data.mediaUrl);
  assert.equal(parsed.data.fileName, input.data.fileName);
  assert.equal(publicMessageSchema.safeParse(input).success, true);
  assert.equal(publicMessageSchema.safeParse({ ...input, data: { ...input.data, mediaUrl: "data:video/mp4;base64,AAAA" } }).success, false);
});

test("Marento-compatible public message schema accepts an audio URL, caption, and filename", () => {
  const input = { fullPhoneNumber: "+919876543210", callbackData: "order-audio-123", type: "Audio", data: { message: "This is an audio update", mediaUrl: "https://cdn.example.com/update.mp3", fileName: "update.mp3" } };
  const parsed = publicAudioMessageSchema.parse(input);
  assert.equal(parsed.type, "Audio");
  assert.equal(parsed.data.mediaUrl, input.data.mediaUrl);
  assert.equal(parsed.data.fileName, input.data.fileName);
  assert.equal(publicMessageSchema.safeParse(input).success, true);
  assert.equal(publicMessageSchema.safeParse({ ...input, data: { ...input.data, mediaUrl: "data:audio/mpeg;base64,AAAA" } }).success, false);
});

test("Marento-compatible public message schema validates interactive reply buttons", () => {
  const input = {
    fullPhoneNumber: "+919876543210",
    callbackData: "feedback-123",
    type: "InteractiveButton",
    data: {
      message: {
        type: "button",
        body: { text: "Hello, please give your feedback." },
        action: {
          buttons: [
            { type: "reply", reply: { id: "id1", title: "Ok" } },
            { type: "reply", reply: { id: "id2", title: "Good" } },
            { type: "reply", reply: { id: "id3", title: "Bad" } },
          ],
        },
      },
    },
  };
  const parsed = publicInteractiveButtonMessageSchema.parse(input);
  assert.equal(parsed.type, "InteractiveButton");
  assert.equal(parsed.data.message.action.buttons.length, 3);
  assert.equal(publicMessageSchema.safeParse(input).success, true);
  assert.equal(publicMessageSchema.safeParse({ ...input, data: { message: { ...input.data.message, action: { buttons: [...input.data.message.action.buttons, { type: "reply", reply: { id: "id4", title: "More" } }] } } } }).success, false);
  assert.equal(publicMessageSchema.safeParse({ ...input, data: { message: { ...input.data.message, action: { buttons: [{ type: "reply", reply: { id: "id1", title: "Ok" } }, { type: "reply", reply: { id: "id1", title: "Again" } }] } } } }).success, false);
  assert.equal(publicMessageSchema.safeParse({ ...input, data: { message: { ...input.data.message, action: { buttons: [{ type: "reply", reply: { id: "id1", title: "This title is too long" } }] } } } }).success, false);
});

test("Marento-compatible public message schema accepts a sticker URL", () => {
  const input = { fullPhoneNumber: "+919876543210", callbackData: "sticker-123", type: "Sticker", data: { mediaUrl: "https://cdn.example.com/stickers/hello.webp" } };
  const parsed = publicStickerMessageSchema.parse(input);
  assert.equal(parsed.type, "Sticker");
  assert.equal(parsed.data.mediaUrl, input.data.mediaUrl);
  assert.equal(publicMessageSchema.safeParse(input).success, true);
  assert.equal(publicMessageSchema.safeParse({ ...input, data: { mediaUrl: "file:///hello.webp" } }).success, false);
});

test("developer API key authentication enforces validity and scopes", async () => {
  const secret = "sk_live_unit_test_key_123456789";
  const original = (prisma as any).publicApiKey.findUnique;
  const originalSubscriptionLookup = (prisma as any).workspaceSubscription.findFirst;
  (prisma as any).workspaceSubscription.findFirst = async () => null;
  (prisma as any).publicApiKey.findUnique = async () => ({ id: "key-1", workspaceId: "workspace-1", scopes: ["messages.send", "campaigns.create"], revokedAt: null, expiresAt: null });
  const request: any = { headers: { "x-api-key": secret } };
  let authError: unknown;
  await authenticateDeveloperApiKey(request, {}, (error?: unknown) => { authError = error; });
  assert.equal(authError, undefined);
  assert.deepEqual(request.developerApiKey, { id: "key-1", workspaceId: "workspace-1", scopes: ["messages.send", "campaigns.create"] });

  let scopeError: any;
  await new Promise<void>((resolve) => requireDeveloperScope("messages.send")(request, {}, (error?: unknown) => { scopeError = error; resolve(); }));
  assert.equal(scopeError, undefined);
  let campaignScopeError: any;
  await new Promise<void>((resolve) => requireDeveloperScope("campaigns.create")(request, {}, (error?: unknown) => { campaignScopeError = error; resolve(); }));
  assert.equal(campaignScopeError, undefined);

  let missingScopeError: any;
  await new Promise<void>((resolve) => requireDeveloperScope("contacts.write")({ developerApiKey: request.developerApiKey } as any, {}, (error?: unknown) => { missingScopeError = error; resolve(); }));
  assert.equal(missingScopeError.code, "API_KEY_SCOPE_REQUIRED");
  let missingCampaignScopeError: any;
  await new Promise<void>((resolve) => requireDeveloperScope("campaigns.create")({ developerApiKey: { ...request.developerApiKey, scopes: ["messages.send"] } } as any, {}, (error?: unknown) => { missingCampaignScopeError = error; resolve(); }));
  assert.equal(missingCampaignScopeError.code, "API_KEY_SCOPE_REQUIRED");

  (prisma as any).publicApiKey.findUnique = original;
  (prisma as any).workspaceSubscription.findFirst = originalSubscriptionLookup;
});

test("developer API accepts the raw Basic API-key format used by integrations", async () => {
  const secret = "sk_live_unit_test_basic_key_123456789";
  const original = (prisma as any).publicApiKey.findUnique;
  const originalSubscriptionLookup = (prisma as any).workspaceSubscription.findFirst;
  (prisma as any).workspaceSubscription.findFirst = async () => null;
  (prisma as any).publicApiKey.findUnique = async () => ({ id: "key-basic", workspaceId: "workspace-basic", scopes: ["messages.send"], revokedAt: null, expiresAt: null });
  const request: any = { headers: { authorization: `Basic ${secret}` } };
  let authError: unknown;
  await authenticateDeveloperApiKey(request, {}, (error?: unknown) => { authError = error; });
  assert.equal(authError, undefined);
  assert.equal(request.developerApiKey.workspaceId, "workspace-basic");
  (prisma as any).publicApiKey.findUnique = original;
  (prisma as any).workspaceSubscription.findFirst = originalSubscriptionLookup;
});

test("developer API rejects a valid key when the workspace plan excludes API access", async () => {
  const originalKeyLookup = (prisma as any).publicApiKey.findUnique;
  const originalSubscriptionLookup = (prisma as any).workspaceSubscription.findFirst;
  (prisma as any).publicApiKey.findUnique = async () => ({ id: "key-limited", workspaceId: "workspace-limited", scopes: ["messages.send"], revokedAt: null, expiresAt: null });
  (prisma as any).workspaceSubscription.findFirst = async () => ({
    id: "subscription-limited",
    status: "ACTIVE",
    trialEndsAt: null,
    plan: { id: "plan-basic", slug: "basic", name: "Basic", maxSeats: 2, maxContacts: 100, maxCampaignsPerMonth: 5, maxAutomations: 1, maxWorkflows: 1, maxPipelines: 1, apiAccess: false, webhooks: false, advancedReports: false },
  });
  const request: any = { headers: { "x-api-key": "sk_live_limited_key_123456789" } };
  let authError: any;
  await authenticateDeveloperApiKey(request, {}, (error?: unknown) => { authError = error; });
  assert.equal(authError.code, "PLAN_FEATURE_NOT_INCLUDED");
  assert.equal(request.developerApiKey, undefined);
  (prisma as any).publicApiKey.findUnique = originalKeyLookup;
  (prisma as any).workspaceSubscription.findFirst = originalSubscriptionLookup;
});
