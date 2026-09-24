# Marento Project Status

**Snapshot date:** 2026-09-24  
**Repository:** D:\ETPL-03\WORKSPACE\Pawan\Marento  
**Branch / HEAD:** main / e76ae12 — Update Marento branding and application features  
**Overall status:** Active development. The product has a broad working SaaS surface, but it is not yet at production sign-off because the working tree is uncommitted, the full frontend suite has known failures, and external integrations still require environment-level validation.

## 1. Product summary

Marento is a multi-tenant customer operations and WhatsApp engagement platform built from:

- A React/Vite authenticated workspace application.
- An Express/TypeScript API.
- Prisma ORM with PostgreSQL.
- Workspace memberships, roles, permissions, invitations, and onboarding.
- CRM contacts, conversations, inbox, campaigns, templates, automation, reporting, billing, and platform administration.
- Meta/WhatsApp Cloud API integrations, embedded signup, webhooks, messaging, and coexistence onboarding.

| Area | Location | Technology | Current state |
| --- | --- | --- | --- |
| Frontend | Frontend/ | React 19, TypeScript, Vite, Tailwind, MUI, Radix | Broad application surface with page/component tests |
| Backend | backend/ | Express 5, TypeScript, Prisma 7, PostgreSQL | Modular API with migrations, validation, RBAC, and tests |
| Deployment | scripts/, ecosystem.config.cjs | Node deployment script, PM2 | Deployment tooling is present |

## 2. Product coverage

The requirements for the next phase are documented in `docs/next-phase/`, covering onboarding, phone verification, developer documentation, and the implementation checklist.

### Authentication and account access — implemented

- Email/password registration with a two-step form.
- International phone input using react-international-phone, defaulting to India (+91) and returning the complete phone number.
- Password login and Google OAuth start/callback flow.
- Email verification, resend verification, change-unverified-email, forgot password, and reset password.
- HttpOnly refresh-cookie sessions plus short-lived access tokens.
- Public-only and protected route guards.
- Invitation-aware registration, verification, login, and acceptance.
- The verification page has a Go to login action. It signs out and routes to /login, including waiting, processing, error, and success states.

### Workspace and administration — implemented in code

- Workspace setup dashboard and onboarding checklist.
- Workspace settings, logo upload, company details, and active membership lookup.
- Team members, roles, permissions, invitations, and access checks.
- Platform administration for workspaces, users, WhatsApp connections, billing, usage, health, webhooks, audit logs, feature flags, and platform settings.

### CRM and customer operations — implemented in code

- Contacts with search, filtering, sorting, pagination, soft-delete, import/export, tags, segments, custom fields, consent tracking, profile images, tasks, and notes.
- Contact detail and activity views.
- Conversations, messages, inbox views, unread counts, realtime inbox support, chat actions, and contact-linked messaging.
- Pipelines and contact pipeline fields.

### Marketing and automation — implemented in code

- Campaigns, recipients, delivery metrics, message snapshots, and delivery hardening.
- WhatsApp template library and builder with headers, body variables/examples, buttons, media, authentication/OTP options, carousel and product-oriented types, AI preflight, and Meta submission.
- Automation rule builder, triggers, actions, conditions, variables, activity logs, execution, and logs.
- Workflow builder, flow canvas, branches, edges, execution, and run history.
- Current uncommitted work adds Meta template variable-ratio validation, safe handling of provider error 2388293, and form-preserving validation UI.

### WhatsApp and Meta integrations — implemented in code; external verification required

- WhatsApp Business account setup and connection status.
- Meta embedded signup for coexistence and fresh-number onboarding.
- Registration PIN flow for new numbers.
- Cloud API account/phone handling, test messaging, disconnect, billing attachment, and refresh.
- Webhook verification and event processing.
- Provider error sanitization and outbound-message wallet charging/refunding paths.

### Billing, usage, developer, and reporting — implemented in code

- Usage reports, wallet ledger/configuration, billing/subscription-facing views.
- API key management and public API support.
- Webhook endpoint management and webhook events.
- Integrations view.
- Reports, campaign analytics, conversation analytics, and platform usage views.

## 3. Frontend structure

Application bootstrap is:

    main.tsx
      └── App.tsx
          ├── BrowserRouter
          ├── AuthProvider
          ├── AppRoutes
          └── Toaster

The authenticated shell uses AppShell, shared header/sidebar primitives, DashboardLayout, and a viewport-bound dashboard page region. Platform-role users use PlatformAdminLayout.

Public routes:

- /login
- /register
- /forgot-password
- /verify-email
- /invitations/accept

Main workspace routes:

- /dashboard, /inbox, /contacts, /campaigns, /templates
- /automations, /pipelines, /tasks, /reports
- /conversation-analytics, /campaign-analytics
- /integrations, /api-webhooks, /whatsapp-account
- /team-members, /billing, /account-settings

Platform administration is under /admin and is protected by PlatformAdminRoute plus role-filtered navigation.

## 4. Backend and database

The API is mounted under /api/v1 by default. The Express app currently provides:

- Helmet security headers and CSP.
- Configured CORS with credentials.
- Compression, cookie parsing, body limits, request IDs, and structured Pino logging.
- Global and credential/verification rate limiting.
- Zod request validation and centralized error handling.
- Health endpoints at GET /api/v1/health and GET /api/v1/health/ready.

Backend modules include admin, api-keys, auth, automations, campaigns, contacts, conversations, health, reports, templates, usage, wallet, webhooks, whatsapp, workflows, and workspaces.

