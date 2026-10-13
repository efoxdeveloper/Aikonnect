# Release verification

This SDK has automated protocol fixtures and packaging checks. Real merchant UAT certification is still required before processing production funds.

## Protocol references used

- NTT official Node sample: https://github.com/nttdatapay/nttdatapay-nodejs/blob/main/app.js
- Transaction API Non-Seamless V6 07.08.2026.pdf (repository root): auth v2 and callback structure.
- Transaction Status (Requery) API _OTS_NDPS_V1.20_07.08.2026.pdf: OTS request, India transaction date, response mapping (p24), signatures.
- Refund API_NDPS_v1.4.pdf: single-product refund request/response, partial/full initiation codes.
- Refund Status API_v1.3.pdf: nested product/refund status matching and base64 password.
- Settlement API Document_NDPS.pdf: encrypted pipe-delimited request and JSON array response.

## Automated acceptance

- Package builds with its own TypeScript configuration and dev dependencies.
- ESM and CommonJS load through package exports.
- Synthetic encrypted requests/responses, signatures, callback merchant/order checks.
- Monetary precision, original transaction dates, consistent Atom/bank identifiers.
- Refund mismatches, ambiguous lookups, malformed responses and unknown statuses fail safely.
- HTTP failures, timeouts, body read errors and oversized responses preserve diagnostics.
- No credential disclosure when serializing/logging the SDK.
- Isolated tarball install exercises the same regression suite outside the repository.

Run npm test and npm run test:package in this package. The repository workflow tests Node 20, 22 and 24.

## Deployment acceptance still requiring the merchant/NTT

1. Confirm assigned product, credentials, API-secret requirement and OTS versus AiPay routing.
2. Whitelist server IP and checkout/callback domains; verify HTTPS callback reachability.
3. Complete UAT checkout success, decline, cancel, pending, timeout and delayed callback/requery.
4. Verify full and partial refund initiation/status and the account's exact completed-refund remarks.
5. Reconcile a real settlement report against the merchant console.
6. Test durable order/refund idempotency, callback replay and fulfillment deduplication in the consuming application's database.

The package remains unpublished. Do not claim production certification until these checks have evidence.
