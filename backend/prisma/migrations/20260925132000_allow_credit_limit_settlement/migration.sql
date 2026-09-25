ALTER TABLE "wallets"
  DROP CONSTRAINT IF EXISTS "wallets_total_balance_nonnegative_check",
  DROP CONSTRAINT IF EXISTS "wallets_reserved_balance_lte_total_check";
