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
  const fetchIndex = result.stdout.indexOf("git fetch origin main");
  const resetIndex = result.stdout.indexOf("git reset --hard origin/main");
  const cleanIndex = result.stdout.indexOf("git clean -fd");
  assert.ok(fetchIndex >= 0, "deploy should fetch the remote branch");
  assert.ok(resetIndex > fetchIndex, "deploy should reset to the fetched remote branch");
  assert.ok(cleanIndex > resetIndex, "deploy should clean untracked files after resetting");
  assert.match(result.stdout, /Frontend version patch --no-git-tag-version/);
  assert.match(result.stdout, /git -c user\.name=Interakt Deploy Bot -c user\.email=deploy@aikonnect\.efoxtechnologies\.com commit -m chore: bump frontend version for deployment/);
  assert.match(result.stdout, /git push origin main/);
});
