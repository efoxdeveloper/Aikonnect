import assert from "node:assert/strict";
import { getDefaultResultOrder, setDefaultResultOrder } from "node:dns";
import { test } from "node:test";
import { configureNetworkResolution } from "../src/config/network.js";

test("prefers IPv4 DNS results for outbound provider requests", () => {
  const previous = getDefaultResultOrder();
  try {
    configureNetworkResolution();
    assert.equal(getDefaultResultOrder(), "ipv4first");
  } finally {
    setDefaultResultOrder(previous);
  }
});
