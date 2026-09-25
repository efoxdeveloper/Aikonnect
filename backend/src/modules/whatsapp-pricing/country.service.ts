import { getCountryCallingCode, isSupportedCountry, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";
import { AppError } from "../../middleware/error-handler.js";

export type PricingCountry = { countryCode: string; callingCode: string; countryName: string };

function countryName(countryCode: string) {
  return new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) ?? countryCode;
}

export function resolvePricingCountry(phoneNumber: string): PricingCountry {
  const input = phoneNumber.trim();
  const international = input.startsWith("+") ? input : input.replace(/\D/g, "") ? `+${input.replace(/\D/g, "")}` : "";
  const parsed = international ? parsePhoneNumberFromString(international) : undefined;
  const code = parsed?.country;
  if (!code || !isSupportedCountry(code)) {
    throw new AppError(422, "The recipient country could not be resolved from the WhatsApp number", "COUNTRY_NOT_RESOLVED");
  }
  return { countryCode: code, callingCode: getCountryCallingCode(code as CountryCode), countryName: countryName(code) };
}

export function validatePricingCountryCode(countryCode: string): string {
  const normalized = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized) || !isSupportedCountry(normalized as CountryCode)) {
    throw new AppError(422, "The country code is not a valid ISO 3166-1 country code", "COUNTRY_NOT_RESOLVED");
  }
  return normalized;
}
