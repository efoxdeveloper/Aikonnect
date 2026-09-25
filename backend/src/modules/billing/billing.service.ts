import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../middleware/error-handler.js";
import { getBillingSettings, reserveMessage, releaseReservation, captureReservation, refundReservation } from "../wallet/wallet.service.js";
import type { PricingSnapshot } from "../whatsapp-pricing/pricing.service.js";

export const BILLING_MODES = ["CUSTOMER_META_BILLING", "MARRENTO_SHARED_BILLING"] as const;
export type BillingMode = (typeof BILLING_MODES)[number];

function decimal(value: string | Prisma.Decimal) { return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value); }
function fixed(value: Prisma.Decimal) { return value.toFixed(6); }

export async function resolveBilling(workspaceId: string, pricing: PricingSnapshot) {
  const settings = await getBillingSettings(workspaceId);
  const mode = settings.billingMode as BillingMode;
  if (!BILLING_MODES.includes(mode)) throw new AppError(422, "The workspace billing mode is not configured", "BILLING_MODE_NOT_CONFIGURED");
  if (settings.currency !== pricing.currency) throw new AppError(409, "The wallet currency does not match the WhatsApp pricing currency", "CURRENCY_MISMATCH", { walletCurrency: settings.currency, pricingCurrency: pricing.currency });
  const meta = decimal(pricing.metaRate);
  const platform = decimal(pricing.platformFee);
  const customer = decimal(pricing.customerRate);
  const walletCharge = settings.walletRequired === false ? new Prisma.Decimal(0) : mode === "CUSTOMER_META_BILLING" ? platform : customer;
  return { settings, mode, metaAmount: meta, platformFee: platform, customerAmount: customer, walletChargeAmount: walletCharge, currency: settings.currency, walletRequired: settings.walletRequired };
}

export async function reserveMessageBilling(input: { workspaceId: string; messageId: string; pricing: PricingSnapshot; clientReference?: string; idempotencyKey: string }) {
  const billing = await resolveBilling(input.workspaceId, input.pricing);
  const result = await reserveMessage({ workspaceId: input.workspaceId, messageId: input.messageId, rateCardId: input.pricing.rateCardId, metaAmount: billing.metaAmount, platformFee: billing.platformFee, customerAmount: billing.customerAmount, walletChargeAmount: billing.walletChargeAmount, currency: billing.currency, billingMode: billing.mode, idempotencyKey: input.idempotencyKey, clientReference: input.clientReference, allowNegativeBalance: billing.settings.allowNegativeBalance, creditLimit: billing.settings.creditLimit });
  return { ...billing, reservation: result.reservation, wallet: result.wallet, replayed: result.replayed, billing: { currency: billing.currency, estimatedMetaCost: fixed(billing.metaAmount), platformFee: fixed(billing.platformFee), reservedAmount: fixed(billing.walletChargeAmount), status: result.reservation ? "RESERVED" : "NOT_APPLICABLE" } };
}

export async function releaseMessageBilling(messageId: string, reason: string) { return releaseReservation({ messageId, reason }); }
export async function captureMessageBilling(messageId: string, externalReference?: string) { return captureReservation({ messageId, externalReference }); }
export async function refundMessageBilling(reservationId: string, amount?: string, createdById?: string, reason?: string) { return refundReservation({ reservationId, amount, createdById, reason }); }
