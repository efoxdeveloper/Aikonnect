import { logger } from "../../config/logger.js";
import { expireDueMessageReservations } from "./wallet.service.js";

const POLL_INTERVAL_MS = 60_000;
const BATCH_SIZE = 100;

let workerTimer: NodeJS.Timeout | undefined;
let workerRunning = false;

export async function processDueWalletReservations() {
  const result = await expireDueMessageReservations(BATCH_SIZE);
  if (result.failed) logger.error(result, "Wallet reservation reconciliation encountered failures");
  return result;
}

export function startWalletReservationWorker() {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    if (workerRunning) return;
    workerRunning = true;
    void processDueWalletReservations()
      .catch((error) => logger.error({ error }, "Wallet reservation scheduler tick failed"))
      .finally(() => { workerRunning = false; });
  }, POLL_INTERVAL_MS);
  workerTimer.unref();
  void processDueWalletReservations().catch((error) => logger.error({ error }, "Wallet reservation scheduler startup failed"));
}
