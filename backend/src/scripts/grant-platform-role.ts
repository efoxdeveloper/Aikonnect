import { prisma } from "../database/prisma.js";

const supportedRoles = new Set(["SUPPORT", "OPERATIONS", "BILLING", "ADMIN", "SUPER_ADMIN"]);

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const email = argument("email")?.trim().toLowerCase();
const role = argument("role")?.trim().toUpperCase() ?? "ADMIN";
const confirmed = process.argv.includes("--confirm");

try {
  if (!email || !supportedRoles.has(role) || !confirmed) {
    throw new Error("Usage: npm run platform:grant-role -- --email=user@example.com --role=ADMIN --confirm");
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, platformRole: true } });
  if (!user) throw new Error(`No user exists for ${email}. Create and verify the user first.`);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { platformRole: role as "SUPPORT" | "OPERATIONS" | "BILLING" | "ADMIN" | "SUPER_ADMIN" },
    select: { email: true, platformRole: true },
  });
  console.log(`Granted ${updated.platformRole} platform access to ${updated.email}. Previous role: ${user.platformRole}.`);
} finally {
  await prisma.$disconnect();
}
