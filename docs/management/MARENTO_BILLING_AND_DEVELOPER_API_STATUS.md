# Marento WhatsApp Billing & Developer API

## Management Project Status

**Status date:** 25 September 2026  
**Overall status:** Core platform foundation implemented; production pilot and commercial billing remain.

## Executive summary

Marento now has the core infrastructure required to price WhatsApp messages internally, reserve customer wallet funds before sending, and settle the final charge based on Meta delivery results.

The Developer API is now connected to this billing flow. A customer application can send an approved WhatsApp template through `/api/v1/messages`, and Marento will calculate the rate, reserve the wallet amount, send the message to Meta, and later capture or release the reservation.

The project is not yet a complete commercial billing platform. Payment gateway recharge, invoices, tax handling, Meta cost reconciliation, automated balance notifications, and production operational validation are still outstanding.

## Capability status

| Capability | Status | Management meaning |
|---|---|---|
| Versioned WhatsApp Rate Card | Implemented | Marento can maintain country/category/pricing-type rates without changing historical rates. |
| Rate resolution | Implemented | The system determines pricing from recipient country, template category, pricing type, date, and volume tier. |
| Decimal-safe money handling | Implemented | Financial values use six-decimal precision and are not calculated with JavaScript floating point values. |
| Wallet balances | Implemented | Total, reserved, and available balances are maintained. |
| Immutable wallet ledger | Implemented | Credits, debits, reservations, charges, releases, and refunds are recorded as financial events. |
| Message reservations | Implemented | Money is held before Meta send and is not permanently deducted at API request time. |
| Delivery settlement | Implemented | Delivered messages are charged; failed messages release the reservation. |
| Duplicate webhook protection | Implemented | Repeated delivered or failed webhooks do not double-charge or double-release. |
| Billing modes | Implemented | Customer Meta billing and Marento shared billing are supported. |
| Developer API authentication | Implemented | Workspace-scoped API keys and `messages.send` scope are supported. |
| Developer API billing integration | Implemented | Approved template sends reserve funds and return billing status. |
| Customer wallet visibility | Implemented | Customers can view total, reserved, available balance, and wallet activity. |
| Admin wallet operations | Implemented | Platform admins can credit, debit, recharge, refund, suspend, and activate wallets. |
| Payment gateway recharge | Not implemented | Recharge currently requires an admin/manual operation. |
| Customer invoices and tax documents | Not implemented | There is no invoice, GST, tax, or accounting document workflow yet. |
| Meta pricing reconciliation | Not implemented | Estimated Marento cost is stored, but Meta analytics reconciliation is still pending. |
| Automated low-balance notifications | Not implemented | The balance threshold and UI warning exist; email/WhatsApp alerts are not yet delivered. |
| Reservation expiry worker | Not implemented | Expiry data is stored, but stale reservation cleanup needs a scheduled job and operational alerts. |

## Current customer message flow

```text
Developer application
        ↓
POST /api/v1/messages
        ↓
API-key and scope validation
        ↓
Approved template validation
        ↓
Recipient country and Rate Card resolution
        ↓
Pricing snapshot stored on message
        ↓
Wallet amount reserved
        ↓
Message sent to Meta
        ↓
Meta webhook
        ├── delivered → reservation captured → wallet charged
        └── failed    → reservation released
```

The current Developer API supports approved WhatsApp template messages. Free-form text and media messages still require a separate pricing and product decision before they can be exposed through the same billable API.

## What is ready now

Marento is ready for a controlled internal or partner pilot covering:

- Approved WhatsApp template sends.
- Wallet-funded prepaid messaging.
- Manual admin wallet recharge or credit.
- Customer Meta billing mode where only Marento's platform fee is charged.
- Marento shared billing mode where Meta cost plus platform fee is charged.
- Delivery and failure settlement through Meta webhooks.
- API-key-based customer integration.
- Idempotent retry behavior.

This should be treated as pilot readiness, not full commercial launch readiness, until the operational and financial controls below are completed.

## Remaining work by priority

