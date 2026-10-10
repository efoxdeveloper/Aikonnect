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
const { createApiCampaignSchema, normalizeDeveloperApiLanguageCode, publicAudioMessageSchema, publicDocumentMessageSchema, publicImageMessageSchema, publicInteractiveButtonMessageSchema, publicMessageSchema, publicStickerMessageSchema, publicTemplateMessageSchema, publicTextMessageSchema, publicVideoMessageSchema, requestIdempotencyKey, sendMessageSchema } = await import("../src/modules/developer-api/developer-api.schemas.js");
const { buildPublicTemplateButtonParameters, createApiCampaign, sendPublicMessage, validatePublicCarouselCardValues, validatePublicSingleOrderDetails } = await import("../src/modules/developer-api/developer-api.service.js");
const { buildWhatsAppTemplateComponents } = await import("../src/modules/whatsapp/whatsapp.service.js");

test("API campaign schema follows the Interakt create campaign contract", () => {
  const parsed = createApiCampaignSchema.parse({ campaign_name: "Harsh Test", campaign_type: "PublicAPI", template_name: "newtemplate", language_code: "en_US" });
  assert.equal(parsed.campaign_name, "Harsh Test");
  assert.equal(createApiCampaignSchema.parse({ campaign_name: "Harsh Test", campaign_type: "PublicAPI", template_name: "newtemplate", language_code: "en" }).language_code, "en_US");
  assert.equal(normalizeDeveloperApiLanguageCode("en-US"), "en_US");
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
    return [{ name: "Order update", templateKey: "order-update", metaTemplateName: "newtemplate", metaLanguageCode: "en_US", language: "English", category: "Utility", body: "Your order is ready", status: "APPROVED" }];
  };
  (prisma as any).campaign.create = async (query: unknown) => {
    campaignCreate = query;
    return { id: "campaign-123", name: "Harsh Test" };
  };
  try {
    const result = await createApiCampaign("workspace-123", { campaign_name: "Harsh Test", campaign_type: "PublicAPI", template_name: "newtemplate", language_code: "en_US" });
    assert.deepEqual(result, { campaignId: "campaign-123", name: "Harsh Test" });
    assert.equal(templateQuery.where.workspaceId, "workspace-123");
    assert.equal(templateQuery.where.OR.length, 3);
    assert.equal(templateQuery.where.OR[0].metaTemplateName.equals, "newtemplate");
    assert.equal(campaignCreate.data.kind, "API");
    assert.equal(campaignCreate.data.templateKey, "order-update");
    assert.equal(campaignCreate.data.templateLanguageCode, "en_US");
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

test("public template message accepts header variables and either supported phone format", () => {
  const parsed = publicTemplateMessageSchema.parse({
    countryCode: "+91",
    phoneNumber: "9999999999",
    fullPhoneNumber: "919999999999",
    campaignId: "123e4567-e89b-42d3-a456-426614174000",
    template_category: "utility",
    callbackData: "order-123",
    type: "Template",
    template: { name: "order_update", languageCode: "en_US", headerValues: ["Harsh"], bodyValues: ["ORDER-123"], buttonValues: { "0": ["OTP-123"] } },
  });
  assert.equal(parsed.fullPhoneNumber, "+919999999999");
  assert.equal(parsed.template_category, "UTILITY");
  assert.deepEqual(parsed.template.headerValues, ["Harsh"]);
  assert.deepEqual(parsed.template.buttonValues, { "0": ["OTP-123"] });
  assert.equal(publicTemplateMessageSchema.parse({
    fullPhoneNumber: "+919999999999", callbackData: "order-124", type: "Template",
    template: { name: "order_update", languageCode: "en" },
  }).template.languageCode, "en_US");
  assert.equal(publicTemplateMessageSchema.safeParse({
    fullPhoneNumber: "+919999999999", callbackData: "order-123", type: "Template",
    template: { name: "order_update", languageCode: "en_US" },
  }).success, true);
  assert.equal(publicTemplateMessageSchema.safeParse({
    countryCode: "+91", callbackData: "order-123", type: "Template",
    template: { name: "order_update", languageCode: "en_US" },
  }).success, false);
  assert.equal(publicTemplateMessageSchema.safeParse({
    fullPhoneNumber: "+919999999999", countryCode: "+91", phoneNumber: "8888888888", callbackData: "order-123", type: "Template",
    template: { name: "order_update", languageCode: "en_US" },
  }).success, false);
  const documentInput = publicTemplateMessageSchema.parse({
    fullPhoneNumber: "+919999999999", callbackData: "invoice-123", type: "Template",
    template: { name: "invoice_ready", languageCode: "en_US", headerValues: ["https://cdn.example.com/invoice.pdf"], fileName: "invoice.pdf" },
  });
  assert.equal(documentInput.template.fileName, "invoice.pdf");
  assert.deepEqual(buildWhatsAppTemplateComponents([{ type: "text", text: "ORDER-123" }], undefined, [{ type: "text", text: "Harsh" }]), [
    { type: "header", parameters: [{ type: "text", text: "Harsh" }] },
    { type: "body", parameters: [{ type: "text", text: "ORDER-123" }] },
  ]);
  assert.deepEqual(buildWhatsAppTemplateComponents([], undefined, [{ type: "document", document: { link: "https://cdn.example.com/invoice.pdf", filename: "invoice.pdf" } }]), [
    { type: "header", parameters: [{ type: "document", document: { link: "https://cdn.example.com/invoice.pdf", filename: "invoice.pdf" } }] },
  ]);
  assert.deepEqual(buildWhatsAppTemplateComponents([], undefined, [{ type: "image", image: { link: "https://cdn.example.com/receipt.jpg" } }]), [
    { type: "header", parameters: [{ type: "image", image: { link: "https://cdn.example.com/receipt.jpg" } }] },
  ]);
  assert.deepEqual(buildWhatsAppTemplateComponents([{ type: "text", text: "LIPSUM" }], undefined, [], [{ subType: "url", index: "0", parameters: [{ type: "text", text: "LIPSUM" }] }]), [
    { type: "body", parameters: [{ type: "text", text: "LIPSUM" }] },
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "LIPSUM" }] },
  ]);
  assert.deepEqual(buildWhatsAppTemplateComponents([{ type: "text", text: "ORDER-1" }, { type: "text", text: "ORDER-2" }], undefined, [], [{ subType: "url", index: "1", parameters: [{ type: "text", text: "track-123" }] }]), [
    { type: "body", parameters: [{ type: "text", text: "ORDER-1" }, { type: "text", text: "ORDER-2" }] },
    { type: "button", sub_type: "url", index: "1", parameters: [{ type: "text", text: "track-123" }] },
  ]);
  assert.deepEqual(buildWhatsAppTemplateComponents([{ type: "text", text: "CAMPAIGN" }], undefined, [], [], [
    { headerParameters: [{ type: "image", image: { link: "https://cdn.example.com/card-1.jpg" } }], bodyParameters: [{ type: "text", text: "FIRST" }], buttonParameters: [{ subType: "url", index: "1", parameters: [{ type: "text", text: "first-123" }] }] },
    { headerParameters: [{ type: "image", image: { link: "https://cdn.example.com/card-2.jpg" } }], bodyParameters: [{ type: "text", text: "SECOND" }], buttonParameters: [{ subType: "url", index: "1", parameters: [{ type: "text", text: "second-456" }] }] },
  ]), [
    { type: "body", parameters: [{ type: "text", text: "CAMPAIGN" }] },
    { type: "carousel", cards: [
      { card_index: 0, components: [{ type: "header", parameters: [{ type: "image", image: { link: "https://cdn.example.com/card-1.jpg" } }] }, { type: "body", parameters: [{ type: "text", text: "FIRST" }] }, { type: "button", sub_type: "url", index: "1", parameters: [{ type: "text", text: "first-123" }] }] },
      { card_index: 1, components: [{ type: "header", parameters: [{ type: "image", image: { link: "https://cdn.example.com/card-2.jpg" } }] }, { type: "body", parameters: [{ type: "text", text: "SECOND" }] }, { type: "button", sub_type: "url", index: "1", parameters: [{ type: "text", text: "second-456" }] }] },
    ] },
  ]);
  assert.deepEqual(buildWhatsAppTemplateComponents([{ type: "text", text: "200" }], undefined, [], [], undefined, {
    reference_id: "22july25mjwapaytemp1",
    order: { status: "canceled", description: "Order failed" },
  }), [
    { type: "body", parameters: [{ type: "text", text: "200" }] },
    { type: "order_status", parameters: [{ type: "order_status", order_status: { reference_id: "22july25mjwapaytemp1", order: { status: "canceled", description: "Order failed" } } }] },
  ]);
});

