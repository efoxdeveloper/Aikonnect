export const PRICING_CATEGORIES = ["MARKETING", "UTILITY", "AUTHENTICATION"] as const;
export type PricingCategory = (typeof PRICING_CATEGORIES)[number];

export const PRICING_TYPES = ["REGULAR", "FREE_CUSTOMER_SERVICE", "FREE_ENTRY_POINT", "VOLUME_TIER"] as const;
export type PricingType = (typeof PRICING_TYPES)[number];

export const RATE_CARD_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type RateCardStatus = (typeof RATE_CARD_STATUSES)[number];

export const RATE_CARD_SOURCES = ["META_RATE_CARD", "MANUAL", "IMPORT"] as const;
export type RateCardSource = (typeof RATE_CARD_SOURCES)[number];

export const BILLING_STATUSES = ["NOT_APPLICABLE", "ESTIMATED", "RESERVED", "CHARGED", "RELEASED", "RECONCILED"] as const;
