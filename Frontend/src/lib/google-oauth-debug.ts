type GoogleOAuthLogDetails = Record<string, boolean | number | string | null | undefined>;

/**
 * Google OAuth diagnostics intentionally accept only non-sensitive metadata.
 * Never pass authorization codes, state values, nonces, PKCE verifiers, or
 * cookies to this logger.
 */
export function logGoogleOAuthEvent(
  event: string,
  details: GoogleOAuthLogDetails = {},
  level: "info" | "warn" = "info",
): void {
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    ...details,
  };

  if (level === "warn") {
    console.warn("[Google OAuth]", payload);
    return;
  }

  console.info("[Google OAuth]", payload);
}