test("public order status template accepts the Interakt payload and validates order status", () => {
  const input = publicTemplateMessageSchema.parse({
    countryCode: "+91",
    phoneNumber: "9999999999",
    callbackData: "",
    template_category: "utility",
    type: "Template",
    template: {
      name: "payment_confirmation_whatsapp_pay",
      languageCode: "en",
      bodyValues: ["200"],
      order_status: { reference_id: "22july25mjwapaytemp1", order: { status: "canceled", description: "Order failed" } },
    },
  });
  assert.equal(input.callbackData, "");
  assert.equal(input.template.languageCode, "en_US");
  assert.equal(input.template.order_status?.order.status, "canceled");
  assert.equal(publicTemplateMessageSchema.safeParse({
    fullPhoneNumber: "+919999999999", callbackData: "", type: "Template",
    template: { name: "status", languageCode: "en_US", order_status: { reference_id: "ref", order: { status: "cancelled" } } },
  }).success, false);
});

test("public template send requires a value for each text header variable", async () => {
  const originalMessageLookup = (prisma as any).message.findUnique;
  const originalTemplateLookup = (prisma as any).template.findMany;
  (prisma as any).message.findUnique = async () => null;
  (prisma as any).template.findMany = async () => [{
    id: "template-1", name: "Order update", templateKey: "order-update", metaTemplateName: "order_update",
    metaLanguageCode: "en_US", language: "English", category: "Utility", templateType: "standard",
    headerType: "text", headerText: "Hello {{1}}", body: "Order {{1}} is ready", content: {}, status: "APPROVED",
  }];
  try {
    const input = publicTemplateMessageSchema.parse({
      fullPhoneNumber: "+919999999999", callbackData: "order-123", type: "Template",
      template: { name: "order_update", languageCode: "en_US", bodyValues: ["ORDER-123"] },
    });
    await assert.rejects(sendPublicMessage("workspace-1", input), (error: any) => error.code === "TEMPLATE_HEADER_VALUES_INVALID");
  } finally {
    (prisma as any).message.findUnique = originalMessageLookup;
    (prisma as any).template.findMany = originalTemplateLookup;
  }
});

