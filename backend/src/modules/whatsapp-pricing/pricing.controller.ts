import type { Request, Response } from "express";
import { requireAuth } from "../../middleware/authenticate.js";
import * as service from "./pricing.service.js";
import type { RateCardInput, RateCardListQuery, RatePreviewInput } from "./pricing.schemas.js";

export async function list(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.listRateCards(request.validatedQuery as RateCardListQuery) });
}

export async function get(request: Request, response: Response) {
  response.status(200).json({ success: true, data: await service.getRateCard(request.params.id as string) });
}

export async function create(request: Request, response: Response) {
  const auth = requireAuth(request);
  response.status(201).json({ success: true, data: await service.createRateCard(request.body as RateCardInput, auth.userId) });
}

export async function update(request: Request, response: Response) {
  const auth = requireAuth(request);
  response.status(200).json({ success: true, data: await service.updateRateCard(request.params.id as string, request.body as RateCardInput, auth.userId) });
}

export async function updateStatus(request: Request, response: Response) {
  const auth = requireAuth(request);
  response.status(200).json({ success: true, data: await service.updateRateCardStatus(request.params.id as string, request.body.status, auth.userId) });
}

export async function preview(request: Request, response: Response) {
  const input = request.body as RatePreviewInput;
  const pricing = await service.resolveMessagePricing({ phoneNumber: input.phoneNumber, category: input.category, pricingType: input.pricingType, timestamp: input.timestamp ? new Date(input.timestamp) : undefined, currentVolume: input.currentVolume === undefined ? undefined : BigInt(input.currentVolume) });
  response.status(200).json({ success: true, data: pricing, pricing });
}
