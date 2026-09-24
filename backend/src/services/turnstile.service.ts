import { env } from "../config/env.js";
import { AppError } from "../middleware/error-handler.js";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileResponse = {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
};

export async function verifyTurnstileToken(token: string, remoteIp?: string): Promise<void> {
  const secret = env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
  if (!secret) throw new AppError(503, "Cloudflare verification is not configured.", "CAPTCHA_NOT_CONFIGURED");

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret, response: token, ...(remoteIp ? { remoteip: remoteIp } : {}) }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Turnstile returned HTTP ${response.status}`);
    const result = await response.json() as TurnstileResponse;
    if (!result.success) throw new AppError(422, "Complete the Cloudflare verification before creating your account.", "CAPTCHA_INVALID", result["error-codes"]);
    const expectedHostname = new URL(env.APP_URL).hostname;
    if (result.hostname !== expectedHostname || result.action !== "signup") {
      throw new AppError(422, "Cloudflare verification was issued for an unexpected website or form.", "CAPTCHA_INVALID");
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(503, "Cloudflare verification is temporarily unavailable. Please try again.", "CAPTCHA_UNAVAILABLE");
  }
}
