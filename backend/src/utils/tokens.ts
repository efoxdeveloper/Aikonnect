import { SignJWT, jwtVerify } from "jose";
import { env } from "../config/env.js";

const secret = new TextEncoder().encode(env.ACCESS_TOKEN_SECRET);
const issuer = "interakt-api";
const audience = "interakt-web";

export type AccessTokenPayload = {
  userId: string;
  sessionId: string;
};

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ sid: payload.sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.userId)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_MINUTES}m`)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, secret, { issuer, audience });
  if (!payload.sub || typeof payload.sid !== "string") throw new Error("Invalid access token claims");
  return { userId: payload.sub, sessionId: payload.sid };
}
