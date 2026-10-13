import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { env } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";
import { processNttCallback } from "../wallet/wallet-topups.service.js";

export const nttPaymentsRouter = Router();

nttPaymentsRouter.post("/callback", asyncHandler(async (request, response) => {
  const topup = await processNttCallback(request.body);
  if (request.accepts("html")) {
    const target = new URL(env.NTT_FRONTEND_RETURN_URL ?? "/billing", env.APP_URL);
    target.searchParams.set("walletTopup", topup.id);
    target.searchParams.set("paymentReturn", "pending");
    response.redirect(303, target.toString());
    return;
  }
  response.status(200).type("text/plain").send("OK");
}));

nttPaymentsRouter.get("/callback", asyncHandler(async (request, response) => {
  const paymentId = typeof request.query.paymentId === "string" ? request.query.paymentId : typeof request.query.merchTxnId === "string" ? request.query.merchTxnId : "";
  const topup = paymentId ? await prisma.walletTopup.findUnique({ where: { paymentId }, select: { id: true } }) : null;
  const target = new URL(env.NTT_FRONTEND_RETURN_URL ?? "/billing", env.APP_URL);
  if (topup) target.searchParams.set("walletTopup", topup.id);
  target.searchParams.set("paymentReturn", topup ? "pending" : "unknown");
  response.redirect(303, target.toString());
}));
