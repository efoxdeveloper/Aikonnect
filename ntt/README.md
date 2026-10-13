# @paypilot/ntt

Standalone NTT Node SDK, version 2. Node 20+; TypeScript, ESM and CommonJS; no runtime dependencies. Encryption, decryption, signatures, HTTP calls, callbacks, status, refunds and settlements run inside your server process.

## Install the local package

This package is not yet published to npm. From the repository root:

```sh
npm install
npm pack -w @paypilot/ntt
```

In another project, install the resulting archive:

```sh
npm install /absolute/path/to/paypilot-ntt-2.0.0.tgz
```

Both module systems work:

```js
import { Ntt } from '@paypilot/ntt';
// CommonJS: const { Ntt } = require('@paypilot/ntt');
const ntt = new Ntt();
```

## Environment

Your application loads its environment; the SDK never reads a .env file automatically.

```dotenv
NTT_MODE=uat
NTT_MERCHANT_ID=YOUR_NTT_MERCHANT_ID
NTT_TRANSACTION_PASSWORD=YOUR_NTT_PASSWORD
NTT_API_SECRET_KEY=YOUR_NTT_API_SECRET
NTT_REQUEST_ENCRYPTION_KEY=YOUR_NTT_REQUEST_KEY
NTT_RESPONSE_ENCRYPTION_KEY=YOUR_NTT_RESPONSE_KEY
NTT_REQUEST_HASH_KEY=YOUR_NTT_REQUEST_HASH
NTT_RESPONSE_HASH_KEY=YOUR_NTT_RESPONSE_HASH
```

Optional NTT-issued overrides: NTT_USER_ID, NTT_REQUEST_SALT, NTT_RESPONSE_SALT, NTT_PRODUCT_ID. User ID defaults to merchant ID; salts default to the respective encryption keys, following NTT's supplied sample. Use separate salts when NTT issues them. Never randomly generate or substitute gateway credentials.

NTT_PRODUCT_ID defaults to NSE; set it to the product assigned to your merchant account. API secret is required for the default otsv2 endpoints in the August 2026 specifications. For an NTT-approved legacy account, configure all applicable legacy paths explicitly.

NTT_MODE selects mock, uat or live. Missing mode selects mock only outside production and only without a merchant ID. NODE_ENV=production rejects missing mode and mock mode. NTT_ENVIRONMENT is optional and, if supplied, must match the mode (MOCK/UAT/PRODUCTION).

Optional endpoint overrides: NTT_BASE_URL, NTT_AUTH_PATH, NTT_STATUS_PATH, NTT_REFUND_PATH, NTT_REFUND_STATUS_PATH, NTT_SETTLEMENT_URL. Paths may be HTTPS absolute URLs to support different NTT hosts. Defaults follow the supplied OTS specifications; confirm the account's OTS/AiPay routing during UAT. Live auth/refunds use payment.atomtech.in; live OTS requery uses payment1.atomtech.in. URLs must use HTTPS, with no credentials, queries or fragments.

NTT_TIMEOUT_MS defaults to 15000. Constructor options override environment values; maxResponseBytes defaults to 2 MiB and can be increased to 16 MiB for reports. There are no implicit mutation retries.

## Create a payment and open checkout

Generate/store a unique order ID in your server before this call. Amounts are in major currency units: 10 means ₹10 for INR, with at most two decimal places. Never accept the price from the browser.

```js
const payment = await ntt.payments.create({
  orderId: 'ORDER_1001',
  amount: 10,
  customer: { email: 'buyer@example.com', mobile: '9876543210' },
  returnUrl: 'https://your-app.example/payments/callback',
});
// Persist paymentId, transactionDate, createdAt, and your expected amount/currency.
// Send only payment.checkout and necessary customer details to the browser.
```

Browser code (a separate entry point containing no Node code or credentials):

```js
import { openCheckout } from '@paypilot/ntt/checkout';
await openCheckout({ checkout: payment.checkout, customer });
```

This loads NTT's environment-specific checkout script. Its return value only means checkout opened; it is never proof of payment. Configure CSP/network allowlists for the NTT checkout domain assigned to your environment.

## Verify callbacks

Pass the parsed form object, JSON object, form string or Buffer to verification. Supply order values loaded from your database:

