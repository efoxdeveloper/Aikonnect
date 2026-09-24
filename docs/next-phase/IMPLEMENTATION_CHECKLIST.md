# Next Phase Implementation Checklist

## Backend files and areas

- Update Prisma schema and add a migration for onboarding profile data, consent records, phone verification challenges, and any channel/readiness fields.
- Extend auth schemas, controller, service, and routes for phone OTP send/verify/resend/change.
- Add onboarding schemas, controller, service, and routes with authenticated ownership checks.
- Add server-side CAPTCHA verification and consent/policy-version validation.
- Add rate limits and audit events for OTP, consent, profile, and activation actions.
- Add API tests for success, validation, authentication, authorization, rate limits, replay, and expiry.

## Frontend files and areas

- Extend Register with channel, country/state, consent, terms, CAPTCHA, and phone-verification states.
- Add reusable onboarding shell, progress indicator, step navigation, and resumable draft loading.
- Add profile steps for industry/sub-category, objectives, integrations, and readiness.
- Update workspace setup/dashboard activation card to show Connect Number and I’ll do it later.
- Extend WhatsApp connection flow with business-verification choices.
- Keep all forms within the existing viewport/scroll/layout rules.
- Add responsive tests and page-level tests for every step and route boundary.

## Developer documentation files

- docs/getting-started.md
- docs/authentication.md
- docs/api-reference.md or an OpenAPI source
- docs/webhooks.md
- docs/whatsapp-integration.md
- docs/errors-and-rate-limits.md
- docs/security-and-operations.md
- docs/examples/ with curl or Postman examples

## Delivery order

1. Data model and migrations.
2. Phone OTP service and tests.
3. Account-create changes and CAPTCHA/consent.
4. Resumable onboarding profile API.
5. Onboarding UI and route guards.
6. Dashboard activation and business-verification choices.
7. API/OpenAPI and developer documentation.
8. Full frontend/backend test pass.
9. Browser QA at desktop and narrow widths.
10. Staging integration verification and release review.

## Release gate

Do not mark this phase complete until:

- Email and phone verification work end to end.
- Onboarding progress survives refresh and re-login.
- Skip paths work.
- WhatsApp activation and business-verification paths are recoverable.
- New tests cover success, validation, authentication, authorization, rate limits, and regressions.
- Backend typecheck/build, frontend typecheck/build, frontend tests, and backend tests pass.
- Documentation examples are tested against the staging API.
