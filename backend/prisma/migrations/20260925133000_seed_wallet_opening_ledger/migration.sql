INSERT INTO "wallet_ledger_entries" (
  "id",
  "wallet_id",
  "tenant_id",
  "workspace_id",
  "direction",
  "amount_minor_units",
  "balance_after_minor_units",
  "transaction_reference",
  "transaction_type",
  "amount",
  "currency",
  "opening_total_balance",
  "closing_total_balance",
  "opening_reserved_balance",
  "closing_reserved_balance",
  "opening_available_balance",
  "closing_available_balance",
  "status",
  "idempotency_key",
  "reason",
  "description",
  "metadata",
  "created_at"
)
SELECT
  gen_random_uuid(),
  wallet."id",
  wallet."tenant_id",
  NULL,
  'CREDIT',
  wallet."balance_minor_units",
  wallet."balance_minor_units",
  'txn_opening_' || wallet."id",
  'OPENING_BALANCE',
  wallet."total_balance",
  wallet."currency",
  0,
  wallet."total_balance",
  0,
  wallet."reserved_balance",
  0,
  wallet."total_balance" - wallet."reserved_balance",
  'COMPLETED',
  'opening_balance:' || wallet."id",
  'OPENING_BALANCE',
  'Opening balance carried into the immutable wallet ledger',
  '{}'::jsonb,
  CURRENT_TIMESTAMP
FROM "wallets" AS wallet
WHERE wallet."total_balance" <> 0
  AND NOT EXISTS (
    SELECT 1
    FROM "wallet_ledger_entries" AS entry
    WHERE entry."wallet_id" = wallet."id"
  );
