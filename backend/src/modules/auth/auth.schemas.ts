import { z } from "zod";

const email = z.email().max(320).transform((value) => value.trim().toLowerCase());
const password = z
  .string()
  .min(8, "Password must contain at least 8 characters")
  .max(128)
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/[0-9]/, "Password must contain a number");
const optionalText = (maximum: number) => z.string().trim().max(maximum).optional();

export const registerSchema = z.object({
  email,
  password,
  invitationToken: z.string().min(32).optional(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: optionalText(30),
  workspaceName: optionalText(160),
  companyName: z.string().trim().min(1).max(160),
  companyWebsite: z.union([z.url().max(500), z.literal("")]).optional(),
  companyLocation: optionalText(200),
  annualRevenue: z
    .enum([
      "under-50-lakh",
      "50-lakh-1-crore",
      "1-5-crore",
      "5-25-crore",
      "25-crore-plus",
    ])
    .optional(),
});

export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token: z.string().min(32), newPassword: password });
export const verifyEmailSchema = z.object({ token: z.string().min(32) });
export const changeEmailSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
