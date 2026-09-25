import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("deploy dry-run bumps, records and pushes the frontend patch version", () => {
  const result = spawnSync(process.execPath, ["scripts/deploy.mjs", "--dry-run"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const resetIndex = result.stdout.indexOf("git reset --hard HEAD");
  const cleanIndex = result.stdout.indexOf("git clean -fd");
  const pullIndex = result.stdout.indexOf("git pull --ff-only origin main");
  assert.ok(resetIndex >= 0, "deploy should discard tracked local changes");
  assert.ok(cleanIndex > resetIndex, "deploy should clean untracked files after resetting");
  assert.ok(pullIndex > cleanIndex, "deploy should pull only after cleaning the checkout");
  assert.match(result.stdout, /Frontend version patch --no-git-tag-version/);
  assert.match(result.stdout, /git -c user\.name=Interakt Deploy Bot -c user\.email=deploy@aikonnect\.efoxtechnologies\.com commit -m chore: bump frontend version for deployment/);
  assert.match(result.stdout, /git push origin main/);
});
