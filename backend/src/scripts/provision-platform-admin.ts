import { prisma } from "../database/prisma.js";
import { hashPassword } from "../utils/crypto.js";

const supportedRoles = new Set(["SUPPORT", "OPERATIONS", "BILLING", "ADMIN", "SUPER_ADMIN"]);

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function readHiddenPassword(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error("An interactive terminal is required so the password is not exposed in process arguments or logs.");
  }

  process.stdout.write("Admin password: ");
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise((resolve, reject) => {
    let password = "";
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Password entry cancelled"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(password);
          return;
        }
        if (character === "\u007f") {
          password = password.slice(0, -1);
          continue;
        }
        password += character;
      }
    };
    const cleanup = () => {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
    };
    process.stdin.on("data", onData);
  });
}

const email = argument("email")?.trim().toLowerCase();
const role = argument("role")?.trim().toUpperCase() ?? "SUPER_ADMIN";
const confirmed = process.argv.includes("--confirm");

try {
  if (!email || !supportedRoles.has(role) || !confirmed) {
    throw new Error("Usage: npm run platform:provision-admin -- --email=user@example.com --role=SUPER_ADMIN --confirm");
  }

  const password = await readHiddenPassword();
  if (password.length < 8 || password.length > 128) throw new Error("Password must be between 8 and 128 characters.");
  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, emailVerifiedAt: true, platformRole: true } });

  if (existing) {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          status: "ACTIVE",
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
          platformRole: role as "SUPPORT" | "OPERATIONS" | "BILLING" | "ADMIN" | "SUPER_ADMIN",
        },
      }),
      prisma.session.updateMany({ where: { userId: existing.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    console.log(`Updated ${role} platform access for ${email}. Existing sessions were revoked.`);
  } else {
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: "Harsh",
        lastName: "Goyal",
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        platformRole: role as "SUPPORT" | "OPERATIONS" | "BILLING" | "ADMIN" | "SUPER_ADMIN",
      },
    });
    console.log(`Created ${role} platform admin account for ${email}.`);
  }
} finally {
  await prisma.$disconnect();
}
