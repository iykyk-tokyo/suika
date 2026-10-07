import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { analyzeBundle } from './check-bundle.mjs';

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-'));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

const OK_HTML = '<html><head><script src="https://www.youtube.com/game_api/v1"></script><script type="module" src="./assets/main.js"></script></head></html>';

test('passes a clean bundle', () => {
  const dir = fixture({ 'index.html': OK_HTML, 'assets/main-abc123.js': 'x'.repeat(100) });
  const r = analyzeBundle(dir);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.files.length, 2);
});

test('flags illegal characters in file names', () => {
  const dir = fixture({ 'index.html': OK_HTML, 'assets/日本語.js': 'x', 'assets/with space.js': 'x' });
  const r = analyzeBundle(dir);
  assert.equal(r.errors.length, 2);
});

test('warns above 512 KiB and errors above 30 MiB', () => {
  const dir = fixture({ 'index.html': OK_HTML, 'assets/big.js': 'x'.repeat(512 * 1024 + 1) });
  const r = analyzeBundle(dir);
  assert.equal(r.warnings.length, 1);
  assert.deepEqual(r.errors, []);
});

test('errors when the SDK script is not the first script in index.html', () => {
  const dir = fixture({ 'index.html': '<script src="./a.js"></script><script src="https://www.youtube.com/game_api/v1"></script>' });
  const r = analyzeBundle(dir);
  assert.ok(r.errors.some((e) => e.includes('game_api/v1')));
});

test('errors when index.html is missing', () => {
  const dir = fixture({ 'a.js': 'x' });
  assert.ok(analyzeBundle(dir).errors.some((e) => e.includes('index.html')));
});
