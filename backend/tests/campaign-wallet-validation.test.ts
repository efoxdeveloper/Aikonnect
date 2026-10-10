import assert from "node:assert/strict";
import { test } from "node:test";
import { canCoverCampaignEstimate } from "../src/modules/campaigns/campaign-wallet-validation.js";

test("campaign wallet check accepts enough available funds", () => {
  assert.equal(canCoverCampaignEstimate({ availableBalance: "25.00", estimatedCost: "25.00" }), true);
  assert.equal(canCoverCampaignEstimate({ availableBalance: "40.00", estimatedCost: "25.00" }), true);
});

test("campaign wallet check rejects estimates above available funds", () => {
  assert.equal(canCoverCampaignEstimate({ availableBalance: "24.99", estimatedCost: "25.00" }), false);
});

test("campaign wallet check includes configured credit only when negative balance is allowed", () => {
  assert.equal(canCoverCampaignEstimate({ availableBalance: "10.00", estimatedCost: "15.00", allowNegativeBalance: true, creditLimit: "5.00" }), true);
  assert.equal(canCoverCampaignEstimate({ availableBalance: "10.00", estimatedCost: "15.01", allowNegativeBalance: true, creditLimit: "5.00" }), false);
  assert.equal(canCoverCampaignEstimate({ availableBalance: "10.00", estimatedCost: "15.00", allowNegativeBalance: false, creditLimit: "5.00" }), false);
});
