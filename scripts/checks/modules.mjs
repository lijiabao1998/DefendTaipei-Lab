// Run the independent contracts using only locked, installed dependencies.
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'defendtaipei-checks-'));
try {
  for (const entry of [
    'scripts/checks/bus.mjs',
    'scripts/checks/save.mjs',
    'scripts/checks/legacy-tiles.mjs',
    'scripts/checks/tile-transaction.mjs',
    'scripts/checks/nav-rollback-risk.mjs',
    'scripts/checks/nav-ownership.mjs',
    'src/story/index.check.ts',
    'src/map/tiles/manager.check.ts',
    'src/map/tiles/grid-lod.check.ts',
  ]) {
    const outfile = join(temp, 'check.mjs');
    await build({ entryPoints: [join(root, entry)], outfile, bundle: true, platform: 'node', format: 'esm' });
    console.log(`\n${entry}`);
    const result = spawnSync(process.execPath, [outfile], { stdio: 'inherit', cwd: root });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${entry} failed (${result.signal || result.status})`);
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}
