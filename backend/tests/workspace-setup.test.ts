import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

Object.assign(process.env, {
  DOTENV_CONFIG_PATH: "tests/nonexistent-unit-test.env",
  NODE_ENV: "test",
  APP_URL: "http://localhost:5173",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  ACCESS_TOKEN_SECRET: "unit-test-only-access-token-secret-000000",
  META_APP_ID: "test-app",
  META_APP_SECRET: "test-app-secret",
  META_TOKEN_ENCRYPTION_KEY: "test-token-encryption-key-for-tests-32chars",
  LOG_LEVEL: "silent",
});

const { getWorkspaceSetup } = await import("../src/modules/workspaces/workspace.service.js");
const { prisma } = await import("../src/database/prisma.js");

test("an existing workspace is the first completed setup milestone before profile onboarding", async (t: TestContext) => {
  const originalFindUnique = prisma.workspace.findUnique;
  prisma.workspace.findUnique = (async () => ({
    id: "workspace-1",
    name: "Acme Support",
    onboardingCompletedAt: null,
    setupProgress: null,
    memberships: [{ id: "membership-1" }],
    invitations: [],
    whatsappBusinessAccounts: [],
  })) as typeof prisma.workspace.findUnique;
  t.after(() => { prisma.workspace.findUnique = originalFindUnique; });

  const result = await getWorkspaceSetup("workspace-1");

  assert.deepEqual(result.progress, {
    workspaceCreated: true,
    whatsappConnected: false,
    phoneNumberConnected: false,
    testMessageSent: false,
    completedSteps: 1,
    totalSteps: 4,
    percentage: 25,
    completedAt: null,
  });
});
