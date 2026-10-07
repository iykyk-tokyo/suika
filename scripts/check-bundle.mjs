import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WARN_BYTES = 512 * 1024;
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_TOTAL_BYTES = 250 * 1024 * 1024;
const MAX_FILES = 8000;
const NAME_RE = /^[A-Za-z0-9_.-]+$/;
const SDK_SRC = 'https://www.youtube.com/game_api/v1';

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export function analyzeBundle(distDir) {
  const warnings = [];
  const errors = [];
  const files = walk(distDir).map((full) => ({ path: relative(distDir, full), bytes: statSync(full).size }));
  let totalBytes = 0;

  for (const f of files) {
    totalBytes += f.bytes;
    for (const segment of f.path.split(/[\\/]/)) {
      if (!NAME_RE.test(segment)) errors.push(`illegal file name: ${f.path}`);
    }
    if (f.bytes >= MAX_FILE_BYTES) errors.push(`file over 30 MiB: ${f.path} (${f.bytes} bytes)`);
    else if (f.bytes > WARN_BYTES) warnings.push(`file over 512 KiB (SHOULD): ${f.path} (${f.bytes} bytes)`);
  }
  if (files.length > MAX_FILES) errors.push(`too many files: ${files.length}`);
  if (totalBytes >= MAX_TOTAL_BYTES) errors.push(`total bundle over 250 MiB: ${totalBytes}`);

  const index = files.find((f) => f.path === 'index.html');
  if (index === undefined) {
    errors.push('index.html missing at bundle root');
  } else {
    const html = readFileSync(join(distDir, 'index.html'), 'utf8');
    const first = /<script\b[^>]*>/i.exec(html);
    if (first === null || !first[0].includes(SDK_SRC)) {
      errors.push(`first <script> in index.html must load ${SDK_SRC}`);
    }
  }
  return { files, totalBytes, warnings, errors };
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const dist = process.argv[2] ?? 'dist';
  const r = analyzeBundle(dist);
  console.log(`${r.files.length} files, ${(r.totalBytes / 1024).toFixed(1)} KiB total`);
  for (const f of r.files.sort((a, b) => b.bytes - a.bytes).slice(0, 10)) console.log(`  ${(f.bytes / 1024).toFixed(1).padStart(8)} KiB  ${f.path}`);
  for (const w of r.warnings) console.warn(`WARN  ${w}`);
  for (const e of r.errors) console.error(`ERROR ${e}`);
  process.exit(r.errors.length === 0 ? 0 : 1);
}
