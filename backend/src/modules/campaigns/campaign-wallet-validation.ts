import { Prisma } from "../../generated/prisma/client.js";

export function canCoverCampaignEstimate(input: {
  availableBalance: string | number;
  estimatedCost: string | number;
  allowNegativeBalance?: boolean;
  creditLimit?: string | number;
}) {
  const available = new Prisma.Decimal(input.availableBalance);
  const usable = available.add(input.allowNegativeBalance ? input.creditLimit ?? 0 : 0);
  return usable.gte(new Prisma.Decimal(input.estimatedCost));
}
