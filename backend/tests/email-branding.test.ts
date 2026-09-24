import assert from "node:assert/strict";
import { test } from "node:test";
import { env } from "../src/config/env.js";
import { actionEmailHtml } from "../src/services/email.service.js";

test("transactional emails use Marento branding and logo", () => {
  assert.equal(env.SMTP_FROM_NAME, "Marento");
  const html = actionEmailHtml({
    heading: "Verify your email",
    message: "Confirm your email address.",
    buttonLabel: "Verify email",
    actionUrl: "https://app.marento.in/verify-email?token=test",
    expiry: "24 hours",
  });

  assert.match(html, /brand-logo-icon-oly\.png/);
  assert.match(html, /alt="Marento"/);
  assert.match(html, />Marento<\/div>/);
});