```js
const result = await ntt.payments.verifyCallback(requestBody, {
  paymentId: storedOrder.id,
  amount: storedOrder.expectedTotal,
  currency: 'INR',
});
```

The package decrypts, verifies HMAC, binds merchant identity and compares expected values. The optional second argument adds stored-order matching; without it, your application must perform that comparison itself.

amount/totalAmount are the signed total charge. If NTT adds a surcharge, compare against a server-approved total including that surcharge. Currency is required and normalized, but NTT's callback HMAC does not cover the currency field. The host must enforce its configured currency and reconcile with the gateway before fulfilling a questionable transaction.

providerTransactionId and providerPaymentId in verified callbacks are the Atom ID; bankTransactionId is separate. The raw payload is available for diagnostics but contains customer/payment data: avoid logging it.

Callback verification is intentionally stateless. In a database transaction, deduplicate by merchant + Atom ID, validate the stored order and transition to SUCCESS only once; enqueue fulfillment in that same transaction/outbox. A replayed valid callback must not deliver goods twice. Acknowledge only after durable processing. NTT controls incoming callback retries; confirm its retry policy with your integration team. This package does not dispatch merchant webhooks.

## Status, refunds and settlement reports

```js
await ntt.payments.status({
  paymentId: storedPayment.id,
  amount: storedPayment.amount,
  transactionDate: storedPayment.transactionDate,
  providerTransactionId: storedPayment.atomId,
});
await ntt.refunds.create({
  refundId: 'REFUND_1001',
  paymentId: storedPayment.id,
  providerTransactionId: storedPayment.atomId,
  amount: 5,
});
await ntt.refunds.status({
  refundId: 'REFUND_1001',
  paymentId: storedPayment.id,
  providerTransactionId: storedPayment.atomId,
  providerRefundId: storedRefund.providerRefundId,
});
await ntt.settlements.report({ settlementDate: '2026-09-01' });
```

Status requires the original transactionDate or an explicit createdAt timestamp with timezone, plus the Atom transaction ID for the OTS query. It never substitutes today's date. The supplied requery specification limits queries to 30 days. AiPay-specific query payloads/endpoints are not interchangeable with OTS; obtain matching account configuration from NTT.

Refund creation confirms initiation, not bank completion. Status matches the requested product/refund identifiers exactly. Query errors and unknown payment status codes throw instead of inventing payment outcomes. Unknown refund remarks remain pending. Settlement requests accept exactly one date or Atom ID.

## Errors and safe retries

All SDK errors expose code and requestId. Network errors never include raw upstream headers or credential-bearing URLs. Unknown outcomes must leave stored payment/refund state unchanged.

The SDK does not promise gateway idempotency. Persist a unique merchant order/refund ID and request fingerprint under a database unique constraint, serialize concurrent submissions, and store the response. On timeout or connection loss, reconcile before issuing another mutation; do not blindly repeat payment/refund creation. If the Atom ID is unavailable after a lost callback, use the merchant console/NTT-approved lookup to recover it. Never assume an error means the transaction was not processed.

## Run the complete local example

After installing the tarball into a project:

```sh
node node_modules/@paypilot/ntt/examples/server.mjs
```

Open http://localhost:3000. With no NTT variables it runs an explicit sandbox UI. For UAT, load your environment first; on Node versions supporting --env-file:

```sh
node --env-file=.env node_modules/@paypilot/ntt/examples/server.mjs
```

Set PUBLIC_ORIGIN to your externally reachable callback origin when using a tunnel. The example binds to loopback, uses an in-memory order store and refuses NODE_ENV=production. Replace that demo storage with durable orders, authenticated routes and transactional idempotency for deployment.

Mock creation scenarios: 9991=failure, 9992=pending, 9993=timeout, 9994=success. Normal amounts return INITIATED. Alternatively set metadata.mockScenario to FAILED/PENDING/TIMEOUT/SUCCESS/INITIATED. Mock callback bodies need paymentId, amount, currency and status. openCheckout only opens real UAT/production checkout; simulation belongs on the mock backend.

## Verification and release

```sh
npm test -w @paypilot/ntt
npm run test:package -w @paypilot/ntt
```

The package includes regression tests and an isolated tarball consumer test. See CHANGELOG.md for breaking changes and RELEASE.md for test evidence and outstanding gateway certification. Passing synthetic tests does not certify real NTT transactions.
