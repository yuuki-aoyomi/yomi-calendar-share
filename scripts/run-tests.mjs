import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { basename } from 'node:path';
import { buildSync } from 'esbuild';

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

try {
  buildSync({
    entryPoints: testFiles,
    bundle: true,
    platform: 'node',
    format: 'esm',
    outdir: '.tmp-tests',
    logLevel: 'info',
  });
} catch (error) {
  console.error('esbuild failed:', error);
  process.exit(1);
}

const compiledTests = testFiles.map((file) => `.tmp-tests/${basename(file, '.ts')}.js`);
runCommand(process.execPath, ['--test', ...compiledTests], 'Node test runner');
