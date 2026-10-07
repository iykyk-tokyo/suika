import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

// macOS / Linux の zip コマンドを使う。Windows では Compress-Archive に置き換える。
const dist = resolve(process.argv[2] ?? 'dist');
const out = resolve(process.argv[3] ?? 'ocean-merge.zip');
if (!existsSync(dist)) {
  console.error(`dist not found: ${dist}. Run "npm run build" first.`);
  process.exit(1);
}
rmSync(out, { force: true });
execFileSync('zip', ['-r', '-X', out, '.'], { cwd: dist, stdio: 'inherit' });
console.log(`wrote ${out}`);
