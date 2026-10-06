import { prisma } from "../../database/prisma.js";

export async function listPublicPlans() {
  const plans = await prisma.subscriptionPlan.findMany({
    where: {
      active: true,
      OR: [{ monthlyPriceMinorUnits: { gt: 0n } }, { annualPriceMinorUnits: { gt: 0n } }],
    },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      currency: true,
      monthlyPriceMinorUnits: true,
      annualPriceMinorUnits: true,
      trialDays: true,
      maxSeats: true,
      maxContacts: true,
      maxCampaignsPerMonth: true,
      maxAutomations: true,
      maxWorkflows: true,
      maxPipelines: true,
      apiAccess: true,
      webhooks: true,
      advancedReports: true,
    },
  });
  return {
    items: plans.map((plan) => ({
      ...plan,
      monthlyPriceMinorUnits: plan.monthlyPriceMinorUnits.toString(),
      annualPriceMinorUnits: plan.annualPriceMinorUnits.toString(),
    })),
  };
}
