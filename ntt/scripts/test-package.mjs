import { mkdtemp, cp, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = await mkdtemp(join(tmpdir(), 'paypilot-ntt-consumer-'));
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run through npm run test:package');
function run(args, cwd = target) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Package verification failed: ' + args[0]);
}
run([npm, 'pack', '--pack-destination', target], root);
const archive = (await readdir(target)).find((name) => name.endsWith('.tgz'));
await writeFile(join(target, 'package.json'), '{"private":true,"type":"module"}');
run([npm, 'install', './' + archive, '--ignore-scripts', '--no-audit', '--no-fund']);
await cp(join(root, 'tests'), join(target, 'tests'), { recursive: true });
const tests = (await readdir(join(target, 'tests')))
  .filter((name) => name.endsWith('.test.mjs'))
  .map((name) => join('tests', name));
run(['--test', ...tests]);
const manifest = JSON.parse(
  await readFile(join(target, 'node_modules/@paypilot/ntt/package.json'), 'utf8'),
);
if (Object.keys(manifest.dependencies ?? {}).length)
  throw new Error('Unexpected runtime dependencies');
console.log('Isolated package verification passed on ' + process.version + ': ' + target);
