// v19.1 before/after: same camera position on two builds. argv: url outfile [x z]  (no x z => use v19 alley-finder and print position)
import { chromium } from 'playwright';
const [url, outf, X, Z] = process.argv.slice(2); const errs = [];
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1366, height: 820 } }); p.on('pageerror', e => errs.push(String(e)));
await p.goto(url); await p.waitForSelector('.ch', { state: 'visible', timeout: 300000 });
await p.evaluate(`document.querySelector('.ch[data-r="office"]').click()`); await p.waitForFunction(() => window.__game && !document.getElementById('wake'), null, { timeout: 900000, polling: 2000 });
const G = s => p.evaluate(`(()=>{const g=window.__game;${s}})()`);
let pos;
if (X === undefined) pos = await G(`for(const t of g.roadT.tiles.values()){const m=t.g.children.find(c=>c.type==='Group'&&c.children.length===4);if(m){return [m.position.x+2,m.position.z+2]}}`);
else pos = [+X, +Z];
await G(`g.player.pos.set(${pos[0]},0,${pos[1]})`); await p.waitForTimeout(4000);
await p.waitForFunction(() => window.__game.roadT.tiles.size >= 4, null, { timeout: 300000, polling: 2000 }); await p.waitForTimeout(6000);
const info = await G(`return {tiles:g.roadT.tiles.size}`);
await p.screenshot({ path: outf, timeout: 120000 });
if (process.env.CLOSE) { // close-up: zoom in on the nearest signalised junction
  const L = await G(`const P=g.player.pos;let best=null,bd=1e9;for(const t of g.roadT.tiles.values())for(const l of t.lights){const d=Math.hypot(l.x-P.x,l.z-P.z);if(d<bd){bd=d;best=l}}if(best)g.player.pos.set(best.x,0,best.z);return best&&[best.x,best.z]`);
  await p.mouse.move(683, 410); for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, -100); await p.waitForTimeout(300); }
  await p.waitForTimeout(8000); await p.screenshot({ path: outf.replace('.png', '-close.png'), timeout: 120000 }); info.light = L; }
console.log(JSON.stringify({ pos, info, errs })); await b.close();
