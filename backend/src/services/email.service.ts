import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

const smtpConfigured = Boolean(
  env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.SMTP_FROM_EMAIL,
);

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    })
  : null;

async function sendEmail(options: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<boolean> {
  if (process.env.NODE_TEST_CONTEXT) return false;
  if (!transporter || !env.SMTP_FROM_EMAIL) {
    logger.warn("SMTP is not configured; transactional email was not delivered");
    return false;
  }

  await transporter.sendMail({
    from: { name: env.SMTP_FROM_NAME, address: env.SMTP_FROM_EMAIL },
    ...options,
  });
  return true;
}

export async function verifyEmailTransport(): Promise<boolean> {
  if (!transporter) return false;
  return transporter.verify();
}

function actionEmailHtml(options: {
  heading: string;
  message: string;
  buttonLabel: string;
  actionUrl: string;
  expiry: string;
}): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f3f8f8;font-family:Arial,sans-serif;color:#27343a">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border:1px solid #dfe8e9;border-radius:8px;padding:32px">
          <tr><td><h1 style="margin:0 0 16px;color:#145f64;font-size:24px">${options.heading}</h1></td></tr>
          <tr><td><p style="margin:0 0 24px;line-height:1.6">${options.message}</p></td></tr>
          <tr><td><a href="${options.actionUrl}" style="display:inline-block;background:#116b6f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">${options.buttonLabel}</a></td></tr>
          <tr><td><p style="margin:24px 0 0;color:#718086;font-size:13px;line-height:1.5">This link expires in ${options.expiry}. If you did not request this, you can safely ignore this email.</p></td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function sendVerificationEmail(to: string, verificationUrl: string): Promise<boolean> {
  return sendEmail({
    to,
    subject: "Verify your Interakt email",
    text: `Verify your email by opening this link: ${verificationUrl}`,
    html: actionEmailHtml({
      heading: "Verify your email",
      message: "Confirm that this email address belongs to you before accessing your workspace.",
      buttonLabel: "Verify email",
      actionUrl: verificationUrl,
      expiry: `${env.EMAIL_VERIFICATION_TTL_HOURS} hours`,
    }),
  });
}

export function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  return sendEmail({
    to,
    subject: "Reset your Interakt password",
    text: `Reset your password by opening this link: ${resetUrl}`,
    html: actionEmailHtml({
      heading: "Reset your password",
      message: "Use the secure link below to choose a new password for your account.",
      buttonLabel: "Reset password",
      actionUrl: resetUrl,
      expiry: `${env.PASSWORD_RESET_TTL_MINUTES} minutes`,
    }),
  });
}

export function sendWorkspaceInvitationEmail(
  to: string,
  workspaceName: string,
  roleName: string,
  invitationUrl: string,
): Promise<boolean> {
  return sendEmail({
    to,
    subject: `You have been invited to ${workspaceName}`,
    text: `You have been invited to join ${workspaceName} as ${roleName}. Accept the invitation here: ${invitationUrl}`,
    html: actionEmailHtml({
      heading: `Join ${workspaceName}`,
      message: `You have been invited to join this workspace as ${roleName}. Accept the invitation to start collaborating with the team.`,
      buttonLabel: "Accept invitation",
      actionUrl: invitationUrl,
      expiry: "7 days",
    }),
  });
}
