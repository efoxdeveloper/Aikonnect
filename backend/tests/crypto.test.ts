import assert from "node:assert/strict";
import test from "node:test";
import { generateSecureToken, hashPassword, hashToken, verifyPassword } from "../src/utils/crypto.js";

test("password hashes are salted and verify only the original password", async () => {
  const firstHash = await hashPassword("StrongPassword123");
  const secondHash = await hashPassword("StrongPassword123");

  assert.notEqual(firstHash, secondHash);
  assert.equal(await verifyPassword("StrongPassword123", firstHash), true);
  assert.equal(await verifyPassword("WrongPassword123", firstHash), false);
});

test("opaque tokens have sufficient entropy and deterministic hashes", () => {
  const firstToken = generateSecureToken();
  const secondToken = generateSecureToken();

  assert.notEqual(firstToken, secondToken);
  assert.ok(firstToken.length >= 40);
  assert.equal(hashToken(firstToken), hashToken(firstToken));
  assert.notEqual(hashToken(firstToken), hashToken(secondToken));
});
