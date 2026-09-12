import { env } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";
import { AppError } from "../../middleware/error-handler.js";
import { decryptSecret, encryptSecret } from "../../utils/crypto.js";
import type { EmbeddedSignupInput } from "./whatsapp.schemas.js";

type MetaResponse = Record<string, unknown> & {
  error?: { message?: string; code?: number; error_subcode?: number; type?: string; is_transient?: boolean };
};

type MetaRequestStage =
  | "exchange_signup_code"
  | "load_business_account"
  | "load_phone_number"
  | "list_phone_numbers"
  | "subscribe_webhooks"
  | "request_history_sync"
  | "request_app_state_sync"
  | "send_message"
  | "upload_media"
  | "download_media"
  | "list_templates"
  | "create_template"
  | "update_template"
  | "delete_template";

// Allow for slow provider connections while bounding unavailable requests.
const META_REQUEST_TIMEOUT_MS = 60_000;

const metaStageLabels: Record<MetaRequestStage, string> = {
  exchange_signup_code: "exchanging the signup code",
  load_business_account: "loading the WhatsApp Business Account",
  load_phone_number: "loading the WhatsApp phone number",
  list_phone_numbers: "finding the WhatsApp phone number",
  subscribe_webhooks: "subscribing the app to WhatsApp webhooks",
  request_history_sync: "requesting WhatsApp message history",
  request_app_state_sync: "requesting WhatsApp Business App synchronization",
  send_message: "sending the WhatsApp message",
  upload_media: "uploading the WhatsApp media",
  download_media: "loading the WhatsApp media",
  list_templates: "loading WhatsApp templates",
  create_template: "submitting the WhatsApp template",
  update_template: "updating the WhatsApp template",
  delete_template: "deleting the WhatsApp template",
};

function requireMetaConfiguration() {
  if (!env.META_APP_ID || !env.META_APP_SECRET || !env.META_TOKEN_ENCRYPTION_KEY) {
    throw new AppError(503, "WhatsApp Embedded Signup is not configured on the server", "WHATSAPP_SETUP_UNAVAILABLE");
  }
  return { appId: env.META_APP_ID, appSecret: env.META_APP_SECRET, encryptionKey: env.META_TOKEN_ENCRYPTION_KEY };
}

function networkFailureReason(error: unknown) {
  if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return `Meta did not respond within ${META_REQUEST_TIMEOUT_MS / 1_000} seconds.`;
  }
  const cause = error instanceof Error && "cause" in error && typeof error.cause === "object" && error.cause
    ? error.cause as { code?: unknown }
    : undefined;
  const code = typeof cause?.code === "string" ? cause.code : undefined;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "The server could not resolve Meta's network address.";
  if (code === "ECONNREFUSED") return "Meta refused the server connection.";
  if (code === "ECONNRESET" || code === "UND_ERR_SOCKET") return "The connection to Meta was interrupted.";
  if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT") {
    return "The connection to Meta timed out.";
  }
  return "The server could not establish a connection to Meta.";
}

async function requestMeta(url: string | URL, init: RequestInit, stage: MetaRequestStage, attempts = 1) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(META_REQUEST_TIMEOUT_MS) });
    } catch (error) {
      lastError = error;
    }
  }
  const reason = networkFailureReason(lastError);
  throw new AppError(
    502,
    `The server could not reach Meta while ${metaStageLabels[stage]}. ${reason} Please try again.`,
    "META_NETWORK_ERROR",
    { stage, reason, retryable: true },
  );
}

