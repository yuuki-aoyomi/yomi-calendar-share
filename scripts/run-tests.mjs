import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const testFiles = readdirSync('tests')
  .filter((name) => name.endsWith('.test.ts'))
  .sort()
  .map((name) => `tests/${name}`);

if (testFiles.length === 0) {
  console.error('No test files found.');
  process.exit(1);
}

rmSync('.tmp-tests', { recursive: true, force: true });
const esbuild = resolve('node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');
const build = spawnSync(esbuild, [...testFiles, '--bundle', '--platform=node', '--format=esm', '--outdir=.tmp-tests'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

const compiledTests = testFiles.map((file) => `.tmp-tests/${basename(file, '.ts')}.js`);
const run = spawnSync(process.execPath, ['--test', ...compiledTests], { stdio: 'inherit' });
process.exit(run.status ?? 1);
