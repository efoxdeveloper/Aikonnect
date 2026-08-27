import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { app } from "../src/app.js";
import { prisma } from "../src/database/prisma.js";

let server: Server;
let baseUrl: string;
const createdEmails: string[] = [];

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test API did not bind to TCP");
      baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
      resolve();
    });
  });
});

after(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } }, select: { id: true } });
  const userIds = users.map(({ id }) => id);
  if (userIds.length) {
    await prisma.workspace.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await prisma.$disconnect();
});

async function registerVerified(label: string) {
  const email = `contacts-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  createdEmails.push(email);
  const registrationResponse = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "ContactsIntegration123",
      firstName: "Contact",
      lastName: label,
      companyName: `${label} Contact Test`,
    }),
  });
  assert.equal(registrationResponse.status, 201);
  const registration = (await registrationResponse.json()) as {
    data: {
      accessToken: string;
      user: { id: string };
      workspace: { id: string };
      verificationUrl: string;
    };
  };
  const token = new URL(registration.data.verificationUrl).searchParams.get("token");
  assert.ok(token);
  const verificationResponse = await fetch(`${baseUrl}/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  assert.equal(verificationResponse.status, 200);
  return registration.data;
}

function authorized(token: string) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

test("contact APIs reject anonymous and invalid requests", async () => {
  const anonymous = await fetch(`${baseUrl}/workspaces/00000000-0000-4000-8000-000000000000/contacts`);
  assert.equal(anonymous.status, 401);

  const owner = await registerVerified("validation");
  const invalidWorkspace = await fetch(`${baseUrl}/workspaces/not-a-uuid/contacts`, {
    headers: authorized(owner.accessToken),
  });
  assert.equal(invalidWorkspace.status, 422);
  const invalidPhone = await fetch(`${baseUrl}/workspaces/${owner.workspace.id}/contacts`, {
    method: "POST",
    headers: authorized(owner.accessToken),
    body: JSON.stringify({ name: "Invalid", phone: "9876543210" }),
  });
  assert.equal(invalidPhone.status, 422);
  const body = (await invalidPhone.json()) as { error: { code: string } };
  assert.equal(body.error.code, "VALIDATION_ERROR");

  const invalidWhatsappId = await fetch(`${baseUrl}/workspaces/${owner.workspace.id}/contacts`, {
    method: "POST",
    headers: authorized(owner.accessToken),
    body: JSON.stringify({ name: "Invalid WhatsApp identity", phone: "+919100000090", whatsappId: "invalid id" }),
  });
  assert.equal(invalidWhatsappId.status, 422);

  const invalidPageSize = await fetch(
    `${baseUrl}/workspaces/${owner.workspace.id}/contacts?pageSize=101`,
    { headers: authorized(owner.accessToken) },
  );
  assert.equal(invalidPageSize.status, 422);

  const invalidSort = await fetch(
    `${baseUrl}/workspaces/${owner.workspace.id}/contacts?sortBy=tags&sortOrder=sideways`,
    { headers: authorized(owner.accessToken) },
  );
  assert.equal(invalidSort.status, 422);

  const duplicateSortRules = encodeURIComponent(JSON.stringify([
    { field: "source", direction: "asc" },
    { field: "source", direction: "desc" },
  ]));
  const invalidMultiSort = await fetch(
    `${baseUrl}/workspaces/${owner.workspace.id}/contacts?sort=${duplicateSortRules}`,
    { headers: authorized(owner.accessToken) },
  );
  assert.equal(invalidMultiSort.status, 422);

  const invalidSegment = await fetch(`${baseUrl}/workspaces/${owner.workspace.id}/contacts/segments`, {
    method: "POST",
    headers: authorized(owner.accessToken),
    body: JSON.stringify({ name: "Invalid segment", conditions: [] }),
  });
  assert.equal(invalidSegment.status, 422);

  const invalidSegmentFilter = await fetch(
    `${baseUrl}/workspaces/${owner.workspace.id}/contacts?segmentConditions=not-json`,
    { headers: authorized(owner.accessToken) },
  );
  assert.equal(invalidSegmentFilter.status, 422);
});

