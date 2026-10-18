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

const runCommand = (command, args, description) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) {
    console.error(`${description} failed to start:`, result.error);
    process.exit(1);
  }
  if (result.signal) {
    console.error(`${description} terminated by signal ${result.signal}.`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${description} failed (exit code ${result.status ?? 'unknown'}).`);
    process.exit(result.status ?? 1);
  }
};

rmSync('.tmp-tests', { recursive: true, force: true });

// Run the esbuild JavaScript CLI using Node directly, avoiding Windows .cmd
// wrappers that spawnSync cannot reliably execute without a shell.
const esbuildCli = resolve('node_modules', 'esbuild', 'bin', 'esbuild');
runCommand(process.execPath, [
  esbuildCli,
  ...testFiles,
  '--bundle',
  '--platform=node',
  '--format=esm',
  '--outdir=.tmp-tests',
], 'esbuild');

const compiledTests = testFiles.map((file) => `.tmp-tests/${basename(file, '.ts')}.js`);
runCommand(process.execPath, ['--test', ...compiledTests], 'Node test runner');
