import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../src/middleware/error-handler.js";
import { parseGoogleIdentity } from "../src/modules/auth/google-oauth.service.js";

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
