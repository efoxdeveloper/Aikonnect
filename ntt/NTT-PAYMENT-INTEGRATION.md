# NTT Payment Package and Project Integration

This guide explains the local `@paypilot/ntt` package and how Lotus Cafe uses it. It is intended for developers integrating NTT payments into this project or another Node.js service.

## What the package does

`@paypilot/ntt` is a Node.js SDK for NTT Data / Atom payment services. The package is maintained in [`ntt/`](ntt/README.md), and the backend installs a built package archive from [`Project/backend/vendor/paypilot-ntt-2.0.0.tgz`](Project/backend/vendor/paypilot-ntt-2.0.0.tgz).

The SDK provides:

- Server-side payment creation and checkout token generation.
- Encrypted request/response handling, signatures, and callback verification.
- Payment status queries, refunds, refund status, and settlement reports.
- ESM and CommonJS entry points, TypeScript declarations, and a separate browser checkout entry point.
- Mock mode for local integration work.

The SDK does not own your order database, enforce application-level idempotency, deliver goods, or dispatch your own webhooks. The consuming application must store payment state and make fulfillment idempotent.

## Package layout and versioning

- `ntt/src/` is the SDK source.
- `ntt/dist/` contains its built ESM and CommonJS output.
- `ntt/checkout` is the browser-only checkout helper entry point.
- `Project/backend/vendor/paypilot-ntt-2.0.0.tgz` is the package archive installed by the backend.

When changing SDK code, rebuild and repack the package, update the backend archive and lockfile as needed, then install/build the backend against that archive. Editing `ntt/src` alone does not change the backend's installed dependency.

## Install and configure

The package is local to this repository and is not assumed to be available from the public npm registry. To build an archive from the repository root:

```sh
npm install
npm pack -w @paypilot/ntt
```

To install the current archive into another Node.js project:

```sh
npm install /path/to/paypilot-ntt-2.0.0.tgz
```

The host application must load its environment variables before constructing the client. The SDK does not load `.env` files itself.

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

