import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../src/middleware/error-handler.js";
import { buildGoogleAuthorizationPage, buildGoogleAuthorizationUrl, parseGoogleIdentity } from "../src/modules/auth/google-oauth.service.js";

const validPayload = {
  iss: "https://accounts.google.com",
  sub: "google-user-123",
  email: "Owner@Example.com",
  email_verified: true,
  given_name: "Google",
  family_name: "Owner",
  name: "Google Owner",
};

test("Google identity parsing requires the expected nonce and verified email", () => {
  assert.deepEqual(parseGoogleIdentity({ ...validPayload, nonce: "nonce-123" }, "nonce-123"), {
    providerAccountId: "google-user-123",
    email: "owner@example.com",
    firstName: "Google",
    lastName: "Owner",
  });

  assert.throws(
    () => parseGoogleIdentity({ ...validPayload, nonce: "wrong-nonce" }, "nonce-123"),
    (error: unknown) => error instanceof AppError && error.code === "GOOGLE_NONCE_INVALID",
  );
  assert.throws(
    () => parseGoogleIdentity({ ...validPayload, nonce: "nonce-123", email_verified: false }, "nonce-123"),
    (error: unknown) => error instanceof AppError && error.code === "GOOGLE_EMAIL_UNVERIFIED",
  );
});

test("Google authorization always uses Google's authorization host", () => {
  const url = new URL(buildGoogleAuthorizationUrl({
    clientId: "client-id.apps.googleusercontent.com",
    redirectUri: "https://aikonnect.example/api/v1/auth/google/callback",
    state: "state-value",
    nonce: "nonce-value",
    codeChallenge: "challenge-value",
  }));

  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.pathname, "/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("redirect_uri"), "https://aikonnect.example/api/v1/auth/google/callback");
  assert.equal(url.searchParams.get("state"), "state-value");
});

test("Google authorization page avoids an external Location redirect", () => {
  const page = buildGoogleAuthorizationPage("https://accounts.google.com/o/oauth2/v2/auth?state=state-value&scope=openid%20email");

  assert.match(page, /http-equiv="refresh"/);
  assert.match(page, /https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?state=state-value&amp;scope=openid%20email/);
  assert.doesNotMatch(page, /<script/i);
});
