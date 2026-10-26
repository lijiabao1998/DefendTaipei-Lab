// v19.1 before/after: same camera position on two builds. argv: url outfile [x z]  (no x z => use v19 alley-finder and print position)
import { launch } from '../lib.mjs';
const [url, outf, X, Z] = process.argv.slice(2);
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
let pos;
if (X === undefined)
  pos = await G(
    `for(const t of g.roadT.tiles.values()){const m=t.g.children.find(c=>c.type==='Group'&&c.children.length===4);if(m){return [m.position.x+2,m.position.z+2]}}`,
  );
else pos = [+X, +Z];
await G(`g.player.pos.set(${pos[0]},0,${pos[1]})`);
await p.waitForTimeout(4000);
await p.waitForFunction(() => window.__game.roadT.tiles.size >= 4, null, { timeout: 300000, polling: 2000 });
await p.waitForTimeout(6000);
const info = await G(`return {tiles:g.roadT.tiles.size}`);
await p.screenshot({ path: outf, timeout: 120000 });
console.log(JSON.stringify({ pos, info, errs }));
await b.close();
