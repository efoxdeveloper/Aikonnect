import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { createRateLimiter, defaultRateLimitConfig } from "../src/config/rate-limit.js";

let server: Server;
let baseUrl: string;

before(async () => {
  const app = express();
  app.use(createRateLimiter({ windowMs: 60_000, limit: 2 }));
  app.get("/health", (_request, response) => response.status(200).json({ ok: true }));
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Rate-limit test server did not bind to TCP"));
        return;
      }
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
    server.once("error", reject);
  });
});

after(() => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));

test("defaults use 500 requests per IP within five minutes", () => {
  assert.deepEqual(defaultRateLimitConfig, { windowMs: 300_000, limit: 500 });
});

test("rate limiter allows the configured requests and rejects the next one", async () => {
  const responses = await Promise.all([
    fetch(`${baseUrl}/health`),
    fetch(`${baseUrl}/health`),
    fetch(`${baseUrl}/health`),
  ]);

  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 200, 429]);
});
