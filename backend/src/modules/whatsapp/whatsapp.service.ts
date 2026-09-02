import { env } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { decryptSecret, encryptSecret } from "../../utils/crypto.js";
import type { EmbeddedSignupInput } from "./whatsapp.schemas.js";

type MetaResponse = Record<string, unknown> & { error?: { message?: string } };

function requireMetaConfiguration() {
  if (!env.META_APP_ID || !env.META_APP_SECRET || !env.META_TOKEN_ENCRYPTION_KEY) {
    throw new AppError(503, "WhatsApp Embedded Signup is not configured on the server", "WHATSAPP_SETUP_UNAVAILABLE");
  }
  return { appId: env.META_APP_ID, appSecret: env.META_APP_SECRET, encryptionKey: env.META_TOKEN_ENCRYPTION_KEY };
}

async function parseMetaResponse(response: Response): Promise<MetaResponse> {
  const body = await response.json().catch(() => ({})) as MetaResponse;
  if (!response.ok || body.error) {
    throw new AppError(502, "Meta could not complete the WhatsApp connection", "META_API_ERROR", { providerMessage: body.error?.message ?? "Unknown Meta API error" });
  }
  return body;
}

async function exchangeSignupCode(input: EmbeddedSignupInput) {
  const { appId, appSecret } = requireMetaConfiguration();
  const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", input.code);
  const response = await fetch(url, { method: "GET" });
  return parseMetaResponse(response);
}

async function fetchMeta<T extends MetaResponse>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return parseMetaResponse(response) as Promise<T>;
}

async function postMeta<T extends MetaResponse>(path: string, accessToken: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseMetaResponse(response) as Promise<T>;
}

type MetaPhoneNumber = MetaResponse & {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  messaging_limit?: string;
  is_on_biz_app?: boolean;
  platform_type?: string;
};

const phoneNumberFields = "id,display_phone_number,verified_name,quality_rating,messaging_limit,is_on_biz_app,platform_type";

async function findCoexistencePhoneNumber(wabaId: string, phoneNumberId: string | null | undefined, accessToken: string) {
  if (phoneNumberId) {
    return fetchMeta<MetaPhoneNumber>(`/${encodeURIComponent(phoneNumberId)}?fields=${phoneNumberFields}`, accessToken);
  }
  const response = await fetchMeta<{ data?: MetaPhoneNumber[] }>(
    `/${encodeURIComponent(wabaId)}/phone_numbers?fields=${phoneNumberFields}`,
    accessToken,
  );
  const coexistenceNumbers = (response.data ?? []).filter((phone) => phone.is_on_biz_app === true);
  const phoneNumbers = coexistenceNumbers.length ? coexistenceNumbers : response.data ?? [];
  if (phoneNumbers.length !== 1) {
    throw new AppError(422, "Meta did not identify exactly one WhatsApp phone number", "META_PHONE_NUMBER_NOT_FOUND");
  }
  return phoneNumbers[0];
}

async function subscribeAppToWaba(wabaId: string, accessToken: string) {
  return postMeta(`/${encodeURIComponent(wabaId)}/subscribed_apps`, accessToken, {});
}

async function requestCoexistenceSync(phoneNumberId: string, accessToken: string, syncType: "history" | "smb_app_state_sync") {
  return postMeta<{ request_id?: string }>(`/${encodeURIComponent(phoneNumberId)}/smb_app_data`, accessToken, {
    messaging_product: "whatsapp",
    sync_type: syncType,
  });
}

/** Sends an automation reply and records it in the same conversation shown in Inbox. */
export async function sendAutomationText(workspaceId: string, conversationId: string, body: string) {
  const { encryptionKey } = requireMetaConfiguration();
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    select: {
      id: true, contactId: true, phoneNumberId: true, contact: { select: { phoneE164: true } },
      phoneNumber: { select: { metaPhoneNumberId: true, businessAccount: { select: { encryptedAccessToken: true } } } },
    },
  });
  if (!conversation) throw new AppError(404, "Conversation was not found", "CONVERSATION_NOT_FOUND");
  if (!conversation.phoneNumber?.metaPhoneNumberId || !conversation.phoneNumber.businessAccount.encryptedAccessToken) {
    throw new AppError(503, "Connect a WhatsApp phone number before sending automation messages", "WHATSAPP_NOT_CONNECTED");
  }
  const to = conversation.contact.phoneE164.replace(/\D/g, "");
  if (!to) throw new AppError(422, "The contact does not have a valid WhatsApp number", "CONTACT_PHONE_INVALID");
  const accessToken = decryptSecret(conversation.phoneNumber.businessAccount.encryptedAccessToken, encryptionKey);
  const sent = await postMeta<{ messages?: Array<{ id?: string }> }>(`/${encodeURIComponent(conversation.phoneNumber.metaPhoneNumberId)}/messages`, accessToken, {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  });
  const sentAt = new Date();
  const metaMessageId = sent.messages?.[0]?.id ?? null;
  return prisma.$transaction(async (transaction) => {
    const message = await transaction.message.create({
      data: {
        workspaceId, conversationId: conversation.id, contactId: conversation.contactId, metaMessageId,
        direction: "OUTGOING", type: "TEXT", status: "SENT", text: body, payload: { source: "automation" }, sentAt,
      },
      select: { id: true, metaMessageId: true, sentAt: true },
    });
    await transaction.conversation.update({ where: { id: conversation.id }, data: { lastMessagePreview: body, lastMessageAt: sentAt } });
    return message;
  });
}

