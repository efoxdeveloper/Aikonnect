import type { Request, Response } from "express";
import * as service from "./wallet.service.js";
import type { WalletLedgerQuery } from "./wallet.schemas.js";

export async function get(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.getWallet(request.params.workspaceId as string) });
}

export async function ledger(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.listLedger(request.params.workspaceId as string, request.validatedQuery as WalletLedgerQuery) });
}