test("contacts support workspace isolation, indexed filters, pagination, imports and RBAC", async () => {
  const owner = await registerVerified("owner");
  const viewer = await registerVerified("viewer");
  const headers = authorized(owner.accessToken);
  const endpoint = `${baseUrl}/workspaces/${owner.workspace.id}/contacts`;

  const invalidSelectField = await fetch(`${endpoint}/custom-fields`, {
    method: "POST",
    headers,
    body: JSON.stringify({ label: "Invalid select", type: "SELECT", options: [] }),
  });
  assert.equal(invalidSelectField.status, 422);

  const createField = async (input: Record<string, unknown>) => {
    const response = await fetch(`${endpoint}/custom-fields`, { method: "POST", headers, body: JSON.stringify(input) });
    assert.equal(response.status, 201);
    return (await response.json()) as { data: { id: string; key: string; label: string; type: string; options: string[]; required: boolean; position: number; archivedAt: string | null } };
  };
  const tierField = await createField({ label: "Customer Tier", key: "tier", type: "NUMBER" });
  const cityField = await createField({ label: "City", type: "TEXT" });
  const statusField = await createField({ label: "Lead Status", key: "lead_status", type: "SELECT", options: ["New", "Qualified"] });
  assert.equal(tierField.data.key, "tier");
  assert.equal(cityField.data.key, "city");
  assert.deepEqual(statusField.data.options, ["New", "Qualified"]);

  const duplicateField = await fetch(`${endpoint}/custom-fields`, {
    method: "POST",
    headers,
    body: JSON.stringify({ label: "customer tier", type: "TEXT" }),
  });
  assert.equal(duplicateField.status, 409);

  const updatedStatusField = await fetch(`${endpoint}/custom-fields/${statusField.data.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ label: "Sales Status", options: ["New", "Qualified", "Won"] }),
  });
  assert.equal(updatedStatusField.status, 200);
  const updatedStatusFieldBody = (await updatedStatusField.json()) as { data: { label: string; options: string[] } };
  assert.equal(updatedStatusFieldBody.data.label, "Sales Status");
  assert.deepEqual(updatedStatusFieldBody.data.options, ["New", "Qualified", "Won"]);

  const reorderedFields = await fetch(`${endpoint}/custom-fields/order`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ fieldIds: [statusField.data.id, tierField.data.id, cityField.data.id] }),
  });
  assert.equal(reorderedFields.status, 200);
  const reorderedFieldsBody = (await reorderedFields.json()) as { data: Array<{ id: string }> };
  assert.deepEqual(reorderedFieldsBody.data.map(({ id }) => id), [statusField.data.id, tierField.data.id, cityField.data.id]);

  const archivedField = await fetch(`${endpoint}/custom-fields/${cityField.data.id}`, { method: "DELETE", headers });
  assert.equal(archivedField.status, 204);
  const activeFields = await fetch(`${endpoint}/custom-fields`, { headers });
  const activeFieldsBody = (await activeFields.json()) as { data: Array<{ id: string }> };
  assert.deepEqual(activeFieldsBody.data.map(({ id }) => id), [statusField.data.id, tierField.data.id]);
  const allFields = await fetch(`${endpoint}/custom-fields?includeArchived=true`, { headers });
  const allFieldsBody = (await allFields.json()) as { data: Array<{ id: string; archivedAt: string | null }> };
  assert.equal(allFieldsBody.data.find(({ id }) => id === cityField.data.id)?.archivedAt !== null, true);
  await createField({ label: "Renewal Date", key: "renewal_date", type: "DATE" });
  await createField({ label: "Interests", key: "interests", type: "MULTI_SELECT", options: ["Sales", "Marketing", "Support"] });

  const inputs = [
    {
      name: "Aarav Retail",
      phone: "+919100000001",
      email: "AARAV@example.com",
      source: "WhatsApp",
      whatsappId: "919100000001",
      profileName: "Aarav on WhatsApp",
      tags: ["VIP", "North"],
      customAttributes: { tier: 3, lead_status: "Won", renewal_date: "2026-09-15", interests: ["Sales", "Marketing"] },
    },
    { name: "Bhavna Support", phone: "+919100000002", whatsappId: "919100000002", source: "Manual", tags: ["North"], customAttributes: { tier: 1, lead_status: "Qualified", renewal_date: "2026-08-10", interests: ["Support"] } },
    { name: "Chirag Sales", phone: "+919100000003", source: "Manual", tags: ["Lead"], customAttributes: { tier: 5, lead_status: "New", renewal_date: "2026-10-01", interests: ["Sales"] } },
  ];
  const contactIds: string[] = [];
  for (const input of inputs) {
    const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(input) });
    assert.equal(response.status, 201);
    const body = (await response.json()) as { data: { id: string; phone: string; whatsappId: string | null; profileName: string | null; email: string | null } };
    contactIds.push(body.data.id);
    assert.equal(body.data.phone, input.phone);
    assert.equal(body.data.whatsappId, input.whatsappId ?? null);
    assert.equal(body.data.profileName, input.profileName ?? null);
  }

  const initialConsent = await fetch(`${endpoint}/${contactIds[0]}`, { headers });
  const initialConsentBody = (await initialConsent.json()) as { data: { whatsappOpted: boolean; whatsappOptInSource: string; whatsappOptedInAt: string; marketingBlocked: boolean; marketingEligible: boolean } };
  assert.equal(initialConsentBody.data.whatsappOpted, true);
  assert.equal(initialConsentBody.data.whatsappOptInSource, "Manual");
  assert.ok(initialConsentBody.data.whatsappOptedInAt);
  assert.equal(initialConsentBody.data.marketingBlocked, false);
  assert.equal(initialConsentBody.data.marketingEligible, true);

  const optedOutAt = new Date(Date.now() - 1_000).toISOString();
  const optedOut = await fetch(`${endpoint}/${contactIds[0]}`, {
    method: "PATCH", headers,
    body: JSON.stringify({ whatsappOpted: false, whatsappConsentSource: "WhatsApp keyword STOP", whatsappConsentAt: optedOutAt }),
  });
  assert.equal(optedOut.status, 200);
  const optedOutBody = (await optedOut.json()) as { data: { whatsappOpted: boolean; whatsappOptOutSource: string; whatsappOptedOutAt: string; marketingBlocked: boolean; marketingEligible: boolean } };
  assert.equal(optedOutBody.data.whatsappOpted, false);
  assert.equal(optedOutBody.data.whatsappOptOutSource, "WhatsApp keyword STOP");
  assert.equal(optedOutBody.data.whatsappOptedOutAt, optedOutAt);
  assert.equal(optedOutBody.data.marketingBlocked, true);
  assert.equal(optedOutBody.data.marketingEligible, false);

  const illegalUnblock = await fetch(`${endpoint}/${contactIds[0]}`, { method: "PATCH", headers, body: JSON.stringify({ marketingBlocked: false }) });
  assert.equal(illegalUnblock.status, 422, "opted-out contacts must not be unblocked for marketing");
  const optedOutEligibility = await fetch(`${endpoint}/marketing/eligibility`, { method: "POST", headers, body: JSON.stringify({ contactIds: [contactIds[0], contactIds[1]] }) });
  assert.equal(optedOutEligibility.status, 200);
  const optedOutEligibilityBody = (await optedOutEligibility.json()) as { data: { eligibleContactIds: string[]; excluded: Array<{ contactId: string; reason: string }> } };
  assert.deepEqual(optedOutEligibilityBody.data.eligibleContactIds, [contactIds[1]]);
  assert.deepEqual(optedOutEligibilityBody.data.excluded, [{ contactId: contactIds[0], reason: "OPTED_OUT" }]);

  const optedBackIn = await fetch(`${endpoint}/${contactIds[0]}`, { method: "PATCH", headers, body: JSON.stringify({ whatsappOpted: true, whatsappConsentSource: "Website consent form", whatsappConsentAt: new Date().toISOString() }) });
  assert.equal(optedBackIn.status, 200);
  const blocked = await fetch(`${endpoint}/${contactIds[0]}`, { method: "PATCH", headers, body: JSON.stringify({ marketingBlocked: true, marketingBlockSource: "Abuse review", marketingBlockReason: "Reported spam" }) });
  assert.equal(blocked.status, 200);
  const blockedEligibility = await fetch(`${endpoint}/marketing/eligibility`, { method: "POST", headers, body: JSON.stringify({ contactIds: [contactIds[0]] }) });
  const blockedEligibilityBody = (await blockedEligibility.json()) as { data: { excluded: Array<{ reason: string }> } };
  assert.deepEqual(blockedEligibilityBody.data.excluded, [{ contactId: contactIds[0], reason: "MARKETING_BLOCKED" }]);
  const unblocked = await fetch(`${endpoint}/${contactIds[0]}`, { method: "PATCH", headers, body: JSON.stringify({ marketingBlocked: false, marketingBlockSource: "Compliance review" }) });
  assert.equal(unblocked.status, 200);
  const eligibleList = await fetch(`${endpoint}?marketingEligible=true`, { headers });
  const eligibleListBody = (await eligibleList.json()) as { data: { pagination: { total: number } } };
  assert.equal(eligibleListBody.data.pagination.total, 3);
  const consentEvents = await prisma.contactConsentEvent.findMany({ where: { contactId: contactIds[0] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { type: true, source: true } });
  assert.deepEqual(consentEvents.map(({ type }) => type), ["OPT_IN", "OPT_OUT", "OPT_IN", "BLOCK", "UNBLOCK"]);

  const duplicate = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Duplicate", phone: inputs[0]?.phone }),
  });
  assert.equal(duplicate.status, 409);
  const duplicateBody = (await duplicate.json()) as { error: { code: string } };
  assert.equal(duplicateBody.error.code, "CONTACT_PHONE_EXISTS");

  const duplicateWhatsappId = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Duplicate WhatsApp identity", phone: "+919100000010", whatsappId: inputs[0]?.whatsappId }),
  });
  assert.equal(duplicateWhatsappId.status, 409);
  const duplicateWhatsappBody = (await duplicateWhatsappId.json()) as { error: { code: string } };
  assert.equal(duplicateWhatsappBody.error.code, "CONTACT_WHATSAPP_ID_EXISTS");

  const invalidCustomValue = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Invalid custom value", phone: "+919100000011", customAttributes: { tier: "gold" } }),
  });
  assert.equal(invalidCustomValue.status, 422);
  const invalidCustomValueBody = (await invalidCustomValue.json()) as { error: { code: string } };
  assert.equal(invalidCustomValueBody.error.code, "CONTACT_CUSTOM_FIELD_VALUE_INVALID");

  const invalidCustomDate = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Invalid custom date", phone: "+919100000013", customAttributes: { renewal_date: "2026-02-31" } }),
  });
  assert.equal(invalidCustomDate.status, 422);

  const unknownCustomField = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Unknown custom field", phone: "+919100000012", customAttributes: { unknown_field: "value" } }),
  });
  assert.equal(unknownCustomField.status, 422);

  const sameIdentityOtherWorkspace = await fetch(`${baseUrl}/workspaces/${viewer.workspace.id}/contacts`, {
    method: "POST",
    headers: authorized(viewer.accessToken),
    body: JSON.stringify({ name: "Same WA ID in another workspace", phone: "+919200000001", whatsappId: inputs[0]?.whatsappId }),
  });
  assert.equal(sameIdentityOtherWorkspace.status, 201, "WhatsApp IDs must be isolated by workspace");
  const otherWorkspaceContactId = ((await sameIdentityOtherWorkspace.json()) as { data: { id: string } }).data.id;

  const conversationResponse = await fetch(`${endpoint}/${contactIds[0]}/conversations`, {
    method: "POST", headers, body: JSON.stringify({ channelKey: "whatsapp" }),
  });
  assert.equal(conversationResponse.status, 201);
  const conversationBody = (await conversationResponse.json()) as { data: { id: string; workspaceId: string; contactId: string } };
  assert.equal(conversationBody.data.workspaceId, owner.workspace.id);
  assert.equal(conversationBody.data.contactId, contactIds[0]);

  const createMessage = (body: Record<string, unknown>) => fetch(
    `${endpoint}/${contactIds[0]}/conversations/${conversationBody.data.id}/messages`,
    { method: "POST", headers, body: JSON.stringify(body) },
  );
  const incomingMessage = await createMessage({ direction: "INCOMING", type: "TEXT", text: "Hello from WhatsApp", metaMessageId: "wamid-owner-history-1" });
  assert.equal(incomingMessage.status, 201);
  const outgoingMessage = await createMessage({ direction: "OUTGOING", type: "TEXT", text: "Hello back" });
  assert.equal(outgoingMessage.status, 201);
  const duplicateMessage = await createMessage({ direction: "INCOMING", type: "TEXT", text: "Duplicate webhook", metaMessageId: "wamid-owner-history-1" });
  assert.equal(duplicateMessage.status, 201);
  const duplicateMessageBody = (await duplicateMessage.json()) as { data: { deduplicated: boolean } };
  assert.equal(duplicateMessageBody.data.deduplicated, true);

  const history = await fetch(`${endpoint}/${contactIds[0]}/conversations/history?page=1&pageSize=100`, { headers });
  assert.equal(history.status, 200);
  const historyBody = (await history.json()) as { data: { messages: Array<{ text: string | null }> } };
  assert.deepEqual(historyBody.data.messages.map(({ text }) => text), ["Hello from WhatsApp", "Hello back"]);

  const crossWorkspaceHistory = await fetch(`${baseUrl}/workspaces/${viewer.workspace.id}/contacts/${contactIds[0]}/conversations/history`, { headers: authorized(viewer.accessToken) });
  assert.equal(crossWorkspaceHistory.status, 404, "conversation history must be workspace isolated");
  const crossWorkspaceMessages = await fetch(`${baseUrl}/workspaces/${viewer.workspace.id}/contacts/${otherWorkspaceContactId}/conversations/${conversationBody.data.id}/messages`, { headers: authorized(viewer.accessToken) });
  assert.equal(crossWorkspaceMessages.status, 404, "message history must be workspace isolated");

  const firstPage = await fetch(`${endpoint}?page=1&pageSize=2&sortBy=name&sortOrder=asc`, { headers });
  const firstPageBody = (await firstPage.json()) as {
    data: { items: Array<{ name: string }>; pagination: { total: number; totalPages: number; hasNext: boolean } };
    error?: { message: string; stack?: string };
  };
  assert.equal(firstPage.status, 200, JSON.stringify(firstPageBody.error));
  assert.deepEqual(firstPageBody.data.items.map(({ name }) => name), ["Aarav Retail", "Bhavna Support"]);
  assert.deepEqual(firstPageBody.data.pagination, {
    page: 1,
    pageSize: 2,
    total: 3,
    totalPages: 2,
    hasNext: true,
    hasPrevious: false,
  });

  const sourceSorted = await fetch(`${endpoint}?page=1&pageSize=10&sortBy=source&sortOrder=asc`, { headers });
  assert.equal(sourceSorted.status, 200);
  const sourceSortedBody = (await sourceSorted.json()) as { data: { items: Array<{ name: string }> } };
  assert.deepEqual(
    sourceSortedBody.data.items.slice(0, 2).map(({ name }) => name).sort(),
    ["Bhavna Support", "Chirag Sales"],
  );
  assert.equal(sourceSortedBody.data.items[2]?.name, "Aarav Retail");

  const multiSortRules = encodeURIComponent(JSON.stringify([
    { field: "source", direction: "asc" },
    { field: "name", direction: "desc" },
  ]));
  const multiSorted = await fetch(`${endpoint}?page=1&pageSize=10&sort=${multiSortRules}`, { headers });
  assert.equal(multiSorted.status, 200);
  const multiSortedBody = (await multiSorted.json()) as { data: { items: Array<{ name: string }> } };
  assert.deepEqual(multiSortedBody.data.items.map(({ name }) => name), ["Chirag Sales", "Bhavna Support", "Aarav Retail"]);

  const emailSorted = await fetch(`${endpoint}?page=1&pageSize=10&sortBy=email&sortOrder=asc`, { headers });
  assert.equal(emailSorted.status, 200);
  const emailSortedBody = (await emailSorted.json()) as { data: { items: Array<{ name: string; email: string | null }> } };
  assert.equal(emailSortedBody.data.items[0]?.name, "Aarav Retail");
  assert.equal(emailSortedBody.data.items.at(-1)?.email, null, "nullable sort values should be placed last");

  const filtered = await fetch(
    `${endpoint}?search=aarav&sources=WhatsApp&tags=vip,north&tagMode=all&hasEmail=true`,
    { headers },
  );
  assert.equal(filtered.status, 200);
  const filteredBody = (await filtered.json()) as { data: { items: Array<{ name: string; email: string }> } };
  assert.equal(filteredBody.data.items.length, 1);
  assert.equal(filteredBody.data.items[0]?.name, "Aarav Retail");
  assert.equal(filteredBody.data.items[0]?.email, "aarav@example.com");

  const filterByConditions = async (conditions: unknown[]) => {
    const response = await fetch(`${endpoint}?page=1&pageSize=20&sortBy=name&sortOrder=asc&segmentConditions=${encodeURIComponent(JSON.stringify(conditions))}`, { headers });
    const body = (await response.json()) as { data?: { items: Array<{ name: string }>; pagination: { total: number } }; error?: { code: string } };
    return { response, body };
  };
  const numericCustomFilter = await filterByConditions([{ type: "custom_field", field: "tier", operator: "greater_than", value: 2 }]);
  assert.equal(numericCustomFilter.response.status, 200);
  assert.deepEqual(numericCustomFilter.body.data?.items.map(({ name }) => name), ["Aarav Retail", "Chirag Sales"]);
  const selectCustomFilter = await filterByConditions([{ type: "custom_field", field: "lead_status", operator: "is", value: "Won" }]);
  assert.deepEqual(selectCustomFilter.body.data?.items.map(({ name }) => name), ["Aarav Retail"]);
  const dateCustomFilter = await filterByConditions([{ type: "custom_field", field: "renewal_date", operator: "before", value: "2026-09-01" }]);
  assert.deepEqual(dateCustomFilter.body.data?.items.map(({ name }) => name), ["Bhavna Support"]);
  const multiCustomFilter = await filterByConditions([{ type: "custom_field", field: "interests", operator: "contains", value: "Sales" }]);
  assert.deepEqual(multiCustomFilter.body.data?.items.map(({ name }) => name), ["Aarav Retail", "Chirag Sales"]);
  const optedFilter = await filterByConditions([{ type: "field", field: "whatsappOpted", operator: "is", value: true }]);
  assert.equal(optedFilter.body.data?.pagination.total, 3);
  const invalidCustomFilter = await filterByConditions([{ type: "custom_field", field: "lead_status", operator: "is", value: "Missing" }]);
  assert.equal(invalidCustomFilter.response.status, 422);

  const profileSearch = await fetch(`${endpoint}?search=${encodeURIComponent("Aarav on WhatsApp")}`, { headers });
  assert.equal(profileSearch.status, 200);
  const profileSearchBody = (await profileSearch.json()) as { data: { pagination: { total: number } } };
  assert.equal(profileSearchBody.data.pagination.total, 1);

  const whatsappIdSearch = await fetch(`${endpoint}?search=919100000001`, { headers });
  assert.equal(whatsappIdSearch.status, 200);
  const whatsappIdSearchBody = (await whatsappIdSearch.json()) as { data: { pagination: { total: number } } };
  assert.equal(whatsappIdSearchBody.data.pagination.total, 1);

  const tagsOnlyUpdate = await fetch(`${endpoint}/${contactIds[0]}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ tags: ["VIP", "North", "Retained Identity"] }),
  });
  assert.equal(tagsOnlyUpdate.status, 200);
  const tagsOnlyUpdateBody = (await tagsOnlyUpdate.json()) as {
    data: { email: string | null; whatsappId: string | null; profileName: string | null };
  };
  assert.equal(tagsOnlyUpdateBody.data.email, "aarav@example.com");
  assert.equal(tagsOnlyUpdateBody.data.whatsappId, "919100000001");
  assert.equal(tagsOnlyUpdateBody.data.profileName, "Aarav on WhatsApp");

  const segmentConditions = [
    { type: "tag", field: "tags", operator: "is", value: "VIP" },
    { type: "field", field: "source", operator: "contains", value: "what" },
  ];
  const createdSegment = await fetch(`${endpoint}/segments`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "VIP WhatsApp contacts", conditions: segmentConditions }),
  });
  assert.equal(createdSegment.status, 201);
  const createdSegmentBody = (await createdSegment.json()) as {
    data: { id: string; name: string; conditions: typeof segmentConditions };
  };
  assert.equal(createdSegmentBody.data.name, "VIP WhatsApp contacts");
  assert.deepEqual(createdSegmentBody.data.conditions, segmentConditions);

  const customSegment = await fetch(`${endpoint}/segments`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "High-value sales leads", conditions: [{ type: "custom_field", field: "tier", operator: "greater_than_or_equal", value: 3 }, { type: "custom_field", field: "interests", operator: "contains", value: "Sales" }] }),
  });
  assert.equal(customSegment.status, 201);
  const invalidCustomSegment = await fetch(`${endpoint}/segments`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Invalid custom segment", conditions: [{ type: "custom_field", field: "unknown_field", operator: "is", value: "x" }] }),
  });
  assert.equal(invalidCustomSegment.status, 422);

  const invalidSegmentUpdate = await fetch(`${endpoint}/segments/${createdSegmentBody.data.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ name: "Invalid update", conditions: [] }),
  });
  assert.equal(invalidSegmentUpdate.status, 422);

  const duplicateSegment = await fetch(`${endpoint}/segments`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "vip whatsapp CONTACTS", conditions: segmentConditions }),
  });
  assert.equal(duplicateSegment.status, 409);
  const duplicateSegmentBody = (await duplicateSegment.json()) as { error: { code: string } };
  assert.equal(duplicateSegmentBody.error.code, "CONTACT_SEGMENT_NAME_EXISTS");

  const segmentList = await fetch(`${endpoint}/segments?search=whatsapp&page=1&pageSize=10`, { headers });
  assert.equal(segmentList.status, 200);
  const segmentListBody = (await segmentList.json()) as {
    data: { items: Array<{ id: string; name: string }>; pagination: { total: number } };
  };
  assert.equal(segmentListBody.data.pagination.total, 1);
  assert.equal(segmentListBody.data.items[0]?.id, createdSegmentBody.data.id);

  const updatedSegmentConditions = [
    { type: "field", field: "name", operator: "contains", value: "Aarav" },
  ];
  const updatedSegment = await fetch(`${endpoint}/segments/${createdSegmentBody.data.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ name: "VIP WhatsApp customers", conditions: updatedSegmentConditions }),
  });
  assert.equal(updatedSegment.status, 200);
  const updatedSegmentBody = (await updatedSegment.json()) as {
    data: { id: string; name: string; conditions: typeof updatedSegmentConditions };
  };
  assert.equal(updatedSegmentBody.data.id, createdSegmentBody.data.id);
  assert.equal(updatedSegmentBody.data.name, "VIP WhatsApp customers");
  assert.deepEqual(updatedSegmentBody.data.conditions, updatedSegmentConditions);

  const secondarySegment = await fetch(`${endpoint}/segments`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Secondary segment", conditions: segmentConditions }),
  });
  assert.equal(secondarySegment.status, 201);
  const secondarySegmentBody = (await secondarySegment.json()) as { data: { id: string } };
  const duplicateSegmentUpdate = await fetch(`${endpoint}/segments/${secondarySegmentBody.data.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ name: "vip whatsapp CUSTOMERS", conditions: segmentConditions }),
  });
  assert.equal(duplicateSegmentUpdate.status, 409);

  const encodedSegmentConditions = encodeURIComponent(JSON.stringify(segmentConditions));
  const segmentedContacts = await fetch(`${endpoint}?segmentConditions=${encodedSegmentConditions}`, { headers });
  assert.equal(segmentedContacts.status, 200);
  const segmentedContactsBody = (await segmentedContacts.json()) as {
    data: { items: Array<{ name: string }>; pagination: { total: number } };
  };
  assert.equal(segmentedContactsBody.data.pagination.total, 1);
  assert.equal(segmentedContactsBody.data.items[0]?.name, "Aarav Retail");

  const bulkTag = await fetch(`${endpoint}/bulk/tags`, {
    method: "POST",
    headers,
    body: JSON.stringify({ contactIds: [contactIds[1], contactIds[2]], add: ["Qualified"], remove: ["North"] }),
  });
  assert.equal(bulkTag.status, 200);

  const chiragOptOut = await fetch(`${endpoint}/${contactIds[2]}`, { method: "PATCH", headers, body: JSON.stringify({ whatsappOpted: false, whatsappConsentSource: "Support request" }) });
  assert.equal(chiragOptOut.status, 200);

  const imported = await fetch(`${endpoint}/import`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      duplicatePolicy: "update",
      contacts: [
        { name: "Updated Chirag", phone: "+919100000003", source: "Import", tags: ["Imported"] },
        { name: "Old Duplicate", phone: "+919100000004", tags: [] },
        { name: "Imported Final", phone: "+919100000004", tags: ["Imported"] },
      ],
    }),
  });
  assert.equal(imported.status, 201);
  const importBody = (await imported.json()) as {
    data: { summary: { total: number; created: number; updated: number; skipped: number } };
  };
  assert.deepEqual(importBody.data.summary, { total: 3, created: 1, updated: 1, skipped: 1 });
  const importedChirag = await fetch(`${endpoint}/${contactIds[2]}`, { headers });
  const importedChiragBody = (await importedChirag.json()) as { data: { whatsappOpted: boolean; marketingBlocked: boolean; whatsappOptOutSource: string } };
  assert.equal(importedChiragBody.data.whatsappOpted, false, "an import update must not silently re-opt a contact");
  assert.equal(importedChiragBody.data.marketingBlocked, true);
  assert.equal(importedChiragBody.data.whatsappOptOutSource, "Support request");

  const taskResponse = await fetch(`${endpoint}/${contactIds[0]}/tasks`, {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "Call customer", description: "Discuss the renewal", dueAt: "2026-08-30T10:00:00.000Z" }),
  });
  assert.equal(taskResponse.status, 201);
  const taskBody = (await taskResponse.json()) as { data: { id: string; status: string } };
  assert.equal(taskBody.data.status, "OPEN");
  const invalidTask = await fetch(`${endpoint}/${contactIds[0]}/tasks`, { method: "POST", headers, body: JSON.stringify({ title: "" }) });
  assert.equal(invalidTask.status, 422);
  const completedTask = await fetch(`${endpoint}/${contactIds[0]}/tasks/${taskBody.data.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status: "COMPLETED" }),
  });
  assert.equal(completedTask.status, 200);
  const completedTaskBody = (await completedTask.json()) as { data: { status: string; completedAt: string | null } };
  assert.equal(completedTaskBody.data.status, "COMPLETED");
  assert.ok(completedTaskBody.data.completedAt);

  const noteResponse = await fetch(`${endpoint}/${contactIds[0]}/notes`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content: "Renewal discussion\nCustomer requested a callback." }),
  });
  assert.equal(noteResponse.status, 201);
  const noteBody = (await noteResponse.json()) as { data: { id: string; title: string } };
  assert.equal(noteBody.data.title, "Renewal discussion");
  const noteList = await fetch(`${endpoint}/${contactIds[0]}/notes?page=1&pageSize=10`, { headers });
  assert.equal(noteList.status, 200);
  const noteListBody = (await noteList.json()) as { data: { items: Array<{ id: string }>; pagination: { total: number } } };
  assert.equal(noteListBody.data.pagination.total, 1);
  assert.equal(noteListBody.data.items[0]?.id, noteBody.data.id);
  const updatedNote = await fetch(`${endpoint}/${contactIds[0]}/notes/${noteBody.data.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ content: "Updated renewal note\nFollow up tomorrow." }),
  });
  assert.equal(updatedNote.status, 200);
  const updatedNoteBody = (await updatedNote.json()) as { data: { title: string; content: string } };
  assert.equal(updatedNoteBody.data.title, "Updated renewal note");
  assert.equal(updatedNoteBody.data.content, "Updated renewal note\nFollow up tomorrow.");
  const invalidNoteUpdate = await fetch(`${endpoint}/${contactIds[0]}/notes/${noteBody.data.id}`, { method: "PATCH", headers, body: JSON.stringify({}) });
  assert.equal(invalidNoteUpdate.status, 422);

  const readPermission = await prisma.permission.findUniqueOrThrow({
    where: { key: "contacts.read" },
    select: { id: true },
  });
  const viewerRole = await prisma.role.create({
    data: {
      workspaceId: owner.workspace.id,
      name: "Masked contact viewer",
      slug: `masked-viewer-${Date.now()}`,
      permissions: { create: { permissionId: readPermission.id } },
    },
    select: { id: true },
  });
  await prisma.workspaceMember.create({
    data: { workspaceId: owner.workspace.id, userId: viewer.user.id, roleId: viewerRole.id },
  });
  const viewerHeaders = authorized(viewer.accessToken);
  const viewerCustomFields = await fetch(`${endpoint}/custom-fields`, { headers: viewerHeaders });
  assert.equal(viewerCustomFields.status, 403, "custom-field definitions require field-view permission");
  const viewerCustomConditions = encodeURIComponent(JSON.stringify([{ type: "custom_field", field: "tier", operator: "greater_than", value: 1 }]));
  const viewerCustomFilter = await fetch(`${endpoint}?segmentConditions=${viewerCustomConditions}`, { headers: viewerHeaders });
  assert.equal(viewerCustomFilter.status, 403, "custom-field filters require field-view permission");
  const viewerList = await fetch(`${endpoint}?search=%2B919100000001`, { headers: viewerHeaders });
  assert.equal(viewerList.status, 200);
  const viewerListBody = (await viewerList.json()) as { data: { items: unknown[] } };
  assert.equal(viewerListBody.data.items.length, 0, "phone search must not leak matches without phone visibility");

  const viewerPhoneSort = await fetch(`${endpoint}?sortBy=phone&sortOrder=asc`, { headers: viewerHeaders });
  assert.equal(viewerPhoneSort.status, 403, "phone sorting must not leak ordering without phone visibility");

  const viewerMultiPhoneSort = encodeURIComponent(JSON.stringify([
    { field: "source", direction: "asc" },
    { field: "phone", direction: "asc" },
  ]));
  const viewerMultiSort = await fetch(`${endpoint}?sort=${viewerMultiPhoneSort}`, { headers: viewerHeaders });
  assert.equal(viewerMultiSort.status, 403, "secondary phone sorting must also enforce phone visibility");

  const viewerSegments = await fetch(`${endpoint}/segments?search=whatsapp`, { headers: viewerHeaders });
  assert.equal(viewerSegments.status, 200, "members with contacts.read may search saved segments");

  const viewerSegmentCreate = await fetch(`${endpoint}/segments`, {
    method: "POST",
    headers: viewerHeaders,
    body: JSON.stringify({ name: "Forbidden segment", conditions: segmentConditions }),
  });
  assert.equal(viewerSegmentCreate.status, 403);

  const viewerSegmentUpdate = await fetch(`${endpoint}/segments/${createdSegmentBody.data.id}`, {
    method: "PATCH",
    headers: viewerHeaders,
    body: JSON.stringify({ name: "Forbidden edit", conditions: segmentConditions }),
  });
  assert.equal(viewerSegmentUpdate.status, 403);

  const viewerSegmentDelete = await fetch(`${endpoint}/segments/${createdSegmentBody.data.id}`, {
    method: "DELETE",
    headers: viewerHeaders,
  });
  assert.equal(viewerSegmentDelete.status, 403);

  const crossWorkspaceSegmentDelete = await fetch(
    `${baseUrl}/workspaces/${viewer.workspace.id}/contacts/segments/${createdSegmentBody.data.id}`,
    { method: "DELETE", headers: viewerHeaders },
  );
  assert.equal(crossWorkspaceSegmentDelete.status, 404);

  const crossWorkspaceFieldUpdate = await fetch(
    `${baseUrl}/workspaces/${viewer.workspace.id}/contacts/custom-fields/${tierField.data.id}`,
    { method: "PATCH", headers: viewerHeaders, body: JSON.stringify({ label: "Cross workspace edit" }) },
  );
  assert.equal(crossWorkspaceFieldUpdate.status, 404);

  const phoneSegment = encodeURIComponent(JSON.stringify([
    { type: "field", field: "phone", operator: "is", value: inputs[0]?.phone },
  ]));
  const viewerPhoneSegment = await fetch(`${endpoint}?segmentConditions=${phoneSegment}`, { headers: viewerHeaders });
  assert.equal(viewerPhoneSegment.status, 200);
  const viewerPhoneSegmentBody = (await viewerPhoneSegment.json()) as { data: { items: unknown[] } };
  assert.equal(viewerPhoneSegmentBody.data.items.length, 0, "phone segments must not leak matches without phone visibility");

  const forbiddenEligibility = await fetch(`${endpoint}/marketing/eligibility`, { method: "POST", headers: viewerHeaders, body: JSON.stringify({ contactIds: [contactIds[0]] }) });
  assert.equal(forbiddenEligibility.status, 403, "campaign eligibility requires campaigns.send permission");

  const viewerContact = await fetch(`${endpoint}/${contactIds[0]}`, { headers: viewerHeaders });
  assert.equal(viewerContact.status, 200);
  const viewerContactBody = (await viewerContact.json()) as {
    data: { phone: string | null; whatsappId: string | null; hasWhatsappId: boolean; profileName: string | null; customAttributes?: unknown; hasPhone: boolean };
  };
  assert.equal(viewerContactBody.data.phone, null);
  assert.equal(viewerContactBody.data.hasPhone, true);
  assert.equal(viewerContactBody.data.whatsappId, null);
  assert.equal(viewerContactBody.data.hasWhatsappId, true);
  assert.equal(viewerContactBody.data.profileName, "Aarav on WhatsApp");
  assert.equal("customAttributes" in viewerContactBody.data, false);

  const forbiddenCreate = await fetch(endpoint, {
    method: "POST",
    headers: viewerHeaders,
    body: JSON.stringify({ name: "Forbidden", phone: "+919100000099" }),
  });
  assert.equal(forbiddenCreate.status, 403);
  const forbiddenBody = (await forbiddenCreate.json()) as { error: { code: string } };
  assert.equal(forbiddenBody.error.code, "PERMISSION_DENIED");

  const forbiddenTask = await fetch(`${endpoint}/${contactIds[0]}/tasks`, {
    method: "POST",
    headers: viewerHeaders,
    body: JSON.stringify({ title: "Forbidden task" }),
  });
  assert.equal(forbiddenTask.status, 403);
  const forbiddenNoteUpdate = await fetch(`${endpoint}/${contactIds[0]}/notes/${noteBody.data.id}`, {
    method: "PATCH",
    headers: viewerHeaders,
    body: JSON.stringify({ content: "Forbidden edit" }),
  });
  assert.equal(forbiddenNoteUpdate.status, 403);

  const forbiddenDelete = await fetch(`${endpoint}/bulk/delete`, {
    method: "POST",
    headers: viewerHeaders,
    body: JSON.stringify({ contactIds: [contactIds[0]] }),
  });
  assert.equal(forbiddenDelete.status, 403);

  const deletedSegment = await fetch(`${endpoint}/segments/${createdSegmentBody.data.id}`, {
    method: "DELETE",
    headers,
  });
  assert.equal(deletedSegment.status, 204);
  const deletedSegmentAgain = await fetch(`${endpoint}/segments/${createdSegmentBody.data.id}`, {
    method: "DELETE",
    headers,
  });
  assert.equal(deletedSegmentAgain.status, 404);

  const crossWorkspaceRead = await fetch(
    `${baseUrl}/workspaces/${viewer.workspace.id}/contacts/${contactIds[0]}`,
    { headers: viewerHeaders },
  );
  assert.equal(crossWorkspaceRead.status, 404);

  const deletedNote = await fetch(`${endpoint}/${contactIds[0]}/notes/${noteBody.data.id}`, { method: "DELETE", headers });
  assert.equal(deletedNote.status, 204);
  const retainedNote = await prisma.contactNote.findUnique({ where: { id: noteBody.data.id }, select: { deletedAt: true, deletedById: true } });
  assert.ok(retainedNote?.deletedAt);
  assert.equal(retainedNote.deletedById, owner.user.id);

  const removed = await fetch(`${endpoint}/${contactIds[1]}`, { method: "DELETE", headers });
  assert.equal(removed.status, 204);
  const removedAgain = await fetch(`${endpoint}/${contactIds[1]}`, { method: "DELETE", headers });
  assert.equal(removedAgain.status, 404);

  const retainedContact = await prisma.contact.findUnique({ where: { id: contactIds[1] }, select: { deletedAt: true, deletedById: true } });
  assert.ok(retainedContact?.deletedAt, "soft-deleted contacts must remain in storage");
  assert.equal(retainedContact.deletedById, owner.user.id);

  const reusedPhone = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Reused phone and WhatsApp identity", phone: "+919100000002", whatsappId: "919100000002" }),
  });
  assert.equal(reusedPhone.status, 201, "soft-deleted phone and WhatsApp identifiers should be reusable");
  const reusedPhoneBody = (await reusedPhone.json()) as { data: { id: string } };
  assert.notEqual(reusedPhoneBody.data.id, contactIds[1]);

  const bulkDelete = await fetch(`${endpoint}/bulk/delete`, {
    method: "POST",
    headers,
    body: JSON.stringify({ contactIds: [contactIds[0], contactIds[2]] }),
  });
  assert.equal(bulkDelete.status, 200);
  const bulkDeleteBody = (await bulkDelete.json()) as { data: { deletedCount: number } };
  assert.equal(bulkDeleteBody.data.deletedCount, 2);
});
