import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { prisma } from "../../database/prisma.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../middleware/error-handler.js";
import { createWorkspaceWithDefaults } from "../workspaces/permissions.js";
import { generateSecureToken, hashPassword, hashToken, verifyPassword } from "../../utils/crypto.js";
import { signAccessToken } from "../../utils/tokens.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "../../services/email.service.js";
import type { ChangeEmailInput, ChangePasswordInput, LoginInput, RegisterInput, ResetPasswordInput } from "./auth.schemas.js";
import type { GoogleIdentity } from "./google-oauth.service.js";

type SessionMetadata = { ipAddress?: string; userAgent?: string };

const publicUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

function addMilliseconds(amount: number): Date {
  return new Date(Date.now() + amount);
}

async function acceptPendingInvitations(transaction: Prisma.TransactionClient, userId: string, userEmail: string): Promise<void> {
  const invitations = await transaction.workspaceInvitation.findMany({
    where: { email: userEmail, status: "PENDING", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "asc" },
  });
  for (const invitation of invitations) {
    const existing = await transaction.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId } },
      select: { id: true },
    });
    if (!existing) {
      await transaction.workspaceMember.create({
        data: { workspaceId: invitation.workspaceId, userId, roleId: invitation.roleId },
      });
    }
    await transaction.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
  }
}

async function createSession(userId: string, metadata: SessionMetadata) {
  const refreshToken = generateSecureToken();
  const expiresAt = addMilliseconds(env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const session = await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: hashToken(refreshToken),
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
      expiresAt,
    },
  });
  const accessToken = await signAccessToken({ userId, sessionId: session.id });
  return { accessToken, refreshToken, refreshExpiresAt: expiresAt };
}

export async function register(input: RegisterInput, metadata: SessionMetadata) {
  const existingUser = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existingUser) throw new AppError(409, "An account with this email already exists", "EMAIL_IN_USE");

  const passwordHash = await hashPassword(input.password);
  const verificationToken = generateSecureToken();
  const result = await prisma.$transaction(async (transaction) => {
    const invitation = input.invitationToken
      ? await transaction.workspaceInvitation.findUnique({ where: { tokenHash: hashToken(input.invitationToken) } })
      : await transaction.workspaceInvitation.findFirst({
          where: { email: input.email, status: "PENDING", expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "asc" },
        });
    if (input.invitationToken && (!invitation || invitation.status !== "PENDING" || invitation.expiresAt <= new Date())) {
      throw new AppError(400, "This invitation is invalid or has expired", "INVITATION_INVALID");
    }
    if (invitation && invitation.email !== input.email) {
      throw new AppError(403, "This invitation belongs to another email address", "INVITATION_EMAIL_MISMATCH");
    }
    const user = await transaction.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone || null,
      },
      select: publicUserSelect,
    });
    const workspace = invitation
      ? null
      : (await createWorkspaceWithDefaults(transaction, user.id, {
          name: input.workspaceName || input.companyName,
          companyName: input.companyName,
          companyWebsite: input.companyWebsite || undefined,
          companyLocation: input.companyLocation || undefined,
          annualRevenue: input.annualRevenue,
        })).workspace;
    await transaction.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(verificationToken),
        expiresAt: addMilliseconds(env.EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000),
      },
    });
    return { user, workspace };
  });
  const session = await createSession(result.user.id, metadata);
  const verificationUrl = new URL("/verify-email", env.APP_URL);
  verificationUrl.searchParams.set("token", verificationToken);
  if (input.invitationToken) verificationUrl.searchParams.set("invitation", input.invitationToken);
  let verificationEmailSent = false;
  try {
    verificationEmailSent = await sendVerificationEmail(result.user.email, verificationUrl.toString());
  } catch (error) {
    logger.error({ err: error }, "Verification email delivery failed");
  }

  return {
    ...result,
    ...session,
    emailVerificationRequired: true,
    verificationEmailSent,
    ...(env.NODE_ENV === "development"
      ? { verificationUrl: verificationUrl.toString() }
      : {}),
  };
}

export async function login(input: LoginInput, metadata: SessionMetadata) {
  const userWithPassword = await prisma.user.findUnique({ where: { email: input.email } });
  if (!userWithPassword) {
    await hashPassword(input.password);
    throw new AppError(401, "Email or password is incorrect", "INVALID_CREDENTIALS");
  }

  const passwordMatches = await verifyPassword(input.password, userWithPassword.passwordHash);
  if (!passwordMatches) throw new AppError(401, "Email or password is incorrect", "INVALID_CREDENTIALS");
  if (userWithPassword.status !== "ACTIVE") {
    throw new AppError(403, "This account is not active", "ACCOUNT_INACTIVE");
  }

  const user = await prisma.user.update({
    where: { id: userWithPassword.id },
    data: { lastLoginAt: new Date() },
    select: publicUserSelect,
  });
  if (user.emailVerifiedAt) {
    await prisma.$transaction((transaction) => acceptPendingInvitations(transaction, user.id, user.email));
  }
  const session = await createSession(user.id, metadata);
  return { user, ...session };
}

