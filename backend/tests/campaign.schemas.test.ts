import assert from "node:assert/strict";
import { test } from "node:test";
import { campaignControlSchema, campaignListQuerySchema, createCampaignSchema, estimateCampaignSchema } from "../src/modules/campaigns/campaign.schemas.js";

test("campaign controls accept pause, resume, and cancel actions only", () => {
  for (const action of ["pause", "resume", "cancel"] as const) assert.deepEqual(campaignControlSchema.parse({ action }), { action });
  assert.equal(campaignControlSchema.safeParse({ action: "delete" }).success, false);
});

test("create campaign schema applies defaults and deduplicates audience values", () => {
  const campaign = createCampaignSchema.parse({
    name: "  Spring offer  ",
    audienceLabel: "Manual audience",
    audienceType: "manual",
    phoneNumbers: ["+919876543210", "+919876543210"],
  });

  assert.equal(campaign.name, "Spring offer");
  assert.equal(campaign.kind, "one_time");
  assert.equal(campaign.category, "Marketing");
  assert.equal(campaign.audienceType, "manual");
  assert.deepEqual(campaign.phoneNumbers, ["+919876543210"]);
  assert.deepEqual(campaign.contactIds, []);
  assert.equal(campaign.launchMode, "draft");
});

test("create campaign schema accepts uploaded single and carousel media IDs", () => {
  const campaign = createCampaignSchema.parse({
    name: "Media campaign",
    audienceLabel: "Everyone",
    audienceConfig: {
      templateMedia: {
        kind: "carousel",
        items: [
          { mediaId: "meta-image-1", type: "image", fileName: "first.jpg" },
          { mediaId: "meta-image-2", type: "image", fileName: "second.jpg" },
        ],
      },
    },
  });

  assert.equal((campaign.audienceConfig.templateMedia as { kind: string }).kind, "carousel");
});

test("create campaign schema rejects an empty uploaded media collection", () => {
  assert.throws(
    () => createCampaignSchema.parse({
      name: "Missing media",
      audienceLabel: "Everyone",
      audienceConfig: { templateMedia: { kind: "single", items: [] } },
    }),
    /Campaign media must contain at least one uploaded media item/,
  );
});

test("create campaign schema validates audience and launch requirements", () => {
  assert.throws(
    () => createCampaignSchema.parse({
      name: "Missing audience",
      audienceLabel: "Manual audience",
      audienceType: "manual",
    }),
    /Add at least one phone number/,
  );

  assert.throws(
    () => createCampaignSchema.parse({
      name: "Missing schedule",
      audienceLabel: "Everyone",
      launchMode: "schedule",
    }),
    /A schedule time is required/,
  );

  assert.throws(
    () => createCampaignSchema.parse({
      name: "Bad phone",
      audienceLabel: "Manual audience",
      audienceType: "manual",
      phoneNumbers: ["9876543210"],
    }),
    /complete E\.164 numbers/,
  );
});

test("campaign estimate requires a valid send or schedule payload", () => {
  const estimate = estimateCampaignSchema.parse({ name: "Estimate", audienceLabel: "Everyone", templateKey: "approved", launchMode: "send" });
  assert.equal(estimate.launchMode, "send");
  assert.throws(() => estimateCampaignSchema.parse({ name: "Draft", audienceLabel: "Everyone", launchMode: "draft" }), /Invalid option/);
  assert.throws(() => estimateCampaignSchema.parse({ name: "No date", audienceLabel: "Everyone", launchMode: "schedule" }), /schedule time is required/);
});

test("campaign list query schema parses filters and rejects reversed dates", () => {
  const singleStatus = campaignListQuerySchema.parse({ status: "RUNNING" });
  assert.deepEqual(singleStatus.status, ["RUNNING"]);

  const query = campaignListQuerySchema.parse({
    page: "2",
    pageSize: "50",
    status: "DRAFT,RUNNING",
    hasSetLive: "false",
  });

  assert.equal(query.page, 2);
  assert.equal(query.pageSize, 50);
  assert.deepEqual(query.status, ["DRAFT", "RUNNING"]);
  assert.equal(query.hasSetLive, false);

  assert.throws(
    () => campaignListQuerySchema.parse({
      from: "2026-10-02T00:00:00.000Z",
      to: "2026-10-01T00:00:00.000Z",
    }),
    /start date must be before/,
  );
});