async function parseMetaResponse(response: Response, stage: MetaRequestStage): Promise<MetaResponse> {
  const parsedBody: unknown = await response.json().catch(() => undefined);
  const body = typeof parsedBody === "object" && parsedBody !== null && !Array.isArray(parsedBody)
    ? parsedBody as MetaResponse
    : {};
  if (!response.ok || body.error) {
    const providerMessage = (body.error?.message ?? response.statusText) || "Meta returned an error without a description.";
    throw new AppError(
      502,
      `Meta rejected the request while ${metaStageLabels[stage]}: ${providerMessage}`,
      "META_API_ERROR",
      {
        stage,
        providerMessage,
        providerStatus: response.status,
        ...(typeof body.error?.code === "number" ? { providerCode: body.error.code } : {}),
        ...(typeof body.error?.error_subcode === "number" ? { providerSubcode: body.error.error_subcode } : {}),
      },
    );
  }
  if (parsedBody === undefined || typeof parsedBody !== "object" || parsedBody === null || Array.isArray(parsedBody)) {
    throw new AppError(
      502,
      `Meta returned an unexpected response while ${metaStageLabels[stage]}. Please try again.`,
      "META_RESPONSE_INVALID",
      { stage, providerStatus: response.status, retryable: true },
    );
  }
  return body;
}

async function exchangeSignupCode(input: EmbeddedSignupInput) {
  const { appId, appSecret } = requireMetaConfiguration();
  const url = new URL(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", input.code);
  // Authorization codes are single-use, so this exchange must not be retried automatically.
  const response = await requestMeta(url, { method: "GET" }, "exchange_signup_code");
  return parseMetaResponse(response, "exchange_signup_code");
}

async function fetchMeta<T extends MetaResponse>(path: string, accessToken: string, stage: MetaRequestStage): Promise<T> {
  const response = await requestMeta(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  }, stage, 2);
  return parseMetaResponse(response, stage) as Promise<T>;
}

async function postMeta<T extends MetaResponse>(path: string, accessToken: string, body: Record<string, unknown>, stage: MetaRequestStage): Promise<T> {
  const response = await requestMeta(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  }, stage);
  return parseMetaResponse(response, stage) as Promise<T>;
}

