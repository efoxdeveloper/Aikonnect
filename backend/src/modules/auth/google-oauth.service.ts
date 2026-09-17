import { CodeChallengeMethod, OAuth2Client, type TokenPayload } from "google-auth-library";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/error-handler.js";

const googleScopes = ["openid", "email", "profile"];
const googleAuthorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";

export type GoogleOAuthState = {
  state: string;
  nonce: string;
  returnTo: string;
};

export type GoogleIdentity = {
  providerAccountId: string;
  email: string;
  firstName: string;
  lastName: string;
};

function getGoogleClient(): OAuth2Client {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new AppError(503, "Google sign-in is not configured", "GOOGLE_OAUTH_NOT_CONFIGURED");
  }
  return new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: getRedirectUri(),
  });
}

export function getRedirectUri(): string {
  return env.GOOGLE_REDIRECT_URI ?? new URL(`${env.API_PREFIX}/auth/google/callback`, env.APP_URL).toString();
}

export function buildGoogleAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const url = new URL(googleAuthorizationEndpoint);
  url.search = new URLSearchParams({
    access_type: "online",
    prompt: "select_account",
    scope: googleScopes.join(" "),
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
  }).toString();
  return url.toString();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export function buildGoogleAuthorizationPage(authorizationUrl: string): string {
  const safeAuthorizationUrl = escapeHtml(authorizationUrl);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${safeAuthorizationUrl}"><title>Continue with Google</title></head><body><p>Redirecting to Google…</p><p><a href="${safeAuthorizationUrl}">Continue with Google</a></p></body></html>`;
}

export async function createAuthorizationUrl(state: GoogleOAuthState): Promise<{ url: string; codeVerifier: string }> {
  const client = getGoogleClient();
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  if (!codeChallenge) throw new AppError(503, "Google sign-in could not be initialized", "GOOGLE_OAUTH_UNAVAILABLE");

  return {
    url: buildGoogleAuthorizationUrl({
      clientId: env.GOOGLE_CLIENT_ID as string,
      redirectUri: getRedirectUri(),
      state: state.state,
      nonce: state.nonce,
      codeChallenge,
    }),
    codeVerifier,
  };
}

export function parseGoogleIdentity(payload: TokenPayload, expectedNonce: string): GoogleIdentity {
  if (payload.nonce !== expectedNonce) {
    throw new AppError(401, "Google sign-in could not be verified", "GOOGLE_NONCE_INVALID");
  }
  if (!payload.sub || !payload.email || payload.email_verified !== true) {
    throw new AppError(401, "Google did not return a verified email address", "GOOGLE_EMAIL_UNVERIFIED");
  }

  const fullName = payload.name?.trim() ?? "";
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const firstName = (payload.given_name?.trim() || nameParts[0] || "Google").slice(0, 100);
  const lastName = (payload.family_name?.trim() || nameParts.slice(1).join(" ") || "User").slice(0, 100);

  return {
    providerAccountId: payload.sub,
    email: payload.email.trim().toLowerCase(),
    firstName,
    lastName,
  };
}

export async function exchangeCode(code: string, codeVerifier: string, expectedNonce: string): Promise<GoogleIdentity> {
  const client = getGoogleClient();
  try {
    const { tokens } = await client.getToken({ code, codeVerifier, redirect_uri: getRedirectUri() });
    if (!tokens.id_token) throw new Error("Google did not return an ID token");
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload) throw new Error("Google returned an empty ID token");
    return parseGoogleIdentity(payload, expectedNonce);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(401, "Google sign-in could not be completed", "GOOGLE_AUTH_FAILED");
  }
}