export async function loginWithGoogle(identity: GoogleIdentity, metadata: SessionMetadata) {
  const linkedAccount = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: "google", providerAccountId: identity.providerAccountId } },
    include: { user: true },
  });

  if (linkedAccount) {
    if (linkedAccount.user.status !== "ACTIVE") {
      throw new AppError(403, "This account is not active", "ACCOUNT_INACTIVE");
    }
    const user = await prisma.user.update({
      where: { id: linkedAccount.userId },
      data: { lastLoginAt: new Date() },
      select: publicUserSelect,
    });
    await prisma.$transaction((transaction) => acceptPendingInvitations(transaction, user.id, user.email));
    const session = await createSession(user.id, metadata);
    return { user, ...session };
  }

  const existingEmail = await prisma.user.findUnique({ where: { email: identity.email }, select: { id: true } });
  if (existingEmail) {
    throw new AppError(409, "An account with this email already exists. Sign in with your password instead.", "GOOGLE_ACCOUNT_LINK_REQUIRED");
  }

  // Google-only accounts cannot authenticate with a password until they set one through password recovery.
  const unusablePasswordHash = await hashPassword(generateSecureToken(48));
  const result = await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.create({
      data: {
        email: identity.email,
        passwordHash: unusablePasswordHash,
        firstName: identity.firstName,
        lastName: identity.lastName,
        emailVerifiedAt: new Date(),
      },
      select: publicUserSelect,
    });
    const invitation = await transaction.workspaceInvitation.findFirst({
      where: { email: identity.email, status: "PENDING", expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    const workspace = invitation
      ? null
      : (await createWorkspaceWithDefaults(transaction, user.id, {
          name: `${identity.firstName}'s Workspace`,
          companyName: `${identity.firstName}'s Workspace`,
        })).workspace;
    await transaction.oAuthAccount.create({
      data: { userId: user.id, provider: "google", providerAccountId: identity.providerAccountId },
    });
    await acceptPendingInvitations(transaction, user.id, user.email);
    return { user, workspace };
  });
  const session = await createSession(result.user.id, metadata);
  return { ...result, ...session };
}

export async function refreshSession(refreshToken: string | undefined) {
  if (!refreshToken) throw new AppError(401, "Refresh token is required", "REFRESH_TOKEN_REQUIRED");
  const refreshTokenHash = hashToken(refreshToken);
  const session = await prisma.session.findUnique({
    where: { refreshTokenHash },
    include: { user: { select: { id: true, email: true, status: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") {
    throw new AppError(401, "Refresh token is invalid or expired", "REFRESH_TOKEN_INVALID");
  }

  const nextRefreshToken = generateSecureToken();
  const rotated = await prisma.session.updateMany({
    where: { id: session.id, refreshTokenHash, revokedAt: null },
    data: { refreshTokenHash: hashToken(nextRefreshToken), lastUsedAt: new Date() },
  });
  if (rotated.count !== 1) {
    await prisma.session.updateMany({ where: { id: session.id }, data: { revokedAt: new Date() } });
    throw new AppError(401, "Refresh token has already been used", "REFRESH_TOKEN_REUSED");
  }

  const accessToken = await signAccessToken({ userId: session.userId, sessionId: session.id });
  return { accessToken, refreshToken: nextRefreshToken, refreshExpiresAt: session.expiresAt };
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  await prisma.session.updateMany({
    where: { refreshTokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function logoutAll(userId: string): Promise<void> {
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...publicUserSelect,
      memberships: {
        where: { status: "ACTIVE" },
        select: {
          id: true,
          workspace: {
            select: {
              id: true,
              name: true,
              slug: true,
              country: true,
              timezone: true,
              onboardingCompletedAt: true,
              logoData: true,
            },
          },
          role: {
            select: {
              id: true,
              name: true,
              slug: true,
              permissions: { select: { permission: { select: { key: true } } } },
            },
          },
        },
      },
    },
  });
  if (!user) throw new AppError(404, "User was not found", "USER_NOT_FOUND");

  return {
    ...user,
    memberships: user.memberships.map((membership) => ({
      ...membership,
      role: {
        ...membership.role,
        permissions: membership.role.permissions.map(({ permission }) => permission.key),
      },
    })),
  };
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, status: true } });
  if (!user || user.status !== "ACTIVE") return {};
  const token = generateSecureToken();

  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: addMilliseconds(env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
      },
    }),
  ]);

  const resetUrl = `${env.APP_URL}/reset-password?token=${token}`;
  let emailSent = false;
  try {
    emailSent = await sendPasswordResetEmail(email, resetUrl);
  } catch (error) {
    logger.error({ err: error }, "Password reset email delivery failed");
  }

  return {
    emailSent,
    ...(env.NODE_ENV === "development" ? { resetUrl } : {}),
  };
}

