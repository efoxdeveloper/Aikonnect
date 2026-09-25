import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
  META_APP_ID: "test-app",
  META_APP_SECRET: "test-app-secret",
  META_TOKEN_ENCRYPTION_KEY: "test-token-encryption-key-for-tests-32chars",
  META_GRAPH_API_VERSION: "v25.0",
});

const { prisma } = await import("../src/database/prisma.js");
const { env } = await import("../src/config/env.js");
const { deleteTemplate } = await import("../src/modules/templates/template.service.js");
const { processTemplateDeletion } = await import("../src/modules/templates/template-deletion.worker.js");

function stub(t: TestContext, target: any, method: string, implementation: (...args: any[]) => any) {
  const original = target[method];
  target[method] = implementation;
  t.after(() => { target[method] = original; });
}

function queuedTemplate() {
  return {
    id: "template-1",
    workspaceId: "workspace-1",
    status: "APPROVED",
    metaTemplateId: "meta-template-1",
    metaTemplateName: "summer_sale",
  };
}

test("remote template deletion is queued without contacting Meta in the API request", { concurrency: false }, async (t) => {
  let updateData: Record<string, unknown> | undefined;
  stub(t, prisma.template, "findFirst", async () => queuedTemplate());
  stub(t, prisma.template, "updateMany", async (args: any) => { updateData = args.data; return { count: 1 }; });
  stub(t, globalThis, "fetch", async () => { throw new Error("Meta must not be called by the request handler"); });

  const result = await deleteTemplate("workspace-1", "template-1", "user-1");

  assert.deepEqual(result, { queued: true });
  assert.equal(updateData?.status, "DELETING");
  assert.equal(updateData?.deletionAttemptCount, 0);
  assert.ok(updateData?.deletionNextAttemptAt instanceof Date);
});

test("template deletion worker marks a template deleted after Meta succeeds", { concurrency: false }, async (t) => {
  env.META_SYSTEM_USER_ACCESS_TOKEN = "test-system-token";
  t.after(() => { env.META_SYSTEM_USER_ACCESS_TOKEN = undefined; });
  const updates: Array<Record<string, unknown>> = [];
  stub(t, prisma.template, "findFirst", async () => ({
    id: "template-1",
    workspaceId: "workspace-1",
    metaTemplateId: "meta-template-1",
    metaTemplateName: "summer_sale",
    name: "Summer Sale",
    deletionAttemptCount: 0,
  }));
  stub(t, prisma.template, "updateMany", async (args: any) => { updates.push(args.data); return { count: 1 }; });
  stub(t, prisma.whatsAppBusinessAccount, "findFirst", async () => ({ metaWabaId: "waba-1", encryptedAccessToken: "stored-token" }));
  stub(t, globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    assert.match(String(input), /\/v25\.0\/waba-1\/message_templates\?hsm_id=meta-template-1&name=summer_sale/);
    assert.equal(init?.method, "DELETE");
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-system-token");
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });

  assert.equal(await processTemplateDeletion("template-1"), true);
  assert.equal(updates.length, 2);
  assert.deepEqual(updates[0]?.deletionAttemptCount, { increment: 1 });
  assert.equal(updates[1]?.status, "DELETED");
  assert.equal(updates[1]?.deletionError, null);
});

test("template deletion worker schedules a retry when Meta fails", { concurrency: false }, async (t) => {
  env.META_SYSTEM_USER_ACCESS_TOKEN = "test-system-token";
  t.after(() => { env.META_SYSTEM_USER_ACCESS_TOKEN = undefined; });
  const updates: Array<Record<string, unknown>> = [];
  stub(t, prisma.template, "findFirst", async () => ({
    id: "template-1",
    workspaceId: "workspace-1",
    metaTemplateId: "meta-template-1",
    metaTemplateName: "summer_sale",
    name: "Summer Sale",
    deletionAttemptCount: 0,
  }));
  stub(t, prisma.template, "updateMany", async (args: any) => { updates.push(args.data); return { count: 1 }; });
  stub(t, prisma.whatsAppBusinessAccount, "findFirst", async () => ({ metaWabaId: "waba-1", encryptedAccessToken: "stored-token" }));
  stub(t, globalThis, "fetch", async () => new Response(JSON.stringify({ error: { message: "temporary outage" } }), { status: 503 }));

  assert.equal(await processTemplateDeletion("template-1"), true);
  assert.equal(updates.length, 2);
  assert.equal(updates[1]?.status, "DELETING");
  assert.ok(updates[1]?.deletionNextAttemptAt instanceof Date);
  assert.match(String(updates[1]?.deletionError), /temporary outage/);
});
