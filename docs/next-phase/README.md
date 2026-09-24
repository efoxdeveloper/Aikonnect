# Next Phase Requirements

This folder defines the next product phase for Marento. The goal is to move from account creation plus basic workspace setup to a guided onboarding experience with phone verification, business profiling, Meta readiness, and usable developer documentation.

## Documents

1. ONBOARDING_REQUIREMENTS.md — product flow and acceptance criteria.
2. PHONE_VERIFICATION_REQUIREMENTS.md — OTP flow, security, data, and API expectations.
3. DEVELOPER_DOCUMENTATION_REQUIREMENTS.md — documentation that must ship with the platform.
4. IMPLEMENTATION_CHECKLIST.md — implementation order and required code/test files.

## Current baseline

Already present:

- Two-step email/password registration.
- International phone input with complete E.164-style value handling.
- Email verification and resend/change-email flows.
- Workspace creation, onboarding checklist, and WhatsApp activation flow.
- Meta embedded signup, WhatsApp connection, registration PIN, test message, and webhook paths.

Still required for this phase:

- Channel selection: WhatsApp, Instagram, or Both.
- Country/state capture and onboarding profile persistence.
- Phone OTP verification and resend/attempt controls.
- Consent, terms, and reCAPTCHA acceptance.
- Industry/sub-category questionnaire.
- Business objectives with a maximum of three selections.
- Integration-interest selection with Skip support.
- Meta/WhatsApp readiness questions with Skip support.
- Business verification choice flow.
- Complete developer documentation and API examples.

## Phase completion gate

This phase is complete only when:

- A new user can finish onboarding, leave it, and resume it.
- Email and phone verification states are independently persisted and enforced where required.
- Every optional step supports Skip without blocking dashboard access.
- WhatsApp activation can be started from onboarding and from the dashboard.
- All new flows have deterministic frontend/backend tests.
- API, webhook, authentication, and integration documentation is published.