test("public document template header requires a filename and an http media URL", async () => {
  const originalMessageLookup = (prisma as any).message.findUnique;
  const originalTemplateLookup = (prisma as any).template.findMany;
  (prisma as any).message.findUnique = async () => null;
  (prisma as any).template.findMany = async () => [{
    id: "template-doc", name: "Invoice ready", templateKey: "invoice-ready", metaTemplateName: "invoice_ready",
    metaLanguageCode: "en_US", language: "English", category: "Utility", templateType: "standard",
    headerType: "doc", headerText: null, body: "Your invoice is ready", content: {}, status: "APPROVED",
  }];
  try {
    const noFileName = publicTemplateMessageSchema.parse({
      fullPhoneNumber: "+919999999999", callbackData: "invoice-123", type: "Template",
      template: { name: "invoice_ready", languageCode: "en_US", headerValues: ["https://cdn.example.com/invoice.pdf"] },
    });
    await assert.rejects(sendPublicMessage("workspace-1", noFileName), (error: any) => error.code === "TEMPLATE_HEADER_VALUES_INVALID");

    const invalidUrl = publicTemplateMessageSchema.parse({
      fullPhoneNumber: "+919999999999", callbackData: "invoice-124", type: "Template",
      template: { name: "invoice_ready", languageCode: "en_US", headerValues: ["file:///invoice.pdf"], fileName: "invoice.pdf" },
    });
    await assert.rejects(sendPublicMessage("workspace-1", invalidUrl), (error: any) => error.code === "TEMPLATE_HEADER_MEDIA_URL_INVALID");
  } finally {
    (prisma as any).message.findUnique = originalMessageLookup;
    (prisma as any).template.findMany = originalTemplateLookup;
  }
});

