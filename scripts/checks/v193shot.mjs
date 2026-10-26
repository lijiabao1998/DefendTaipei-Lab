// v19.3 buildings/arcades: overview + zoomed street-level shots at several streets, plus the arcade audit.
// argv: url outPrefix
import { launch } from '../lib.mjs';
const [url, pre] = process.argv.slice(2);
const SPOTS = process.env.SPOTS
  ? JSON.parse(process.env.SPOTS)
  : [
      ['emei', -149.759, -418.374],
      ['emeist', 425.6, -270.1],
      ['zhonghua', 450.5, 258],
      ['xining', 303.7, -42.3],
    ];
const errs = [];
const b = await launch();
const p = await b.newPage({ viewport: { width: 1366, height: 820 } });
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await p.waitForFunction(() => window.__newGame, null, { timeout: 600000, polling: 500 });
await p.evaluate(() => window.__newGame());
await p.waitForSelector('.ch', { state: 'visible', timeout: 300000 });
await p.evaluate(`document.querySelector('.ch[data-r="office"]').click()`);
await p.waitForFunction(() => window.__game && !document.getElementById('wake'), null, {
  timeout: 900000,
  polling: 2000,
});
const G = s => p.evaluate(`(()=>{const g=window.__game;${s}})()`);
const audit = await G(`return g.arcadeAudit ? g.arcadeAudit() : null`);
await p.mouse.move(683, 410);
for (const [nm, x, z] of SPOTS) {
  await G(`g.player.pos.set(${x},0,${z})`);
  await p.waitForTimeout(9000);
  await p.screenshot({ path: `${pre}-${nm}.png`, timeout: 120000 });
  for (let i = 0; i < 10; i++) await p.mouse.wheel(0, -100);
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `${pre}-${nm}-street.png`, timeout: 120000 });
  for (let i = 0; i < 10; i++) await p.mouse.wheel(0, 100);
}
console.log(JSON.stringify({ audit, errs }));
await b.close();
// arcade audit must be clean: no column outside its footprint, free-standing or in a road
if (audit && (audit.outside || audit.free || audit.road)) process.exit(1);
