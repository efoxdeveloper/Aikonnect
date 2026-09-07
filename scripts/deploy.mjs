import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const pm2Command = process.platform === "win32" ? "pm2.cmd" : "pm2";

function run(command, args) {
  const displayCommand = [command, ...args].join(" ");
  console.log("\n> " + displayCommand);

  if (dryRun) return;

  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32" && (command.endsWith(".cmd") || command.endsWith(".bat")),
  });

  if (result.error) {
    console.error("Deployment command failed to start: " + result.error.message);
    process.exit(result.status ?? 1);
  }

  if (result.status !== 0) {
    console.error("Deployment stopped because the command exited with code " + result.status + ".");
    process.exit(result.status ?? 1);
  }
}

console.log("Deploying Interakt from " + repositoryRoot + (dryRun ? " (dry run)" : ""));

run("git", ["pull", "--ff-only", "origin", "main"]);
run(npmCommand, ["--prefix", "backend", "ci"]);
run(npmCommand, ["--prefix", "Frontend", "ci"]);
// Treat every deployment as a patch release so the sidebar version identifies
// the build that was deployed. Commit and push the generated package metadata
// before building so the next deployment starts from a clean checkout.
run(npmCommand, ["--prefix", "Frontend", "version", "patch", "--no-git-tag-version"]);
run("git", ["add", "Frontend/package.json", "Frontend/package-lock.json"]);
run("git", ["commit", "-m", "chore: bump frontend version for deployment"]);
run("git", ["push", "origin", "main"]);
run(npmCommand, ["--prefix", "backend", "run", "prisma:generate"]);
run(npmCommand, ["--prefix", "backend", "run", "prisma:migrate:deploy"]);
run(npmCommand, ["--prefix", "backend", "run", "build"]);
run(npmCommand, ["--prefix", "Frontend", "run", "build"]);
run(pm2Command, ["startOrRestart", "ecosystem.config.cjs", "--update-env"]);
run(pm2Command, ["save"]);

console.log("\nDeployment completed.");
