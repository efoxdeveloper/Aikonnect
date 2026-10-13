# AiKonnect Backend

TypeScript Express API with Prisma ORM, PostgreSQL pooling, secure session-based
authentication, workspace-scoped RBAC, validated configuration, structured logging,
security middleware, rate limiting, health checks, and graceful shutdown.

## Run locally

1. Copy `.env.example` to `.env` and provide the environment-specific values.
2. Install dependencies with `npm install`.
3. Generate Prisma Client with `npm run prisma:generate`.
4. Apply committed migrations with `npm run prisma:migrate:deploy`.
5. Verify PostgreSQL with `npm run db:check`.
6. Start development mode with `npm run dev`.

The API defaults to `http://localhost:5006`. Its health endpoints are:

- `GET /api/v1/health`
- `GET /api/v1/health/ready`

Build production output with `npm run build`, then run it with `npm start`.

## Main APIs

- `/api/v1/auth` — registration, login, refresh, logout, recovery, verification
- `/api/v1/workspaces` — workspace, membership, invitation, role and permission flows
- `POST /api/v1/workspaces/:workspaceId/wallet/topups` — create an authenticated NTT wallet recharge
- `POST /api/v1/payments/ntt/callback` — verify NTT payment callbacks and credit the wallet once

## NTT wallet recharges

The `@paypilot/ntt` SDK is installed from the repository's local `ntt/` package in
both applications. Local development defaults to `NTT_MODE=mock`; the Billing &
Usage page exposes a mock-only payment simulator for exercising the credit flow.
Apply migrations before running the API so pending recharges can be durably stored.

For UAT or production, use NTT-issued credentials in the backend environment and
set `NTT_CALLBACK_URL` to the externally reachable HTTPS URL
`https://<api-host>/api/v1/payments/ntt/callback`. Set
`NTT_FRONTEND_RETURN_URL` to the frontend Billing & Usage route. Configure the same
callback URL in the NTT merchant account. Never use mock mode in production.
Payment state is confirmed by a verified callback or status requery; opening checkout
does not add funds.

Refresh tokens are opaque, rotated, stored only as SHA-256 hashes, and delivered in
an HttpOnly cookie. Access tokens are short-lived bearer tokens. Passwords are hashed
with Node's memory-hard `scrypt` implementation.