export async function completeEmbeddedSignup(workspaceId: string, input: EmbeddedSignupInput) {
  const { encryptionKey } = requireMetaConfiguration();
  const exchanged = await exchangeSignupCode(input);
  const accessToken = typeof exchanged.access_token === "string" ? exchanged.access_token : undefined;
  if (!accessToken) throw new AppError(502, "Meta did not return an access token", "META_TOKEN_MISSING");

  const waba = await fetchMeta<{ id?: string; name?: string }>(`/${encodeURIComponent(input.wabaId)}?fields=id,name`, accessToken);
  if (waba.id !== input.wabaId) {
    throw new AppError(502, "Meta returned a different WhatsApp Business Account", "META_WABA_MISMATCH");
  }
  const phone = await findCoexistencePhoneNumber(input.wabaId, input.phoneNumberId, accessToken);
  if (!phone || !phone.id) throw new AppError(502, "Meta did not return a WhatsApp phone number", "META_PHONE_NUMBER_MISSING");
  const metaPhoneNumberId = phone.id;
  if (input.phoneNumberId && metaPhoneNumberId !== input.phoneNumberId) {
    throw new AppError(502, "Meta returned a different WhatsApp phone number", "META_PHONE_NUMBER_MISMATCH");
  }
  if (phone.is_on_biz_app === false) {
    throw new AppError(422, "The selected number is not enabled for WhatsApp Business App coexistence", "META_COEXISTENCE_NOT_ENABLED");
  }
  const now = new Date();
  const tokenExpiresAt = typeof exchanged.expires_in === "number" && exchanged.expires_in > 0
    ? new Date(now.getTime() + exchanged.expires_in * 1000)
    : null;
  const encryptedAccessToken = encryptSecret(accessToken, encryptionKey);

  const connected = await prisma.$transaction(async (transaction) => {
    const account = await transaction.whatsAppBusinessAccount.upsert({
      where: { workspaceId_metaWabaId: { workspaceId, metaWabaId: input.wabaId } },
      create: {
        workspaceId,
        metaBusinessId: input.businessId ?? null,
        metaWabaId: input.wabaId,
        displayName: typeof waba.name === "string" ? waba.name : null,
        status: "CONNECTED",
        encryptedAccessToken,
        tokenExpiresAt,
        connectedAt: now,
        lastSyncedAt: now,
      },
      update: {
        metaBusinessId: input.businessId ?? undefined,
        displayName: typeof waba.name === "string" ? waba.name : undefined,
        status: "CONNECTED",
        encryptedAccessToken,
        tokenExpiresAt,
        connectedAt: now,
        lastSyncedAt: now,
        lastError: null,
      },
      select: { id: true, metaBusinessId: true, metaWabaId: true, displayName: true, status: true, connectedAt: true },
    });
    const phoneNumber = await transaction.whatsAppPhoneNumber.upsert({
      where: { businessAccountId_metaPhoneNumberId: { businessAccountId: account.id, metaPhoneNumberId } },
      create: {
        businessAccountId: account.id,
        metaPhoneNumberId,
        displayPhoneNumber: typeof phone.display_phone_number === "string" ? phone.display_phone_number : metaPhoneNumberId,
        verifiedName: typeof phone.verified_name === "string" ? phone.verified_name : null,
        qualityRating: typeof phone.quality_rating === "string" ? phone.quality_rating : null,
        messagingLimit: typeof phone.messaging_limit === "string" ? phone.messaging_limit : null,
        status: "ACTIVE",
        isOnBusinessApp: phone.is_on_biz_app === true,
        platformType: typeof phone.platform_type === "string" ? phone.platform_type : null,
        connectedAt: now,
        lastSyncedAt: now,
      },
      update: {
        displayPhoneNumber: typeof phone.display_phone_number === "string" ? phone.display_phone_number : undefined,
        verifiedName: typeof phone.verified_name === "string" ? phone.verified_name : undefined,
        qualityRating: typeof phone.quality_rating === "string" ? phone.quality_rating : undefined,
        messagingLimit: typeof phone.messaging_limit === "string" ? phone.messaging_limit : undefined,
        status: "ACTIVE",
        isOnBusinessApp: phone.is_on_biz_app === true,
        platformType: typeof phone.platform_type === "string" ? phone.platform_type : undefined,
        connectedAt: now,
        lastSyncedAt: now,
      },
      select: { id: true, metaPhoneNumberId: true, displayPhoneNumber: true, verifiedName: true, status: true },
    });
    await transaction.workspaceSetupProgress.upsert({
      where: { workspaceId },
      create: { workspaceId, whatsappConnectedAt: now, phoneNumberConnectedAt: now },
      update: { whatsappConnectedAt: now, phoneNumberConnectedAt: now },
    });
    return { account, phoneNumber, coexistence: phone.is_on_biz_app === true };
  });

  // Meta may complete onboarding while optional webhook/history setup is still unavailable
  // for the app. Keep the successful connection and surface those setup issues as warnings.
  const postSetupResults = await Promise.allSettled([
    subscribeAppToWaba(input.wabaId, accessToken),
    ...(connected.coexistence ? [
      requestCoexistenceSync(metaPhoneNumberId, accessToken, "history"),
      requestCoexistenceSync(metaPhoneNumberId, accessToken, "smb_app_state_sync"),
    ] : []),
  ]);
  const syncRequestIds = postSetupResults
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .filter((value): value is { request_id?: unknown } => typeof value === "object" && value !== null && "request_id" in value)
    .map((value) => value.request_id)
    .filter((requestId): requestId is string => typeof requestId === "string");
  const syncWarnings = postSetupResults
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason instanceof Error ? result.reason.message : "WhatsApp post-setup request failed");
  if (syncWarnings.length) {
    await prisma.whatsAppBusinessAccount.update({ where: { id: connected.account.id }, data: { lastError: syncWarnings.join("; ") } });
  }
  return { ...connected, syncRequestIds, syncWarnings };
}
