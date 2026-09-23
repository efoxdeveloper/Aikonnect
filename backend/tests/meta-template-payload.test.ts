import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMetaTemplatePayload } from "../src/modules/templates/meta-template-payload.js";

test("builds the regression template with normalized name, uppercase category, body examples, and static footer", () => {
  assert.deepEqual(buildMetaTemplatePayload({
    saveAs: "submit",
    name: "Punch IN",
    category: "Utility",
    language: "en_US",
    templateType: "standard",
    headerType: "none",
    body: "{{1}} entered school at {{2}} on {{3}}.",
    footer: "Attendance Notification",
    content: { bodyExamples: ["Rahul Sharma", "08:12 AM", "23 Sep 2026"] },
  }), {
    name: "punch_in",
    language: "en_US",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "{{1}} entered school at {{2}} on {{3}}.",
        example: { body_text: [["Rahul Sharma", "08:12 AM", "23 Sep 2026"]] },
      },
      { type: "FOOTER", text: "Attendance Notification" },
    ],
  });
});

test("uses header_text for text-header examples and never copies body into footer", () => {
  const payload = buildMetaTemplatePayload({
    saveAs: "submit", name: "Greeting", category: "MARKETING", language: "en_US", templateType: "standard", headerType: "text",
    headerText: "Hello {{1}}", body: "Order {{1}} is ready", footer: "Thanks", content: { headerExamples: ["Rahul"], bodyExamples: ["ORD123"] },
  });
  assert.deepEqual(payload.components, [
    { type: "HEADER", format: "TEXT", text: "Hello {{1}}", example: { header_text: ["Rahul"] } },
    { type: "BODY", text: "Order {{1}} is ready", example: { body_text: [["ORD123"]] } },
    { type: "FOOTER", text: "Thanks" },
  ]);
});

test("maps standard buttons to Meta button objects and excludes empty state", () => {
  const payload = buildMetaTemplatePayload({
    saveAs: "submit", name: "Actions", category: "Utility", language: "en_US", templateType: "standard", headerType: "none", body: "Choose", footer: "",
    content: {
      buttons: ["website", "call"],
      quickReplies: ["Yes", "No"],
      websiteUrl: "https://example.com/shop?ref={{1}}",
      websiteUrlExamples: ["summer"],
      phoneNumber: "+919876543210",
      buttonTexts: { website: "Visit Website", call: "Call" },
    },
  });
  assert.deepEqual(payload.components, [
    { type: "BODY", text: "Choose" },
    { type: "BUTTONS", buttons: [
      { type: "URL", text: "Visit Website", url: "https://example.com/shop?ref={{1}}", example: ["summer"] },
      { type: "PHONE_NUMBER", text: "Call", phone_number: "919876543210" },
    ] },
  ]);
  assert.throws(() => buildMetaTemplatePayload({
    saveAs: "submit", name: "Actions", category: "Utility", language: "en_US", templateType: "standard", headerType: "none", body: "Choose", content: { buttons: ["quick-reply", "website"] },
  }), /Quick replies cannot be combined/);
});

test("builds media, authentication, flow, and multi-product payloads with dedicated schemas", () => {
  assert.deepEqual(buildMetaTemplatePayload({
    saveAs: "submit", name: "Receipt", category: "Utility", language: "en_US", templateType: "standard", headerType: "image", body: "Here is your receipt", content: { headerHandle: "4::media-handle" },
  }).components[0], { type: "HEADER", format: "IMAGE", example: { header_handle: ["4::media-handle"] } });

  assert.deepEqual(buildMetaTemplatePayload({
    saveAs: "submit", name: "Login Code", category: "Authentication", language: "en_US", templateType: "standard", headerType: "none", body: "ignored", content: { otpType: "ONE_TAP", addSecurityRecommendation: true, codeExpirationMinutes: 10, packageName: "com.example.app", signatureHash: "K8a%2FAINcGX7" },
  }).components, [
    { type: "BODY", add_security_recommendation: true },
    { type: "FOOTER", code_expiration_minutes: 10 },
    { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "ONE_TAP", text: "Copy Code", autofill_text: "Autofill", package_name: "com.example.app", signature_hash: "K8a%2FAINcGX7" }] },
  ]);

  assert.deepEqual(buildMetaTemplatePayload({
    saveAs: "submit", name: "Open Form", category: "Marketing", language: "en_US", templateType: "standard", headerType: "none", body: "Please complete the form", content: { buttons: ["flow"], flowId: "123", flowNavigateScreen: "WELCOME" },
  }).components[1], { type: "BUTTONS", buttons: [{ type: "FLOW", text: "Open flow", flow_id: "123", navigate_screen: "WELCOME", flow_action: "navigate" }] });

  assert.deepEqual(buildMetaTemplatePayload({
    saveAs: "submit", name: "Catalog Items", category: "MARKETING", language: "en_US", templateType: "multi-product", headerType: "none", body: "See these items", content: {},
  }).components, [
    { type: "BODY", text: "See these items" },
    { type: "BUTTONS", buttons: [{ type: "MPM", text: "View items" }] },
  ]);
});

test("rejects gapped variables, dynamic footers, missing examples, and local media filenames", () => {
  assert.throws(() => buildMetaTemplatePayload({ saveAs: "submit", name: "Bad", category: "Utility", language: "en_US", templateType: "standard", headerType: "none", body: "{{1}} {{3}}", content: { bodyExamples: ["one", "three"] } }), /sequentially/);
  assert.throws(() => buildMetaTemplatePayload({ saveAs: "submit", name: "Bad", category: "Utility", language: "en_US", templateType: "standard", headerType: "none", body: "Hi {{1}}", footer: "{{1}}", content: { bodyExamples: ["one"] } }), /Footer text must be static/);
  assert.throws(() => buildMetaTemplatePayload({ saveAs: "submit", name: "Bad", category: "Utility", language: "en_US", templateType: "standard", headerType: "image", body: "Hi", content: { headerFileName: "image.jpg" } }), /media before submitting/);
  assert.throws(() => buildMetaTemplatePayload({ saveAs: "submit", name: "Bad", category: "Utility", language: "en_US", templateType: "carousel", headerType: "none", body: "Hi", content: {} }), /Carousel template creation is disabled/);
});
