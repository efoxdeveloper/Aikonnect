import assert from "node:assert/strict";
import { test } from "node:test";
import { missingCampaignTemplateParameters, requiredCampaignCarouselMediaCount, unsupportedCampaignTemplateRequirement } from "../src/modules/campaigns/campaign-template-validation.js";

test("campaign templates reject dynamic components the sender cannot populate", () => {
  assert.match(unsupportedCampaignTemplateRequirement({
    category: "Marketing",
    headerText: "Hello {{1}}",
    content: {},
  }) ?? "", /text header/);
  assert.match(unsupportedCampaignTemplateRequirement({
    category: "Marketing",
    content: { metaComponents: [{ type: "BUTTONS", buttons: [{ type: "URL", url: "https://example.com/{{1}}" }] }] },
  }) ?? "", /website button URL/);
  assert.match(unsupportedCampaignTemplateRequirement({
    category: "Marketing",
    content: { metaComponents: [{ type: "BUTTONS", buttons: [{ type: "FLOW" }] }] },
  }) ?? "", /Flow button/);
  assert.match(unsupportedCampaignTemplateRequirement({ category: "Marketing", templateType: "multi-product", content: {} }) ?? "", /catalog parameters/);
  assert.equal(unsupportedCampaignTemplateRequirement({ category: "Marketing", content: { metaComponents: [{ type: "BODY", text: "Hello {{1}}" }] } }), null);
});

test("campaign carousel media count matches its template card count", () => {
  assert.equal(requiredCampaignCarouselMediaCount("carousel", { carouselCards: [{}, {}, {}] }), 3);
  assert.equal(requiredCampaignCarouselMediaCount("carousel", { metaComponents: [{ type: "CAROUSEL", cards: [{}, {}] }] }), 2);
  assert.equal(requiredCampaignCarouselMediaCount("standard", { carouselCards: [{}, {}] }), null);
});

test("campaign body parameters must resolve for every recipient unless a fallback is provided", () => {
  const contacts = [
    { id: "contact-1", name: "Asha", phoneE164: "+919000000001", email: null, source: "import", status: "ACTIVE", customAttributes: {} },
    { id: "contact-2", name: "", phoneE164: "+919000000002", email: null, source: "import", status: "ACTIVE", customAttributes: {} },
  ];
  const missing = missingCampaignTemplateParameters([
    { source: "contact", field: "name", fallback: "" },
    { source: "constant", field: "OFFER", fallback: "" },
  ], contacts);
  assert.deepEqual(missing, [{ index: 1, recipientCount: 1 }]);
  assert.deepEqual(missingCampaignTemplateParameters([{ source: "contact", field: "name", fallback: "Customer" }], contacts), []);
});
