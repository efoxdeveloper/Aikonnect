import { logger } from "../../config/logger.js";
import { processDueSequenceEnrollments } from "./sequence.service.js";

let workerTimer: NodeJS.Timeout | undefined;
let workerRunning = false;

export function startSequenceWorker() {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    if (workerRunning) return;
    workerRunning = true;
    void processDueSequenceEnrollments().catch((error) => logger.error({ error }, "WhatsApp sequence scheduler tick failed")).finally(() => { workerRunning = false; });
  }, 15_000);
  workerTimer.unref();
  void processDueSequenceEnrollments().catch((error) => logger.error({ error }, "WhatsApp sequence scheduler startup failed"));
}