Use the credentials and endpoint configuration issued for your merchant account. Do not generate substitute gateway credentials. `NTT_MODE` supports `mock`, `uat`, and `live`; production rejects implicit or mock configuration. Optional endpoint and account-specific settings are documented in [`ntt/README.md`](ntt/README.md#environment), including `NTT_PRODUCT_ID`, salts, status/refund paths, base URL, and timeout.

In Lotus Cafe, NTT settings are validated in [`Project/backend/src/config/env.ts`](Project/backend/src/config/env.ts). The callback and browser return URLs are configured separately:

```dotenv
NTT_CALLBACK_URL=https://api.example.com/api/payments/ntt/callback
NTT_FRONTEND_RETURN_URL=https://cafe.example.com/#/student/payment-success
NTT_WALLET_RETURN_URL=https://cafe.example.com/#/student/wallet
```

The callback URL must be reachable over HTTPS by NTT in UAT/production. Configure NTT's merchant dashboard and network allowlists to match the deployed URLs and domains.

## Minimal server-side payment flow

Create one SDK client on the server:

```js
import { Ntt } from '@paypilot/ntt';

const ntt = new Ntt();
```

Before calling NTT, create a durable local order/payment record and generate a unique merchant transaction ID. Use a server-calculated amount; never trust an amount sent by the browser.

```js
const payment = await ntt.payments.create({
  orderId: 'PAY_01JEXAMPLE1234567890',
  amount: 125.5, // Major units: INR 125.50
  currency: 'INR',
  customer: {
    name: 'Customer Name',
    email: 'buyer@example.com',
    mobile: '9876543210',
  },
  returnUrl: 'https://api.example.com/api/payments/ntt/callback',
  metadata: { source: 'my-app' },
});

// Persist payment.paymentId, transactionDate, requestId, status, and checkout.
// Return only the checkout fields and necessary customer details to the browser.
```

Keep your internal database ID separate from the merchant transaction ID and NTT/Atom transaction ID. Persist the exact expected amount, currency, original transaction date, and gateway IDs needed for later verification and status requests.

## Open the hosted checkout

The package's browser entry point can open checkout without exposing server credentials:

```js
import { openCheckout } from '@paypilot/ntt/checkout';

await openCheckout({
  checkout: payment.checkout,
  customer: { email: 'buyer@example.com', mobile: '9876543210' },
});
```

Opening checkout is not confirmation that the payment succeeded. Only a verified callback or a successful server-side status query should move the durable payment to `SUCCESS`.

In Lotus Cafe, the browser currently loads NTT's hosted script and calls `AtomPaynetz` directly in `StudentPaymentSuccess.tsx` and `StudentWalletTopup.tsx`. It does not currently import `@paypilot/ntt/checkout`; the backend creates the token, and the frontend opens it. The two components also contain their own checkout setup, so changes to checkout loading may need to be reflected in both locations.

## Verify and process callbacks

Configure an unauthenticated server endpoint for NTT's callback. Pass the received body to the SDK verifier and match the verified result against your stored payment. The SDK accepts supported parsed objects and form-encoded request forms; configure body parsing to preserve the format NTT sends.

```js
const verified = await ntt.payments.verifyCallback(request.body, {
  paymentId: storedPayment.merchantPaymentId,
  amount: storedPayment.expectedTotal,
  currency: 'INR',
});
```

In one database transaction:

1. Lock/load the payment row and confirm merchant, payment reference, expected total, and configured currency.
2. Deduplicate the callback using a stable gateway reference (merchant plus Atom transaction ID where available).
3. Apply the payment state transition once.
4. Credit a wallet or enqueue order fulfillment in the same transaction/outbox.
5. Acknowledge only after durable processing.

Valid callbacks can be replayed. Do not fulfill an order or credit a wallet twice. Do not mark a payment failed just because a status request timed out or returned an unrecognized response. Callback amount fields represent the total charge; account for any approved surcharge and reconcile differences before fulfillment. The SDK README documents the callback currency and signature limitations in more detail.

## Query status, refunds, and settlements

Status checks use stored payment information, including the original transaction date and Atom transaction ID where required:

```js
const status = await ntt.payments.status({
  paymentId: storedPayment.merchantPaymentId,
  amount: storedPayment.expectedTotal,
  currency: 'INR',
  transactionDate: storedPayment.transactionDate,
  providerTransactionId: storedPayment.atomTransactionId,
});
```

Refund initiation and refund status are separate operations. Initiation does not mean funds have reached the customer:

```js
const refund = await ntt.refunds.create({
  refundId: 'REFUND_01JEXAMPLE1234567890',
  paymentId: storedPayment.merchantPaymentId,
  providerTransactionId: storedPayment.atomTransactionId,
  amount: 25,
  currency: 'INR',
});

const refundStatus = await ntt.refunds.status({
  refundId: 'REFUND_01JEXAMPLE1234567890',
  paymentId: storedPayment.merchantPaymentId,
  providerTransactionId: storedPayment.atomTransactionId,
  providerRefundId: refund.providerRefundId,
});
```

The SDK also exposes `ntt.settlements.report({ settlementDate })`. Consult the package README for required fields, date rules, endpoint compatibility, and response handling.

## How Lotus Cafe wires the package

| Concern | Project location | What it does |
|---|---|---|
| SDK instance and transport | `Project/backend/src/modules/payments/ntt.client.ts` | Creates the server SDK client, adds a limited pre-connection retry, normalizes callback/status data, and supports the merchant's legacy callback/status contracts. |
| Order payment creation | `Project/backend/src/modules/orders/orders.controller.ts` | Computes UPI pricing, saves a merchant reference before the network request, creates NTT checkout, and persists the result on the order. |
| Wallet top-up creation | `Project/backend/src/modules/wallet/wallet-topups.controller.ts` and `wallet-topups.service.ts` | Creates an idempotent top-up attempt, initializes checkout, handles uncertain outcomes, and credits the wallet transactionally after confirmation. |
| Callback and status routes | `Project/backend/src/modules/payments/payments.routes.ts` and `payments.controller.ts` | Accepts browser return and NTT callback requests, verifies callback data, resolves the payment target, applies state, logs processing, and exposes requery handlers. |
| Wallet endpoints | `Project/backend/src/modules/wallet/wallet.routes.ts` | Exposes authenticated top-up creation, lookup, cancellation, and requery routes. |
| Requery worker | `Project/backend/src/workers/wallet-topup-requery.ts` and `modules/wallet/wallet-topup-requery.service.ts` | Rechecks unresolved wallet payments and persists retry scheduling/leases. |
| Persistent gateway fields | `Project/backend/src/db/migrations/136_ntt_payment_metadata.sql` and later payment migrations | Stores transaction dates, provider/bank references, callback receipt, refund state, pricing/reconciliation, and requery metadata. |

Main routes include:

- `POST /api/orders` — create an order; UPI orders initialize NTT checkout.
- `POST /api/wallet/topups` — create or resume a wallet top-up checkout.
- `POST /api/payments/ntt/callback` — NTT callback endpoint.
- `GET /api/payments/ntt/callback` — browser return handoff.
- `POST /api/payments/orders/:orderId/requery` — authenticated order status refresh.
- `POST /api/wallet/topups/:topupId/requery` — authenticated wallet status refresh.

For this merchant configuration, [`Project/backend/README.md`](Project/backend/README.md#ntt-data-payments) documents the confirmed legacy OTS status endpoint. Keep `NTT_STATUS_PATH` set to the endpoint and request contract confirmed by NTT; the adapter uses that setting to select the compatibility status query implementation. Do not switch to an OTS v2 status endpoint unless NTT provides the matching account contract.

## Failure handling and operational checks

- Persist the merchant payment ID before calling NTT so a lost response can be reconciled.
- Treat a timeout or connection loss during payment/refund creation as an uncertain outcome. Query/reconcile it before creating another attempt.
- Use database uniqueness/locking and idempotency keys for payment attempts, callback application, wallet ledger entries, and fulfillment.
- Keep credentials on the backend. Never return API secrets, encryption keys, passwords, or raw callback payloads to the browser or logs.
- Apply the database migrations before starting the API/worker after a deployment.
- Complete NTT UAT for success, decline, cancellation, pending, timeout, callback replay, delayed callback, status requery, and refund reconciliation before production use.

For local work, use `NTT_MODE=mock`; mock checkout is simulated by the backend and does not open the hosted payment window. For actual UAT, configure NTT-issued credentials and reachable callback/return URLs. See [`ntt/README.md`](ntt/README.md) and [`ntt/RELEASE.md`](ntt/RELEASE.md) for package-specific behavior and release acceptance notes.
