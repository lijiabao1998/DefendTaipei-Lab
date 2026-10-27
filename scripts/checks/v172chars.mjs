// v17.2 character close-ups: needs `npx vite --port 5199` running (dev server) for the lineup page.
import { launch } from '../lib.mjs';
const base = process.argv[2] || 'http://localhost:5199/scripts/checks/lineup/index.html';
const out = process.argv[3] || '/workspace';
const b = await launch();
const p = await b.newPage({ viewport: { width: 1400, height: 820 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
for (const [q, f] of [
  ['set=roles&g=m', 'v17.2-roles-m'],
  ['set=roles&g=f', 'v17.2-roles-f'],
  ['set=crowd', 'v17.2-crowd'],
  ['set=crowd&walk=1', 'v17.2-crowd-walk'],
  ['set=soldier', 'v17.2-soldier'],
]) {
  await p.goto(`${base}?${q}`);
  await p.waitForFunction(() => window.__ready, null, { timeout: 300000, polling: 500 });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/defendtaipei-${f}.png` });
}
console.log('errs', errs);
await b.close();
