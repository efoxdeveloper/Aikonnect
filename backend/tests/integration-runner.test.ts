import { networkInterfaces } from "node:os";
import { test } from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!testDatabaseUrl) {
  test("database integration tests", { skip: "Set TEST_DATABASE_URL to a dedicated local test database to run integration tests." }, () => {});
} else {
  const databaseUrl = new URL(testDatabaseUrl);
  const localAddresses = new Set(["localhost", "127.0.0.1", "::1"]);
  const localInterfaceAddresses = Object.values(networkInterfaces()).flatMap((interfaces) => interfaces?.map(({ address }) => address.replace(/^::ffff:/, "")) ?? []);
  const isLocalDatabase = localAddresses.has(databaseUrl.hostname) || localInterfaceAddresses.includes(databaseUrl.hostname);
  if (!isLocalDatabase || /prod/i.test(`${databaseUrl.hostname}/${databaseUrl.pathname}`)) {
    throw new Error("Database integration tests require a dedicated local non-production TEST_DATABASE_URL.");
  }

  process.env.DATABASE_URL = testDatabaseUrl;

  const integrationTests = [
    "./api-keys.integration.test.ts",
    "./auth-workspace.integration.test.ts",
    "./campaigns.integration.test.ts",
    "./contacts.integration.test.ts",
    "./conversations.integration.test.ts",
    "./reports.integration.test.ts",
    "./templates.integration.test.ts",
    "./whatsapp-account.integration.test.ts",
    "./whatsapp-webhook.integration.test.ts",
  ] as const;

  for (const testFile of integrationTests) await import(testFile);
}
