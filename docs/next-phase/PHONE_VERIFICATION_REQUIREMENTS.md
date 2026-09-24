# Phone Verification Requirements

## Purpose

Verify the phone number collected during account creation before treating it as a trusted account-contact channel. The stored number must remain a complete international number, using the existing shared phone component and library metadata.

## Placement in onboarding

1. User submits Create account.
2. Account and onboarding draft are created.
3. Server sends a six-digit OTP to the normalized phone number.
4. User enters the OTP.
5. On success, mark the phone verified and continue to the profile questionnaire.
6. Email verification remains a separate required state.

If delivery fails, the account must remain recoverable through resend, change-number, and login flows.

## Required UI states

- Enter OTP.
- Sending.
- Verifying.
- Verified.
- Invalid OTP.
- Expired OTP.
- Too many attempts.
- Resend cooldown.
- Delivery failure.
- Change phone number.
- Continue later, when product policy allows it.

Display the masked destination number and a countdown/cooldown for resend. Never display the OTP itself.

## Proposed API surface

These endpoints are requirements for the implementation; use the existing API conventions and validation middleware:

- POST /api/v1/auth/phone/send-otp
- POST /api/v1/auth/phone/verify-otp
- POST /api/v1/auth/phone/resend-otp
- PATCH /api/v1/auth/phone

Each endpoint must require the correct authentication state and reject cross-user or cross-workspace access.

## Security requirements

- Normalize and store the complete phone number in international format.
- Store only a hash of the OTP.
- OTP expiry: 10 minutes unless product/security review chooses a different value.
- Maximum verification attempts per challenge: 5.
- Resend cooldown: 60 seconds.
- Invalidate previous challenges when a new OTP is issued.
- Apply per-user, per-phone, and per-IP rate limits.
- Do not log OTP values, provider credentials, or full phone numbers.
- Audit successful verification, failed attempts, resend events, and phone changes.
- Require re-authentication or the account password before changing a verified phone.

## Data requirements

Use either a dedicated PhoneVerificationChallenge model or an equivalent secure table containing:

- User ID.
- Normalized phone number.
- OTP hash.
- Created and expiry timestamps.
- Consumed timestamp.
- Attempt count.
- Last-send timestamp.
- Delivery provider/message ID when safe to retain.

The user record should expose:

- Phone number.
- Phone verified timestamp.
- Phone verification status if the product needs more than a timestamp.

## Tests required

- Successful send and verify.
- Invalid and expired OTP.
- Consumed OTP cannot be reused.
- Attempt limit and resend cooldown.
- Changing the number invalidates the previous challenge.
- Unauthorized user cannot verify or change another user's number.
- API never returns or logs the raw OTP.
- Registration cannot lose its onboarding draft when phone delivery fails.
