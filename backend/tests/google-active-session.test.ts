import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

Object.assign(process.env, {
  DOTENV_CONFIG_PATH: "tests/nonexistent-unit-test.env",
  NODE_ENV: "test",
  APP_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  ACCESS_TOKEN_SECRET: "unit-test-only-access-token-secret-000000",
  LOG_LEVEL: "silent",
});

const { prisma } = await import("../src/database/prisma.js");
const { hasActiveRefreshSession } = await import("../src/modules/auth/auth.service.js");
const { hashToken } = await import("../src/utils/crypto.js");

function stubFindFirst(t: TestContext, implementation: (...args: any[]) => any) {
  const original = prisma.session.findFirst;
  prisma.session.findFirst = implementation as typeof original;
  t.after(() => { prisma.session.findFirst = original; });
}

test("Google OAuth recognizes a valid existing refresh session", async (t) => {
  const refreshToken = "active-refresh-token";
  let query: any;
  stubFindFirst(t, async (args) => {
    query = args;
    return { id: "session-1" };
  });

  assert.equal(await hasActiveRefreshSession(refreshToken), true);
  assert.equal(query.where.refreshTokenHash, hashToken(refreshToken));
  assert.equal(query.where.revokedAt, null);
  assert.ok(query.where.expiresAt.gt instanceof Date);
  assert.deepEqual(query.where.user, { status: "ACTIVE" });
});

test("Google OAuth does not block missing or invalid refresh sessions", async (t) => {
  let queryCount = 0;
  stubFindFirst(t, async () => {
    queryCount += 1;
    return null;
  });

  assert.equal(await hasActiveRefreshSession(undefined), false);
  assert.equal(queryCount, 0);
  assert.equal(await hasActiveRefreshSession("expired-refresh-token"), false);
  assert.equal(queryCount, 1);
});
