# Onboarding Requirements

## Flow

### 1. Create account

Collect:

- Channel: WhatsApp, Instagram, or Both.
- Country code and phone number.
- First name and last name.
- Work email and password.
- Company name.
- Company website.
- Country and state.
- Annual revenue.
- Consent to receive account updates on WhatsApp.
- reCAPTCHA acceptance.
- Terms and privacy acceptance.

Primary action: Create account.

After account creation:

1. Send email verification.
2. Start phone OTP verification.
3. Continue to the profile questionnaire only after the account is created; do not lose the onboarding draft if either verification is pending.

### 2. Industry selection

Show progress as Step 1 of the profile questionnaire.

Collect:

- Industry.
- Sub-category, filtered by industry.

Primary action: Next.

### 3. Business objectives

Allow a maximum of three selections:

- Automated notifications.
- Chat/support automation.
- Bulk campaigns.
- Click-to-WhatsApp ads.
- WhatsApp forms.
- Other reasons, with a short optional description.

Primary action: Next.

Validation: at least one selection; no more than three.

### 4. Integrations

Options:

- APIs & Webhooks.
- Shopify.
- Google Sheets.
- Facebook Lead Form.
- WhatsApp Pay.
- Razorpay.
- PayU.
- Aspire.
- Xendit.
- Cashfree.

Actions: Skip or Next.

Selections are interests only at this stage. Do not claim that an integration is connected until its actual connection flow succeeds.

### 5. Meta / WhatsApp readiness

Ask:

- Do you have a Facebook Business Manager account? Yes / No.
- Have you used a WhatsApp API number previously? Yes / No.

Actions: Skip or Next.

The answers should guide the activation experience but must not block dashboard access.

### 6. Dashboard and WhatsApp activation

After profiling, send the user to the dashboard with a clear activation card:

- Connect WhatsApp Number.
- Activate subscription or wallet credits offer.
- I’ll do it later.

Primary actions: Connect Number or I’ll do it later.

Existing workspace setup milestones should remain visible:

1. Workspace created.
2. WhatsApp Business connected.
3. Phone number connected.
4. Test message sent.

### 7. Business verification

Show this during WhatsApp connection when Meta/business verification is required.

Collect or offer:

- Business country.
- Already verified by Meta.
- GST certificate.
- Website domain.
- Connect without verification.

Primary action: Connect Number.

The user must be able to return to the setup flow without losing the selected path.

## Behavior requirements

- Persist progress after every successful step.
- Allow the user to resume after refresh, logout/login, or an interrupted provider flow.
- Keep email verification and phone verification statuses separate.
- Keep optional steps non-blocking and visibly marked as skipped.
- Validate all values on the server; frontend validation is only an early feedback layer.
- Record consent timestamp, policy version, source, and user/workspace identity.
- Avoid storing raw OTPs, CAPTCHA secrets, or provider access tokens in frontend state or logs.
- Use the existing shared page/layout and phone-input primitives.

## Minimum acceptance criteria

- A new user can complete the full path without manually editing a calling code.
- A user can skip integrations and readiness questions and still reach the dashboard.
- A user with an incomplete profile sees the correct next step after returning.
- A user can choose WhatsApp, Instagram, or Both and the choice is available to activation logic.
- Invalid, duplicate, or unauthorized onboarding updates are rejected by the API.
