import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { app } from "../src/app.js";
import { prisma } from "../src/database/prisma.js";

let server: Server;
let baseUrl: string;
const createdEmails: string[] = [];

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test API did not bind to TCP");
      baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
      resolve();
    });
  });
});

after(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: createdEmails } }, select: { id: true } });
  const userIds = users.map(({ id }) => id);
  if (userIds.length) {
    await prisma.workspace.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await prisma.$disconnect();
});

async function registerVerified() {
  const email = `reports-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  createdEmails.push(email);
  const registrationResponse = await fetch(`${baseUrl}/auth/register`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "ReportsIntegration123", firstName: "Reports", lastName: "Tester", companyName: "Reports Workspace" }),
  });
  assert.equal(registrationResponse.status, 201);
  const registration = (await registrationResponse.json()) as { data: { accessToken: string; workspace: { id: string }; verificationUrl: string } };
  const token = new URL(registration.data.verificationUrl).searchParams.get("token");
  assert.ok(token);
  const verification = await fetch(`${baseUrl}/auth/verify-email`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
  assert.equal(verification.status, 200);
  return registration.data;
}

test("reports protect access, validate date ranges, filter persisted contacts and export CSV", async () => {
  const anonymous = await fetch(`${baseUrl}/workspaces/00000000-0000-0000-0000-000000000000/reports/overview`);
  assert.equal(anonymous.status, 401);
  const owner = await registerVerified();
  const headers = { authorization: `Bearer ${owner.accessToken}`, "content-type": "application/json" };
  const workspaceUrl = `${baseUrl}/workspaces/${owner.workspace.id}`;
  const contact = await fetch(`${workspaceUrl}/contacts`, { method: "POST", headers, body: JSON.stringify({ name: "Report Customer", phone: "+919876543211", source: "Import" }) });
  assert.equal(contact.status, 201);

  const invalid = await fetch(`${workspaceUrl}/reports/contacts?from=2026-09-02T12:00:00.000Z&to=2026-09-01T12:00:00.000Z`, { headers });
  assert.equal(invalid.status, 422);

  const filtered = await fetch(`${workspaceUrl}/reports/contacts?search=report%20customer&source=Import`, { headers });
  assert.equal(filtered.status, 200);
  const filteredBody = (await filtered.json()) as { data: { summary: { contacts: number }; rows: Array<{ contact: string; source: string }> } };
  assert.equal(filteredBody.data.summary.contacts, 1);
  assert.deepEqual(filteredBody.data.rows.map(({ contact: name, source }) => ({ name, source })), [{ name: "Report Customer", source: "Import" }]);

  const overview = await fetch(`${workspaceUrl}/reports/overview?pageSize=10`, { headers });
  assert.equal(overview.status, 200);
  const overviewBody = (await overview.json()) as { data: { summary: { totalContacts: number; newContacts: number } } };
  assert.equal(overviewBody.data.summary.totalContacts, 1);
  assert.equal(overviewBody.data.summary.newContacts, 1);

  for (const report of ["campaigns", "conversations", "automations", "templates", "tasks"]) {
    const response = await fetch(`${workspaceUrl}/reports/${report}?page=1&pageSize=10`, { headers });
    assert.equal(response.status, 200, `${report} report should be available`);
    const body = (await response.json()) as { data: { report: string; rows: unknown[] } };
    assert.equal(body.data.report, report);
    assert.ok(Array.isArray(body.data.rows));
  }

  const exported = await fetch(`${workspaceUrl}/reports/contacts/export?search=report%20customer`, { headers });
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get("content-type") ?? "", /text\/csv/);
  assert.match(await exported.text(), /Report Customer/);

  const crossWorkspace = await fetch(`${baseUrl}/workspaces/00000000-0000-0000-0000-000000000000/reports/overview`, { headers });
  assert.equal(crossWorkspace.status, 403);
});