test("public image template header requires exactly one media URL", async () => {
  const originalMessageLookup = (prisma as any).message.findUnique;
  const originalTemplateLookup = (prisma as any).template.findMany;
  (prisma as any).message.findUnique = async () => null;
  (prisma as any).template.findMany = async () => [{
    id: "template-image", name: "Receipt image", templateKey: "receipt-image", metaTemplateName: "receipt_image",
    metaLanguageCode: "en_US", language: "English", category: "Utility", templateType: "standard",
    headerType: "image", headerText: null, body: "Your receipt is ready", content: {}, status: "APPROVED",
  }];
  try {
    const input = publicTemplateMessageSchema.parse({
      fullPhoneNumber: "+919999999999", callbackData: "receipt-123", type: "Template",
      template: { name: "receipt_image", languageCode: "en_US" },
    });
    await assert.rejects(sendPublicMessage("workspace-1", input), (error: any) => error.code === "TEMPLATE_HEADER_VALUES_INVALID");
  } finally {
    (prisma as any).message.findUnique = originalMessageLookup;
    (prisma as any).template.findMany = originalTemplateLookup;
  }
});

test("authentication template send requires OTP button value at index zero", async () => {
  const originalMessageLookup = (prisma as any).message.findUnique;
  const originalTemplateLookup = (prisma as any).template.findMany;
  (prisma as any).message.findUnique = async () => null;
  (prisma as any).template.findMany = async () => [{
    id: "template-auth", name: "Login code", templateKey: "login-code", metaTemplateName: "itk_auth_one_tap",
    metaLanguageCode: "en_US", language: "English", category: "Authentication", templateType: "standard",
    headerType: "none", headerText: null, body: "{{1}} is your verification code", content: { otpType: "ONE_TAP" }, status: "APPROVED",
  }];
  try {
    const noButtonValue = publicTemplateMessageSchema.parse({
      countryCode: "+91", phoneNumber: "9999999999", callbackData: "login-123", type: "Template",
      template: { name: "itk_auth_one_tap", languageCode: "en_US", bodyValues: ["LIPSUM"] },
    });
    await assert.rejects(sendPublicMessage("workspace-1", noButtonValue), (error: any) => error.code === "TEMPLATE_BUTTON_VALUES_INVALID");

    const wrongButtonIndex = publicTemplateMessageSchema.parse({
      countryCode: "+91", phoneNumber: "9999999999", callbackData: "login-124", type: "Template",
      template: { name: "itk_auth_one_tap", languageCode: "en_US", bodyValues: ["LIPSUM"], buttonValues: { "1": ["LIPSUM"] } },
    });
    await assert.rejects(sendPublicMessage("workspace-1", wrongButtonIndex), (error: any) => error.code === "TEMPLATE_BUTTON_VALUES_INVALID");
  } finally {
    (prisma as any).message.findUnique = originalMessageLookup;
    (prisma as any).template.findMany = originalTemplateLookup;
  }
});

