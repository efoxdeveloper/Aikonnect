import type { Request, Response } from "express";
import * as plansService from "./plans.service.js";

export async function list(_request: Request, response: Response) {
  response.status(200).json({ success: true, data: await plansService.listPublicPlans() });
}