Database state:

- Prisma schema: backend/prisma/schema.prisma.
- PostgreSQL is the configured database.
- There are currently 38 committed Prisma migration SQL files covering auth, workspaces, onboarding, contacts, conversations, templates, automation, workflows, campaigns, WhatsApp coexistence, API keys, billing/wallet, platform administration, audit logs, and related indexes/constraints.
- Generated Prisma client output is present under backend/src/generated/prisma.

## 5. Working-tree state

The worktree is not clean. Existing changes have been preserved and must be reviewed before committing or deploying.

### Current auth/branding changes

- Frontend/src/components/auth/AuthShell.tsx: auth mark now uses Frontend/public/brand-logo-icon-oly.png.
- Frontend/src/components/auth/AuthShell.test.tsx: asset-path regression coverage.
- Frontend/src/pages/VerifyEmail.tsx: login escape action that signs out before navigating to /login.
- Frontend/src/pages/VerifyEmail.test.tsx: verification/login escape coverage.
- Frontend/public/brand-logo-icon-oly.png: new/untracked brand asset.

### Other uncommitted changes present

- Frontend/src/pages/TemplateBuilder.tsx
- Frontend/src/pages/TemplateBuilder.test.tsx
- backend/src/modules/templates/meta-template-payload.ts
- backend/src/modules/whatsapp/whatsapp.service.ts
- backend/tests/templates-meta.test.ts

These changes improve Meta template variable validation, provider-error sanitization, and form-preserving validation UI. They should be reviewed and committed as a separate logical change if that reflects the intended history.

## 6. Verification performed

Passing checks:

- Focused verification suite: Frontend/src/pages/VerifyEmail.test.tsx — 4 tests passed.
- Frontend production build: npm run build from Frontend/ — passed.
- Backend typecheck: npm run typecheck from backend/ — passed.
- Backend TypeScript build: npm run build from backend/ — passed.
- Earlier focused auth suite covering AuthShell, Login, and Register: 3 files / 10 tests passed.

Full frontend baseline:

- 51 test files / 236 tests were executed.
- 47 test files / 231 tests passed.
- 5 tests failed in 4 files.

Observed failures:

1. src/styles/typography.test.ts: paragraph typography scan reports many existing Tailwind paragraph-class violations; sidebar assertion expects truncate leading-5, while the current component uses MUI ListItemText styling.
2. src/pages/Campaigns.test.tsx: campaign-row navigation test timed out and emitted Not implemented: navigation to another Document.
3. src/pages/ContactHub.test.tsx: create-contact dialog test timed out.
4. src/pages/VerifyEmail.test.tsx: the new route assertion was timing-sensitive under the full parallel suite and was changed to wait for the navigation update. The focused suite passes after that adjustment.

The full frontend suite should be rerun after the verification-test adjustment. The Campaigns, ContactHub, and typography failures still need separate investigation.

## 7. Configuration and external dependencies

Local development requires environment configuration for:

- Frontend API and Meta app/config IDs.
- PostgreSQL.
- Access-token and refresh-session settings.
- SMTP delivery for verification/password emails.
- Meta app, webhook, system-user, encryption, and Graph API settings.
- Google OAuth client and callback settings.
- Optional Groq AI template-preflight settings.
- Wallet currency and outbound-message pricing.

Actual .env files are environment-specific and must not be committed or copied into documentation. External behavior is not production-verified until PostgreSQL, SMTP, Meta, Google OAuth, and any selected AI provider are configured and exercised in the target environment.

## 8. Risks and open work

1. Get the full frontend suite green.
2. Run backend unit/integration tests against an isolated PostgreSQL test database.
3. Validate email delivery, Google OAuth callbacks, Meta embedded signup, webhook signatures, WhatsApp messaging, and wallet charging/refunds end to end.
4. Separate and review the current uncommitted changes before release.
5. Address the frontend production chunk warning: the main JavaScript bundle is approximately 3.2 MB minified before gzip. Route-level code splitting/manual chunks should be considered.
6. Perform desktop and narrow viewport QA for auth, contacts, inbox, templates, WhatsApp setup, drawers, dialogs, and data tables.
7. Expand root documentation beyond this snapshot with clean setup, architecture links, and deployment instructions.

## 9. Recommended next sequence

1. Review and logically separate the current uncommitted changes.
2. Fix the Campaigns, ContactHub, and typography test failures.
3. Rerun the full frontend suite and both production builds.
4. Run backend tests with an isolated test database.
5. Perform environment-backed email, Meta, Google, and WhatsApp verification.
6. Complete responsive/browser QA.
7. Deploy only from a clean, reviewed worktree using the existing deployment script/PM2 process.

## 10. Useful commands

    # Frontend
    cd Frontend
    npm run dev
    npm run test
    npm run build

    # Backend
    cd backend
    npm run dev
    npm run typecheck
    npm run build
    npm run test
    npm run test:integration
    npm run db:check
    npm run email:check
    npm run prisma:migrate:deploy

    # Root convenience commands
    cd ..
    npm run dev
    npm run test
    npm run build

## Bottom line

Marento is beyond the scaffold stage: core product, API, authentication, workspace, CRM, inbox, marketing, automation, WhatsApp, billing, and platform-admin surfaces are represented in the codebase with substantial automated coverage. The current stage is feature-rich active development, not release-ready. The immediate gate is a clean reviewed worktree, a green full frontend suite, and environment-backed integration verification.
