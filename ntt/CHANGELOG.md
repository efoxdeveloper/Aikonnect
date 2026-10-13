# 2.0.0

Breaking changes from the local 1.0.0 prototype:

- Production rejects implicit/mock mode. Mode and environment must agree.
- otsv2 paths require an API secret per the supplied August 2026 NTT documents.
- Callback providerTransactionId now means Atom transaction ID consistently. The bank reference moved to bankTransactionId. Migrate stored v1 bank references; do not reuse them for refunds.
- Callback results include signed total amount, currency and merchant. Mock callbacks must include amount. Real callbacks must include txnCurrency.
- OTS requery requires the original transactionDate (or createdAt with timezone) and Atom ID.
- Unknown payment codes, query errors and malformed responses throw NttRequestError instead of returning invented PENDING/FAILED states. Do not mark an order failed merely because a query failed.
- Live default API host corrected to payment.atomtech.in; OTS status uses payment1.atomtech.in.
- Refund results must match the requested product/refund identifiers. Ambiguous matches require providerRefundId.
- Amount precision, identifiers, dates, URLs and response sizes are validated.

Added: CommonJS support, browser checkout helper, runnable local example, asynchronous PBKDF2, request IDs on results/errors, log/JSON redaction, bounded transport, prepack build, package regression and isolated installation tests.

No automatic retries or database idempotency are claimed. See README.md for the host application's persistence and replay requirements.