export async function resendVerification(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, emailVerifiedAt: true },
  });
  if (!user) throw new AppError(404, "User was not found", "USER_NOT_FOUND");
  if (user.emailVerifiedAt) return { alreadyVerified: true, emailSent: false };

  const recentToken = await prisma.emailVerificationToken.findFirst({
    where: {
      userId,
      consumedAt: null,
      createdAt: { gt: new Date(Date.now() - 60 * 1000) },
    },
    select: { id: true },
  });
  if (recentToken) {
    throw new AppError(429, "Please wait before requesting another verification email", "VERIFICATION_RATE_LIMITED");
  }

  const token = generateSecureToken();
  await prisma.$transaction([
    prisma.emailVerificationToken.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: addMilliseconds(env.EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000),
      },
    }),
  ]);

  const verificationUrl = `${env.APP_URL}/verify-email?token=${token}`;
  let emailSent = false;
  try {
    emailSent = await sendVerificationEmail(user.email, verificationUrl);
  } catch (error) {
    logger.error({ err: error }, "Verification email delivery failed");
  }

  return {
    alreadyVerified: false,
    emailSent,
    ...(env.NODE_ENV === "development" ? { verificationUrl } : {}),
  };
}

export async function changeUnverifiedEmail(userId: string, input: ChangeEmailInput) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, passwordHash: true, emailVerifiedAt: true },
  });
  if (!user) throw new AppError(404, "User was not found", "USER_NOT_FOUND");
  if (user.emailVerifiedAt) {
    throw new AppError(400, "This email is already verified", "EMAIL_ALREADY_VERIFIED");
  }
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    throw new AppError(400, "Password is incorrect", "PASSWORD_INCORRECT");
  }
  if (input.email === user.email) {
    throw new AppError(400, "Enter a different email address", "EMAIL_UNCHANGED");
  }
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new AppError(409, "An account with this email already exists", "EMAIL_IN_USE");

  const token = generateSecureToken();
  await prisma.$transaction(async (transaction) => {
    await transaction.emailVerificationToken.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await transaction.user.update({ where: { id: userId }, data: { email: input.email } });
    await transaction.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: addMilliseconds(env.EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000),
      },
    });
  });

  const verificationUrl = `${env.APP_URL}/verify-email?token=${token}`;
  let emailSent = false;
  try {
    emailSent = await sendVerificationEmail(input.email, verificationUrl);
  } catch (error) {
    logger.error({ err: error }, "Verification email delivery failed after email change");
  }

  return {
    email: input.email,
    emailSent,
    ...(env.NODE_ENV === "development" ? { verificationUrl } : {}),
  };
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const tokenHash = hashToken(input.token);
  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction(async (transaction) => {
    const token = await transaction.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!token || token.consumedAt || token.expiresAt <= new Date()) {
      throw new AppError(400, "Password reset token is invalid or expired", "RESET_TOKEN_INVALID");
    }
    const consumed = await transaction.passwordResetToken.updateMany({
      where: { id: token.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw new AppError(400, "Password reset token was already used", "RESET_TOKEN_USED");
    await transaction.user.update({ where: { id: token.userId }, data: { passwordHash } });
    await transaction.session.updateMany({
      where: { userId: token.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
}

export async function verifyEmail(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await prisma.$transaction(async (transaction) => {
    const verification = await transaction.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!verification || verification.consumedAt || verification.expiresAt <= new Date()) {
      throw new AppError(400, "Verification token is invalid or expired", "VERIFICATION_TOKEN_INVALID");
    }
    const consumed = await transaction.emailVerificationToken.updateMany({
      where: { id: verification.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw new AppError(400, "Verification token was already used", "VERIFICATION_TOKEN_USED");
    const user = await transaction.user.update({
      where: { id: verification.userId },
      data: { emailVerifiedAt: new Date() },
      select: { id: true, email: true },
    });
    await acceptPendingInvitations(transaction, user.id, user.email);
  });
}

export async function changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AppError(400, "Current password is incorrect", "CURRENT_PASSWORD_INCORRECT");
  }
  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}