async function deleteMeta<T extends MetaResponse>(path: string, accessToken: string, stage: MetaRequestStage): Promise<T> {
  const response = await requestMeta(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}${path}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${accessToken}` },
  }, stage);
  return parseMetaResponse(response, stage) as Promise<T>;
}

async function postMetaForm<T extends MetaResponse>(path: string, accessToken: string, body: FormData, stage: MetaRequestStage): Promise<T> {
  const response = await requestMeta(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
    body,
  }, stage);
  return parseMetaResponse(response, stage) as Promise<T>;
}

type MetaPhoneNumber = MetaResponse & {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  is_on_biz_app?: boolean;
  platform_type?: string;
};

// `messaging_limit` is not a valid field on the Graph API phone-number
// resource in v25.0; requesting it makes the entire lookup fail with (#100).
// Coexistence fields: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
const phoneNumberFields = "id,display_phone_number,verified_name,quality_rating,is_on_biz_app,platform_type";

async function findCoexistencePhoneNumber(wabaId: string, phoneNumberId: string | null | undefined, accessToken: string) {
  if (phoneNumberId) {
    return fetchMeta<MetaPhoneNumber>(`/${encodeURIComponent(phoneNumberId)}?fields=${phoneNumberFields}`, accessToken, "load_phone_number");
  }
  const response = await fetchMeta<{ data?: MetaPhoneNumber[] }>(
    `/${encodeURIComponent(wabaId)}/phone_numbers?fields=${phoneNumberFields}`,
    accessToken,
    "list_phone_numbers",
  );
  if (!Array.isArray(response.data) || response.data.some((phone) =>
    typeof phone !== "object" || phone === null || Array.isArray(phone) || typeof phone.id !== "string")) {
    throw new AppError(
      502,
      "Meta returned an unexpected response while finding the WhatsApp phone number. Please try again.",
      "META_RESPONSE_INVALID",
      { stage: "list_phone_numbers", retryable: true },
    );
  }
  const coexistenceNumbers = response.data.filter((phone) => phone.is_on_biz_app === true);
  const phoneNumbers = coexistenceNumbers.length ? coexistenceNumbers : response.data;
  if (phoneNumbers.length !== 1) {
    throw new AppError(422, "Meta did not identify exactly one WhatsApp phone number", "META_PHONE_NUMBER_NOT_FOUND");
  }
  return phoneNumbers[0];
}

async function subscribeAppToWaba(wabaId: string, accessToken: string) {
  const result = await postMeta(`/${encodeURIComponent(wabaId)}/subscribed_apps`, accessToken, {}, "subscribe_webhooks");
  if (result.success !== true) {
    throw new AppError(502, "Meta did not confirm the WhatsApp webhook subscription. Check the app's webhook configuration and permissions.", "META_RESPONSE_INVALID", { stage: "subscribe_webhooks" });
  }
  return result;
}

async function requestCoexistenceSync(phoneNumberId: string, accessToken: string, syncType: "history" | "smb_app_state_sync") {
  const stage = syncType === "history" ? "request_history_sync" : "request_app_state_sync";
  const result = await postMeta<{ request_id?: string }>(`/${encodeURIComponent(phoneNumberId)}/smb_app_data`, accessToken, {
    messaging_product: "whatsapp",
    sync_type: syncType,
  }, stage);
  if (typeof result.request_id !== "string" || !result.request_id.trim()) {
    throw new AppError(502, `Meta did not return a request ID while ${metaStageLabels[stage]}. Synchronization could not be confirmed.`, "META_RESPONSE_INVALID", { stage });
  }
  return result.request_id;
}

function coexistenceSyncWarning(syncType: "history" | "smb_app_state_sync", error: unknown) {
  const rawMessage = error instanceof Error ? error.message : "WhatsApp synchronization request failed.";
  if (!/135000|generic user error/i.test(rawMessage)) return rawMessage;
  const dataName = syncType === "history" ? "message history" : "contacts";
  return `Meta did not allow ${dataName} synchronization. Grant sync permission in the WhatsApp Business App and verify the Meta webhook is publicly reachable. The WhatsApp connection is active.`;
}

async function requestWorkspaceCoexistenceSync(workspaceId: string) {
  const { encryptionKey } = requireMetaConfiguration();
  const account = await prisma.whatsAppBusinessAccount.findFirst({
    where: { workspaceId, status: "CONNECTED", encryptedAccessToken: { not: null } },
    select: {
      id: true,
      metaWabaId: true,
      encryptedAccessToken: true,
      phoneNumbers: {
        where: { status: "ACTIVE" },
        select: { id: true, metaPhoneNumberId: true, isOnBusinessApp: true, platformType: true },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  const phone = account?.phoneNumbers.find((item) => item.isOnBusinessApp && item.platformType === "CLOUD_API") ?? account?.phoneNumbers[0];
  if (!account || !phone?.isOnBusinessApp || phone.platformType !== "CLOUD_API" || !account.metaWabaId || !account.encryptedAccessToken) {
    throw new AppError(409, "Connect a WhatsApp Business App number before syncing conversations.", "WHATSAPP_SYNC_UNAVAILABLE");
  }

  const accessToken = decryptSecret(account.encryptedAccessToken, encryptionKey);
  const syncRequestIds: string[] = [];
  const syncWarnings: string[] = [];
  let subscribed = false;
  try {
    await subscribeAppToWaba(account.metaWabaId, accessToken);
    subscribed = true;
  } catch (error) {
    syncWarnings.push(error instanceof Error ? error.message : "WhatsApp webhook subscription failed.");
  }
  if (subscribed) {
    for (const syncType of ["smb_app_state_sync", "history"] as const) {
      try {
        syncRequestIds.push(await requestCoexistenceSync(phone.metaPhoneNumberId, accessToken, syncType));
      } catch (error) {
        syncWarnings.push(coexistenceSyncWarning(syncType, error));
      }
    }
  }
  await prisma.whatsAppBusinessAccount.update({
    where: { id: account.id },
    data: { lastError: syncWarnings.length ? syncWarnings.join("; ") : null, lastSyncedAt: new Date() },
  });
  return { syncRequestIds, syncWarnings };
}

export async function syncWhatsApp(workspaceId: string) {
  return requestWorkspaceCoexistenceSync(workspaceId);
}

type MetaTemplateResponse = MetaResponse & {
  id?: string;
  name?: string;
  status?: string;
  category?: string;
  language?: string;
  components?: unknown;
};

export type WhatsAppTemplateSyncDebug = {
  wabaId: string;
  tokenSource: "system_user" | "embedded_signup";
  pages: number;
  remoteCount: number;
};

async function workspaceMetaCredentials(workspaceId: string) {
  const { encryptionKey } = requireMetaConfiguration();
  const account = await prisma.whatsAppBusinessAccount.findFirst({
    where: { workspaceId, status: "CONNECTED", metaWabaId: { not: null }, encryptedAccessToken: { not: null } },
    orderBy: [{ connectedAt: "desc" }, { updatedAt: "desc" }],
    select: { metaWabaId: true, encryptedAccessToken: true },
  });
  if (!account?.metaWabaId || !account.encryptedAccessToken) {
    throw new AppError(409, "Connect WhatsApp before managing Meta templates", "WHATSAPP_NOT_CONNECTED");
  }
  // Meta's template-management endpoints require a System User token with
  // whatsapp_business_management. The token returned by Embedded Signup is
  // retained as a fallback for local/test setups where no platform token is
  // configured, but production template operations should use the System User
  // token assigned to the connected WABA.
  return {
    wabaId: account.metaWabaId,
    accessToken: env.META_SYSTEM_USER_ACCESS_TOKEN ?? decryptSecret(account.encryptedAccessToken, encryptionKey),
    tokenSource: env.META_SYSTEM_USER_ACCESS_TOKEN ? "system_user" as const : "embedded_signup" as const,
  };
}

export async function connectedWhatsAppWabaId(workspaceId: string) {
  return (await workspaceMetaCredentials(workspaceId)).wabaId;
}

function metaPathFromNextUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    const prefix = `/${env.META_GRAPH_API_VERSION}`;
    if (!url.pathname.startsWith(prefix)) return undefined;
    return `${url.pathname.slice(prefix.length)}${url.search}`;
  } catch {
    return undefined;
  }
}

export async function listWhatsAppTemplates(workspaceId: string) {
  const { wabaId, accessToken, tokenSource } = await workspaceMetaCredentials(workspaceId);
  const templates: MetaTemplateResponse[] = [];
  let path: string | undefined = `/${encodeURIComponent(wabaId)}/message_templates?fields=id,name,status,category,language,components&limit=100`;
  let pages = 0;
  try {
    for (let page = 0; path && page < 20; page += 1) {
      const response = await fetchMeta<{ data?: MetaTemplateResponse[]; paging?: { next?: string } }>(path, accessToken, "list_templates");
      pages += 1;
      if (Array.isArray(response.data)) templates.push(...response.data.filter((template) => typeof template.id === "string" && typeof template.name === "string"));
      path = metaPathFromNextUrl(response.paging?.next);
    }
  } catch (error) {
    if (error instanceof AppError) {
      const details = error.details && typeof error.details === "object" && !Array.isArray(error.details) ? error.details as Record<string, unknown> : {};
      const providerMessage = typeof details.providerMessage === "string" ? details.providerMessage : error.message;
      const permissionProblem = /permission|scope|access token|oauth|not authorized|(#10)/i.test(providerMessage);
      throw new AppError(error.statusCode, error.message, error.code, {
        ...details,
        stage: "list_templates",
        wabaId,
        tokenSource,
        ...(permissionProblem ? {
          diagnosis: "Meta rejected template access because the selected token may not have whatsapp_business_management access to this WABA. Assign the System User to this WABA and use a token generated with that permission.",
        } : {}),
      });
    }
    throw error;
  }
  return { wabaId, templates, debug: { wabaId, tokenSource, pages, remoteCount: templates.length } satisfies WhatsAppTemplateSyncDebug };
}

export async function createWhatsAppTemplate(workspaceId: string, body: Record<string, unknown>) {
  const { wabaId, accessToken } = await workspaceMetaCredentials(workspaceId);
  return postMeta<MetaTemplateResponse>(`/${encodeURIComponent(wabaId)}/message_templates`, accessToken, body, "create_template");
}

export async function updateWhatsAppTemplate(workspaceId: string, metaTemplateId: string, body: Record<string, unknown>) {
  const { accessToken } = await workspaceMetaCredentials(workspaceId);
  return postMeta<MetaTemplateResponse>(`/${encodeURIComponent(metaTemplateId)}`, accessToken, body, "update_template");
}

export async function deleteWhatsAppTemplate(workspaceId: string, metaTemplateId: string, name: string) {
  const { wabaId, accessToken } = await workspaceMetaCredentials(workspaceId);
  return deleteMeta<MetaResponse>(`/${encodeURIComponent(wabaId)}/message_templates?hsm_id=${encodeURIComponent(metaTemplateId)}&name=${encodeURIComponent(name)}`, accessToken, "delete_template");
}

export async function sendWhatsAppConversationText(workspaceId: string, conversationId: string, body: string) {
  const { encryptionKey } = requireMetaConfiguration();
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    select: {
      id: true,
      contact: { select: { phoneE164: true } },
      phoneNumber: {
        select: {
          metaPhoneNumberId: true,
          status: true,
          businessAccount: { select: { status: true, encryptedAccessToken: true } },
        },
      },
    },
  });
  if (!conversation) throw new AppError(404, "Conversation was not found", "CONVERSATION_NOT_FOUND");
  if (conversation.phoneNumber?.status !== "ACTIVE" || conversation.phoneNumber.businessAccount.status !== "CONNECTED" || !conversation.phoneNumber.businessAccount.encryptedAccessToken) {
    throw new AppError(503, "Connect an active WhatsApp phone number before sending messages", "WHATSAPP_NOT_CONNECTED");
  }
  const to = conversation.contact.phoneE164.replace(/\D/g, "");
  if (!to) throw new AppError(422, "The contact does not have a valid WhatsApp number", "CONTACT_PHONE_INVALID");
  if (!body.trim()) throw new AppError(422, "Message text cannot be empty", "MESSAGE_TEXT_REQUIRED");

  const accessToken = decryptSecret(conversation.phoneNumber.businessAccount.encryptedAccessToken, encryptionKey);
  const sent = await postMeta<{ messages?: Array<{ id?: string }> }>(`/${encodeURIComponent(conversation.phoneNumber.metaPhoneNumberId)}/messages`, accessToken, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body },
  }, "send_message");
  const metaMessageId = sent.messages?.[0]?.id;
  if (!metaMessageId) throw new AppError(502, "Meta accepted the message but did not return a message ID. Please try again.", "META_RESPONSE_INVALID", { stage: "send_message" });
  return { metaMessageId, sentAt: new Date() };
}

type WhatsAppMediaType = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";

function mediaMimeType(dataUrl: string) {
  return dataUrl.slice("data:".length, dataUrl.indexOf(";base64,"));
}

function mediaBytes(dataUrl: string) {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(";base64,") + ";base64,".length), "base64");
}

export async function sendWhatsAppConversationMedia(workspaceId: string, conversationId: string, type: WhatsAppMediaType, mediaData: string | undefined, existingMediaId: string | undefined, caption: string | undefined, fileName: string | undefined) {
  const { encryptionKey } = requireMetaConfiguration();
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, workspaceId },
    select: {
      contact: { select: { phoneE164: true } },
      phoneNumber: { select: { metaPhoneNumberId: true, status: true, businessAccount: { select: { status: true, encryptedAccessToken: true } } } },
    },
  });
  if (!conversation) throw new AppError(404, "Conversation was not found", "CONVERSATION_NOT_FOUND");
  if (conversation.phoneNumber?.status !== "ACTIVE" || conversation.phoneNumber.businessAccount.status !== "CONNECTED" || !conversation.phoneNumber.businessAccount.encryptedAccessToken) {
    throw new AppError(503, "Connect an active WhatsApp phone number before sending media", "WHATSAPP_NOT_CONNECTED");
  }
  const to = conversation.contact.phoneE164.replace(/\D/g, "");
  if (!to) throw new AppError(422, "The contact does not have a valid WhatsApp number", "CONTACT_PHONE_INVALID");
  const accessToken = decryptSecret(conversation.phoneNumber.businessAccount.encryptedAccessToken, encryptionKey);
  let mediaId = existingMediaId;
  if (!mediaId) {
    if (!mediaData) throw new AppError(422, "Media data is required", "MEDIA_DATA_REQUIRED");
    const mimeType = mediaMimeType(mediaData);
    const upload = new FormData();
    upload.append("messaging_product", "whatsapp");
    upload.append("type", mimeType);
    upload.append("file", new Blob([mediaBytes(mediaData)], { type: mimeType }), fileName || "upload");
    const uploaded = await postMetaForm<{ id?: string }>(`/${encodeURIComponent(conversation.phoneNumber.metaPhoneNumberId)}/media`, accessToken, upload, "upload_media");
    mediaId = uploaded.id;
  }
  if (!mediaId) throw new AppError(502, "Meta did not return a media ID. Please try again.", "META_RESPONSE_INVALID", { stage: "upload_media" });
  const mediaPayload = type === "IMAGE" ? { id: mediaId, ...(caption ? { caption } : {}) }
    : type === "VIDEO" ? { id: mediaId, ...(caption ? { caption } : {}) }
      : type === "AUDIO" ? { id: mediaId }
        : { id: mediaId, ...(caption ? { caption } : {}), ...(fileName ? { filename: fileName } : {}) };
  const sent = await postMeta<{ messages?: Array<{ id?: string }> }>(`/${encodeURIComponent(conversation.phoneNumber.metaPhoneNumberId)}/messages`, accessToken, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: type.toLowerCase(),
    [type.toLowerCase()]: mediaPayload,
  }, "send_message");
  const metaMessageId = sent.messages?.[0]?.id;
  if (!metaMessageId) throw new AppError(502, "Meta accepted the media but did not return a message ID. Please try again.", "META_RESPONSE_INVALID", { stage: "send_message" });
  return { metaMessageId, mediaId, sentAt: new Date() };
}

export async function downloadWhatsAppMedia(workspaceId: string, conversationId: string, messageId: string) {
  const { encryptionKey } = requireMetaConfiguration();
  const message = await prisma.message.findFirst({
    where: { id: messageId, workspaceId, conversationId },
    select: { mediaId: true, conversation: { select: { phoneNumber: { select: { metaPhoneNumberId: true, businessAccount: { select: { status: true, encryptedAccessToken: true } } } } } } },
  });
  if (!message?.mediaId) throw new AppError(404, "Message media was not found", "MEDIA_NOT_FOUND");
  const phoneNumber = message.conversation.phoneNumber;
  if (!phoneNumber || phoneNumber.businessAccount.status !== "CONNECTED" || !phoneNumber.businessAccount.encryptedAccessToken) throw new AppError(503, "WhatsApp is not connected", "WHATSAPP_NOT_CONNECTED");
  const accessToken = decryptSecret(phoneNumber.businessAccount.encryptedAccessToken, encryptionKey);
  const metadata = await fetchMeta<{ url?: string; mime_type?: string }>(`/${encodeURIComponent(message.mediaId)}`, accessToken, "download_media");
  if (!metadata.url) throw new AppError(502, "Meta did not return a media download URL", "META_RESPONSE_INVALID", { stage: "download_media" });
  const mediaResponse = await requestMeta(metadata.url, { headers: { authorization: `Bearer ${accessToken}` } }, "download_media");
  if (!mediaResponse.ok) throw new AppError(502, "Meta could not download the media", "META_API_ERROR", { stage: "download_media" });
  return { body: Buffer.from(await mediaResponse.arrayBuffer()), contentType: metadata.mime_type ?? mediaResponse.headers.get("content-type") ?? "application/octet-stream" };
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
  }, "send_message");
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

export async function sendTestMessage(workspaceId: string, to: string) {
  const { encryptionKey } = requireMetaConfiguration();
  const connection = await prisma.whatsAppBusinessAccount.findFirst({
    where: {
      workspaceId,
      status: "CONNECTED",
      encryptedAccessToken: { not: null },
      phoneNumbers: { some: { status: "ACTIVE" } },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      phoneNumbers: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { id: true, metaPhoneNumberId: true },
      },
      encryptedAccessToken: true,
    },
  });
  const phone = connection?.phoneNumbers[0];
  if (!connection || !phone || !connection.encryptedAccessToken) {
    throw new AppError(409, "Connect an active WhatsApp phone number before sending a test message.", "WHATSAPP_NOT_CONNECTED");
  }

  const accessToken = decryptSecret(connection.encryptedAccessToken, encryptionKey);
  const sent = await postMeta<{ messages?: Array<{ id?: string }> }>(`/${encodeURIComponent(phone.metaPhoneNumberId)}/messages`, accessToken, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to.replace(/\D/g, ""),
    type: "text",
    text: { body: "This is a test message from Aikonnect." },
  }, "send_message");
  const messageId = sent.messages?.[0]?.id;
  if (!messageId) throw new AppError(502, "Meta accepted the request but did not return a message ID. The test message could not be confirmed.", "META_RESPONSE_INVALID", { stage: "send_message" });
  const sentAt = new Date();
  await prisma.workspaceSetupProgress.upsert({
    where: { workspaceId },
    create: { workspaceId, testMessageSentAt: sentAt, completedAt: sentAt },
    update: { testMessageSentAt: sentAt, completedAt: sentAt },
  });
  return { messageId, to, sentAt };
}

export type WhatsAppTemplateParameter = { type: "text"; text: string };

/** Sends an approved WhatsApp template through the workspace's active phone. */
export async function sendWhatsAppTemplateMessage(
  workspaceId: string,
  to: string,
  templateName: string,
  languageCode: string,
  parameters: WhatsAppTemplateParameter[],
) {
  const { encryptionKey } = requireMetaConfiguration();
  const connection = await prisma.whatsAppBusinessAccount.findFirst({
    where: {
      workspaceId,
      status: "CONNECTED",
      encryptedAccessToken: { not: null },
      phoneNumbers: { some: { status: "ACTIVE" } },
    },
    orderBy: [{ connectedAt: "desc" }, { createdAt: "asc" }],
    select: {
      encryptedAccessToken: true,
      phoneNumbers: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { id: true, metaPhoneNumberId: true },
      },
    },
  });
  const phone = connection?.phoneNumbers[0];
  if (!connection?.encryptedAccessToken || !phone) {
    throw new AppError(503, "Connect an active WhatsApp phone number before sending campaigns", "WHATSAPP_NOT_CONNECTED");
  }
  const normalizedTo = to.replace(/\D/g, "");
  if (!normalizedTo) throw new AppError(422, "The recipient does not have a valid WhatsApp number", "CONTACT_PHONE_INVALID");
  if (!templateName.trim() || !languageCode.trim()) throw new AppError(422, "The campaign template identity is incomplete", "CAMPAIGN_TEMPLATE_IDENTITY_INVALID");

  const accessToken = env.META_SYSTEM_USER_ACCESS_TOKEN ?? decryptSecret(connection.encryptedAccessToken, encryptionKey);
  const sent = await postMeta<{ messages?: Array<{ id?: string }> }>(`/${encodeURIComponent(phone.metaPhoneNumberId)}/messages`, accessToken, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizedTo,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(parameters.length ? { components: [{ type: "body", parameters }] } : {}),
    },
  }, "send_message");
  const metaMessageId = sent.messages?.[0]?.id;
  if (!metaMessageId) throw new AppError(502, "Meta accepted the campaign message but did not return a message ID", "META_RESPONSE_INVALID", { stage: "send_message", retryable: true });
  return { metaMessageId, phoneNumberId: phone.id, sentAt: new Date() };
}

/** Removes the connection from this workspace. Full coexistence offboarding is done in WhatsApp Business. */
export async function disconnectWhatsApp(workspaceId: string) {
  const result = await prisma.$transaction(async (transaction) => {
    const accounts = await transaction.whatsAppBusinessAccount.findMany({ where: { workspaceId }, select: { id: true } });
    if (!accounts.length) throw new AppError(404, "No WhatsApp connection was found for this workspace", "WHATSAPP_NOT_CONNECTED");
    const accountIds = accounts.map(({ id }) => id);
    await transaction.whatsAppPhoneNumber.updateMany({ where: { businessAccountId: { in: accountIds } }, data: { status: "DISCONNECTED" } });
    await transaction.whatsAppBusinessAccount.updateMany({
      where: { id: { in: accountIds } },
      data: { status: "DISCONNECTED", encryptedAccessToken: null, tokenExpiresAt: null, lastError: null },
    });
    await transaction.workspaceSetupProgress.updateMany({
      where: { workspaceId },
      data: { whatsappConnectedAt: null, phoneNumberConnectedAt: null, testMessageSentAt: null, completedAt: null },
    });
    return { disconnectedAccounts: accountIds.length };
  });
  return { ...result, message: "WhatsApp was removed from this workspace. To fully disconnect a coexistence number from Cloud API, open WhatsApp Business → Settings → Account → Business Platform → Disconnect Account." };
}

export async function completeEmbeddedSignup(workspaceId: string, input: EmbeddedSignupInput) {
  const { encryptionKey } = requireMetaConfiguration();
  const exchanged = await exchangeSignupCode(input);
  const accessToken = typeof exchanged.access_token === "string" ? exchanged.access_token : undefined;
  if (!accessToken) throw new AppError(502, "Meta did not return an access token", "META_TOKEN_MISSING");

  const waba = await fetchMeta<{ id?: string; name?: string }>(`/${encodeURIComponent(input.wabaId)}?fields=id,name`, accessToken, "load_business_account");
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
  if (phone.is_on_biz_app !== true || phone.platform_type !== "CLOUD_API") {
    throw new AppError(422, "Meta has not confirmed that this WhatsApp Business App number is connected to Cloud API. Complete the coexistence connection in WhatsApp Business App, then launch signup again.", "META_COEXISTENCE_INCOMPLETE");
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

  // Persist first so incoming webhooks can resolve this phone. Meta requires WABA
  // subscription before the one-time sync requests, then contacts before history:
  // https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
  const syncRequestIds: string[] = [];
  const syncWarnings: string[] = [];
  let subscribed = false;
  try {
    await subscribeAppToWaba(input.wabaId, accessToken);
    subscribed = true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "WhatsApp webhook subscription failed.";
    syncWarnings.push(`${reason} Contact and history synchronization were not started. Fix the webhook setup and complete signup again within Meta's 24-hour synchronization window.`);
  }
  if (subscribed && connected.coexistence) {
    for (const syncType of ["smb_app_state_sync", "history"] as const) {
      try {
        syncRequestIds.push(await requestCoexistenceSync(metaPhoneNumberId, accessToken, syncType));
      } catch (error) {
        syncWarnings.push(coexistenceSyncWarning(syncType, error));
      }
    }
  }
  if (syncWarnings.length) {
    await prisma.whatsAppBusinessAccount.update({ where: { id: connected.account.id }, data: { lastError: syncWarnings.join("; ") } });
  }
  return { ...connected, syncRequestIds, syncWarnings };
}