### Priority 1 — Production pilot validation

Validate the complete financial lifecycle using a real connected WhatsApp account:

1. Successful template send with sufficient balance.
2. Insufficient balance prevents the Meta request.
3. Immediate Meta rejection releases the reservation.
4. Delivered webhook captures exactly once.
5. Failed webhook releases exactly once.
6. Duplicate and out-of-order webhooks do not corrupt the wallet.
7. Workspace and tenant isolation is verified.
8. Wallet and ledger balances are reconciled after each test batch.

### Priority 2 — Commercial wallet operations

- Integrate a payment gateway such as Razorpay or the selected provider.
- Add customer recharge flow and payment confirmation webhooks.
- Add receipts and payment references.
- Define refund and chargeback handling.
- Add low-balance email/WhatsApp notifications.
- Add a scheduled reservation-expiry and financial-reconciliation worker.

### Priority 3 — Billing and finance

- Add invoices and invoice numbering.
- Add GST/tax configuration and tax calculation.
- Add customer billing statements.
- Add downloadable ledger exports.
- Add month-end settlement reports.
- Add Meta pricing analytics reconciliation.
- Store actual Meta cost, variance, reconciliation status, and reconciliation history.

### Priority 4 — Developer platform

- Publish management-approved Developer API documentation.
- Add request examples, error-code reference, and webhook documentation.
- Add message status lookup and message history APIs.
- Add developer webhook subscriptions and delivery retry visibility.
- Add usage limits and customer-level quotas.
- Add API-key rotation and environment separation for test/live keys.
- Decide and implement billable media and free-form message support.
- Add SDKs or maintained code examples if required by target customers.

### Priority 5 — Operations and scale

- Add financial dashboards for reservations, charges, releases, refunds, and billing errors.
- Add alerts for wallet inconsistencies and stuck reservations.
- Add API-specific rate limits and abuse protection.
- Add structured billing metrics and trace IDs across Meta calls and webhooks.
- Run concurrency and load tests for high-volume sends.
- Create incident, refund, reconciliation, and customer-support runbooks.

## Important business decisions still required

Management should confirm:

- Which customers use `CUSTOMER_META_BILLING` versus `MARRENTO_SHARED_BILLING`.
- The final Marento platform-fee policy by category and country.
- Whether free Meta messages may still carry a Marento platform fee.
- The selected payment gateway and settlement process.
- Whether wallet balances expire or remain valid indefinitely.
- Refund eligibility and customer support approval rules.
- Tax/GST ownership and invoice requirements.
- Whether free-form and media messages are included in the Developer API launch.
- The first pilot customers and maximum pilot wallet limits.

## Current risks

| Risk | Impact | Mitigation |
|---|---|---|
| Meta webhook delay or absence | Funds may remain reserved longer than expected. | Add reservation expiry, monitoring, and manual reconciliation. |
| Meta pricing changes | Estimates may differ from actual partner billing. | Integrate pricing analytics reconciliation before broad commercial launch. |
| Manual recharge process | Operational overhead and possible human error. | Integrate payment gateway and require immutable references. |
| Incorrect customer billing mode | Customer may be overcharged or undercharged. | Require explicit billing configuration review before activation. |
| High-volume concurrency | Wallet overspending or database contention is possible if not load-tested. | Run concurrency tests and monitor lock contention. |
| Incomplete developer API coverage | Customers may need unsupported media or free-form use cases. | Decide supported message types before public launch. |

## Recommended next milestone

The next milestone should be **Production Billing Pilot**.

Exit criteria:

- At least one real workspace successfully sends template messages through the Developer API.
- Delivery and failure settlement are verified against real Meta webhooks.
- Duplicate webhook tests pass in production-like conditions.
- Wallet and ledger reconciliation shows no variance.
- Manual credit/recharge and refund procedures are documented.
- A named owner is assigned for billing incidents and reconciliation.

After this milestone, the next major investment should be payment gateway recharge and invoicing, followed by Meta reconciliation and full Developer API documentation.
