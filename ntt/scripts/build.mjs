import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
if (dirname(output) !== resolve(root) || basename(output) !== 'dist')
  throw new Error('Unexpected build output path');
// dist is generated output; remove stale maps/artifacts before rebuilding this exact directory.
await rm(output, { recursive: true, force: true });
for (const args of [
  [],
  ['--module', 'CommonJS', '--moduleResolution', 'Node', '--outDir', 'dist/cjs'],
]) {
  const result = spawnSync(
    process.execPath,
    [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json', ...args],
    { cwd: root, stdio: 'inherit' },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
await mkdir(new URL('../dist/cjs/', import.meta.url), { recursive: true });
await writeFile(new URL('../dist/cjs/package.json', import.meta.url), '{"type":"commonjs"}\n');