test("dynamic CTA templates require the URL button value at its template button index", async () => {
  const originalMessageLookup = (prisma as any).message.findUnique;
  const originalTemplateLookup = (prisma as any).template.findMany;
  (prisma as any).message.findUnique = async () => null;
  (prisma as any).template.findMany = async () => [{
    id: "template-cta", name: "Order tracking", templateKey: "order-tracking", metaTemplateName: "order_tracking",
    metaLanguageCode: "en_US", language: "English (US)", category: "Utility", templateType: "standard",
    headerType: "none", headerText: null, body: "Order {{1}} has status {{2}}",
    content: { metaComponents: [{ type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Help" }, { type: "URL", text: "Track order", url: "https://shop.example/orders/{{1}}" }] }] }, status: "APPROVED",
  }];
  try {
    const missingValue = publicTemplateMessageSchema.parse({
      fullPhoneNumber: "+919999999999", callbackData: "order-123", type: "Template",
      template: { name: "order_tracking", languageCode: "en_US", bodyValues: ["ORDER-123", "shipped"] },
    });
    await assert.rejects(sendPublicMessage("workspace-1", missingValue), (error: any) => error.code === "TEMPLATE_BUTTON_VALUES_INVALID");

    const wrongIndex = publicTemplateMessageSchema.parse({
      fullPhoneNumber: "+919999999999", callbackData: "order-124", type: "Template",
      template: { name: "order_tracking", languageCode: "en_US", bodyValues: ["ORDER-124", "shipped"], buttonValues: { "0": ["ORDER-124"] } },
    });
    await assert.rejects(sendPublicMessage("workspace-1", wrongIndex), (error: any) => error.code === "TEMPLATE_BUTTON_VALUES_INVALID");
  } finally {
    (prisma as any).message.findUnique = originalMessageLookup;
    (prisma as any).template.findMany = originalTemplateLookup;
  }
});

test("carousel template requests require one complete card entry per approved card", async () => {
  const originalMessageLookup = (prisma as any).message.findUnique;
  const originalTemplateLookup = (prisma as any).template.findMany;
  (prisma as any).message.findUnique = async () => null;
  (prisma as any).template.findMany = async () => [{
    id: "template-carousel", name: "Product carousel", templateKey: "product-carousel", metaTemplateName: "product_carousel",
    metaLanguageCode: "en_US", language: "English (US)", category: "Marketing", templateType: "carousel",
    headerType: "none", headerText: null, body: "Featured products: {{1}} and {{2}}",
    content: { metaComponents: [
      { type: "BODY", text: "Featured products: {{1}} and {{2}}" },
      { type: "CAROUSEL", cards: [0, 1].map(() => ({ components: [
        { type: "HEADER", format: "IMAGE" },
        { type: "BODY", text: "Product {{1}}" },
        { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Details" }, { type: "URL", text: "View", url: "https://shop.example/products/{{1}}" }] },
      ] })) },
    ] }, status: "APPROVED",
  }];
  try {
    const missingCards = publicTemplateMessageSchema.parse({
      fullPhoneNumber: "+919999999999", callbackData: "products-123", type: "Template",
      template: { name: "product_carousel", languageCode: "en_US", bodyValues: ["PHONE", "TABLET"] },
    });
    await assert.rejects(sendPublicMessage("workspace-1", missingCards), (error: any) => error.code === "TEMPLATE_CAROUSEL_CARDS_INVALID");

    const incompleteCard = publicTemplateMessageSchema.parse({
      fullPhoneNumber: "+919999999999", callbackData: "products-124", type: "Template",
      template: {
        name: "product_carousel", languageCode: "en_US", bodyValues: ["PHONE", "TABLET"],
        carouselCards: [
          { headerValues: ["https://cdn.example.com/phone.jpg"], bodyValues: ["Phone"], buttonValues: { "1": ["phone-123"] } },
          { headerValues: ["https://cdn.example.com/tablet.jpg"], bodyValues: ["Tablet"] },
        ],
      },
    });
    await assert.rejects(sendPublicMessage("workspace-1", incompleteCard), (error: any) => error.code === "TEMPLATE_CAROUSEL_BUTTON_VALUES_INVALID");
  } finally {
    (prisma as any).message.findUnique = originalMessageLookup;
    (prisma as any).template.findMany = originalTemplateLookup;
  }
});

test("carousel cards with static CTA buttons do not require buttonValues", () => {
  const input = publicTemplateMessageSchema.parse({
    fullPhoneNumber: "+919999999999", callbackData: "products-125", type: "Template",
    template: {
      name: "product_carousel", languageCode: "en_US", bodyValues: ["PHONE", "TABLET"],
      carouselCards: [
        { headerValues: ["https://cdn.example.com/phone.jpg"], bodyValues: ["Phone"] },
        { headerValues: ["https://cdn.example.com/tablet.jpg"], bodyValues: ["Tablet"] },
      ],
    },
  });
  const content = { metaComponents: [{ type: "CAROUSEL", cards: [0, 1].map(() => ({ components: [
    { type: "HEADER", format: "IMAGE" },
    { type: "BODY", text: "Product {{1}}" },
    { type: "BUTTONS", buttons: [{ type: "URL", text: "View product", url: "https://shop.example/products/phone" }] },
  ] })) }] };
  assert.doesNotThrow(() => validatePublicCarouselCardValues(input, content));
});

test("order details carousel accepts one order for each approved order details button", () => {
  const input = publicTemplateMessageSchema.parse({
    fullPhoneNumber: "+919999999999", callbackData: "", type: "Template",
    template: {
      name: "carousel_var", languageCode: "en", bodyValues: ["mj"],
      carouselCards: [
        { headerValues: ["https://cdn.example.com/card-1.mp4"], bodyValues: ["mj"] },
        { headerValues: ["https://cdn.example.com/card-2.mp4"], bodyValues: ["mj1"] },
      ],
      order_details: ["22july25mjwapaytemp111", "22july25mjwapaytemp2333"].map((reference_id, index) => ({
        reference_id,
        order_items: [{ name: index ? "Chocolate Cake" : "Strawberry Cake", quantity: 1, amount: 1, country_of_origin: "India" }],
        shipping_addresses: [{ name: "Akhil Kumar", phone_number: "919000090000", address: "Bandra Kurla Complex", city: "Mumbai", state: "Maharashtra", in_pin_code: "400051", country: "IN" }],
        subtotal: 1, discount: 0, tax: 0, shipping: 0, total_amount: 1, currency: "INR",
        payment_option_expires_in: { value: 15, unit: "minutes", expiration_message: "" },
      })),
    },
  });
  const content = { metaComponents: [{ type: "CAROUSEL", cards: [0, 1].map(() => ({ components: [
    { type: "HEADER", format: "VIDEO" },
    { type: "BODY", text: "Order {{1}}" },
    { type: "BUTTONS", buttons: [{ type: "ORDER_DETAILS", text: "Pay now" }] },
  ] })) }] };
  assert.doesNotThrow(() => validatePublicCarouselCardValues(input, content));
  assert.equal(publicTemplateMessageSchema.safeParse({
    fullPhoneNumber: "+919999999999", callbackData: "", type: "Template",
    template: { name: "carousel_var", languageCode: "en_US", order_details: [] },
  }).success, false);
});

test("single image order details template accepts and maps one order details button action", () => {
  const input = publicTemplateMessageSchema.parse({
    countryCode: "+91", phoneNumber: "9999999999", callbackData: "", type: "Template",
    template: {
      name: "single_image", languageCode: "en", headerValues: ["https://cdn.example.com/fruit.jpg"], bodyValues: ["mj"],
      order_details: [{
        reference_id: "22july25mjwapaytemp1",
        order_items: [{ name: "Strawberry Cake", quantity: 1, amount: 1, country_of_origin: "India" }],
        shipping_addresses: [{ name: "Akhil Kumar", phone_number: "919000090000", address: "Bandra Kurla Complex", city: "Mumbai", state: "Maharashtra", in_pin_code: "400051", house_number: "12", tower_number: "5", building_name: "One BKC", landmark_area: "Near BKC Circle", country: "IN" }],
        subtotal: 1, discount: 0, tax: 0, shipping: 0, total_amount: 1, currency: "INR",
        payment_option_expires_in: { value: 15, unit: "minutes", expiration_message: "" },
      }],
    },
  });
  const content = { metaComponents: [{ type: "BUTTONS", buttons: [{ type: "ORDER_DETAILS", text: "Pay now" }] }] };
  assert.doesNotThrow(() => validatePublicSingleOrderDetails(input, content));
  assert.deepEqual(buildPublicTemplateButtonParameters(input, content), [{
    subType: "order_details",
    index: "0",
    parameters: [{ type: "action", action: { order_details: {
      reference_id: "22july25mjwapaytemp1",
      type: "physical-goods",
      currency: "INR",
      total_amount: { offset: 100, value: 100 },
      order: {
        status: "pending",
        items: [{ name: "Strawberry Cake", quantity: 1, amount: { offset: 100, value: 100 }, country_of_origin: "India" }],
        subtotal: { offset: 100, value: 100 }, discount: { offset: 100, value: 0 }, tax: { offset: 100, value: 0 }, shipping: { offset: 100, value: 0 },
        shipping_addresses: [{ name: "Akhil Kumar", phone_number: "919000090000", address: "Bandra Kurla Complex", city: "Mumbai", state: "Maharashtra", in_pin_code: "400051", house_number: "12", tower_number: "5", building_name: "One BKC", landmark_area: "Near BKC Circle", country: "IN" }],
      },
      payment_option_expires_in: { value: 15, unit: "minutes", expiration_message: "" },
    } } }],
  }]);
  const invalidTotal = publicTemplateMessageSchema.parse({
    fullPhoneNumber: "+919999999999", callbackData: "", type: "Template",
    template: { name: "single_image", languageCode: "en_US", order_details: [{ reference_id: "bad-total", order_items: [{ name: "Cake", quantity: 1, amount: 1 }], subtotal: 2, discount: 0, tax: 0, shipping: 0, total_amount: 1, currency: "INR" }] },
  });
  assert.throws(() => validatePublicSingleOrderDetails(invalidTotal, content), (error: any) => error.code === "TEMPLATE_ORDER_TOTAL_INVALID");
  assert.equal(publicTemplateMessageSchema.safeParse({
    fullPhoneNumber: "+919999999999", callbackData: "", type: "Template",
    template: { name: "single_image", languageCode: "en_US", order_details: [] },
  }).success, false);
});

test("developer send schema accepts a template request and rejects malformed recipients", () => {
  const parsed = sendMessageSchema.parse({ to: "919876543210", templateKey: "order-update", languageCode: "en", parameters: ["123"] });
  assert.equal(parsed.to, "919876543210");
  assert.equal(parsed.languageCode, "en_US");
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

test("public message responses match the Interakt created-message contract", () => {
  assert.deepEqual(publicMessageResponse({ replayed: false, data: { messageId: "message-123" } }), {
    statusCode: 201,
    body: {
      result: true,
      message: "Message created successfully",
      id: "message-123",
    },
  });
  assert.deepEqual(publicMessageResponse({ replayed: true, data: { messageId: "message-123" } }), {
    statusCode: 200,
    body: {
      result: true,
      message: "Message created successfully",
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
