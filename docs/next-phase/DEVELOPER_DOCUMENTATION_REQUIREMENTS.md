# Developer Documentation Requirements

Developer documentation must ship as a usable integration guide, not only a list of endpoints.

## Required documentation set

### 1. Getting started

- Product overview.
- Local prerequisites.
- Frontend and backend setup.
- Environment variables without real secrets.
- Database migration and seed expectations.
- Health checks.
- Development, test, build, and deployment commands.

### 2. Authentication

- Login and registration.
- Access-token and refresh-session behavior.
- Email and phone verification.
- Google OAuth configuration.
- Password recovery.
- Logout and session revocation.
- Required headers, cookies, expiry, and security rules.

### 3. API reference

Document request, response, validation, authorization, and examples for:

- Workspaces and memberships.
- Contacts, custom fields, tags, segments, tasks, and notes.
- Conversations, messages, inbox, and realtime behavior.
- Templates and Meta submission.
- Campaigns.
- Automations and workflows.
- WhatsApp accounts, phone numbers, test messages, and registration PIN.
- API keys.
- Webhook endpoints and events.
- Usage, wallets, billing, and reports.
- Platform-admin endpoints.

Prefer an OpenAPI source or equivalent machine-readable contract so examples and client generation can remain consistent.

### 4. Webhooks and integrations

- Webhook registration.
- Verification handshake.
- Signature validation.
- Retry and idempotency behavior.
- Event catalog and payload examples.
- Meta/WhatsApp setup prerequisites.
- Google, Shopify, payments, and future connector expectations.

### 5. Errors and limits

- Standard error envelope.
- Error code catalog.
- Validation examples.
- Authentication and authorization failures.
- Rate limits and retry guidance.
- Provider failure mapping and safe user-facing messages.

### 6. Security and operations

- Secret management.
- CORS and allowed origins.
- Token encryption/rotation.
- PII handling and retention.
- Audit logs.
- Logging redaction.
- Backup, restore, health, monitoring, and incident contact.

## Documentation acceptance criteria

- A new developer can run the project locally from the docs.
- A developer can authenticate and call one protected endpoint.
- A developer can create a workspace contact and understand authorization scope.
- A developer can configure and validate a webhook.
- A developer can connect WhatsApp in a test environment and send a test message.
- Every documented example is tested or manually verified before release.
