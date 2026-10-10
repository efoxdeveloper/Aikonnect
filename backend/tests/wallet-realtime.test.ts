import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import type { Response } from "express";

const { publishWalletUpdated, streamWalletUpdates } = await import("../src/realtime/wallet.js");

class FakeResponse extends EventEmitter {
  writableEnded = false;
  destroyed = false;
  output = "";
  status() { return this; }
  set() { return this; }
  flushHeaders() {}
  write(value: string) { this.output += value; return true; }
  flush() {}
}

test("wallet SSE updates are isolated to the subscribed workspace and stop after disconnect", () => {
  const response = new FakeResponse();
  const close = streamWalletUpdates("workspace-a", response as unknown as Response);
  assert.match(response.output, /event: wallet\.ready/);
  publishWalletUpdated("workspace-b");
  assert.equal((response.output.match(/event:/g) ?? []).length, 1);
  publishWalletUpdated("workspace-a");
  assert.match(response.output, /event: wallet\.updated/);
  close();
  const lengthAfterClose = response.output.length;
  publishWalletUpdated("workspace-a");
  assert.equal(response.output.length, lengthAfterClose);
});
