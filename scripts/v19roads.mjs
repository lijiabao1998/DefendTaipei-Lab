import { chromium } from 'playwright';
const url = process.argv[2]; const errs = []; const out = {}; const S = n => `/workspace/defendtaipei-v19-roads-${n}.png`;
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1366, height: 820 } }); p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text()); });
await p.goto(url); await p.waitForSelector('.ch', { state: 'visible', timeout: 300000 });
await p.evaluate(`document.querySelector('.ch[data-r="office"]').click()`); await p.waitForFunction(() => window.__game && !document.getElementById('wake'), null, { timeout: 900000, polling: 2000 }); out.fps = await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 10000) requestAnimationFrame(f); else r(n / 10); }; requestAnimationFrame(f); }));
const G = s => p.evaluate(`(()=>{const g=window.__game;${s}})()`);
const st = () => G(`return {tiles:[...g.roadT.tiles.keys()],stats:g.roadT.stats,cars:g.traffic.cars.length,mode:g.traffic.mode,tstats:g.traffic.stats,power:null}`);
out.t0 = await st();
// go to a signalised junction and watch traffic
const L = await G(`const P=g.player.pos;let best=null,bd=1e9;for(const t of g.roadT.tiles.values())for(const l of t.lights){const d=Math.hypot(l.x-P.x,l.z-P.z);if(d<bd){bd=d;best=l}}if(!best)return null;g.player.pos.set(best.x+3,0,best.z+3);return [best.x,best.z,bd|0]`);
out.light = L; await p.waitForTimeout(9000); await p.screenshot({ path: S('1-junction-morning'), timeout: 120000 });
out.t1 = await st();
await G(`const c=g.traffic.cars[0];if(c)g.player.pos.set(c.x+4,0,c.z+4)`); await p.waitForTimeout(5000); await p.screenshot({ path: S('2-traffic'), timeout: 120000 });
await G(`g.PRO.t=80`); await p.waitForTimeout(9000); await p.screenshot({ path: S('3-invasion-panic'), timeout: 120000 }); out.t2 = await st();
await G(`g.endPrologue()`); await p.waitForTimeout(6000); out.t3 = await st();
out.abandoned = await G(`return g.drive.list.length`);
await p.screenshot({ path: S('4-abandoned'), timeout: 120000 });
const W = await G(`let w=null,b=null;for(const t of g.roadT.tiles.values()){w=w||t.wrecks[0];b=b||t.barriers[0]}return {w:w&&[w.x,w.z,w.kind,w.id],b:b&&[b.x,b.z]}`); out.war = W;
if (W.w) { await G(`g.player.pos.set(${W.w[0] + 3},0,${W.w[1] + 3})`); await p.waitForTimeout(5000); await p.screenshot({ path: S('5-wreck'), timeout: 120000 });
  out.loot = await G(`const w=g.roadT.wreckNear(${W.w[0]},${W.w[1]},1);const ok=g.roadT.loot(w);return {ok,saved:localStorage.getItem('dt-tiles-v1')}`); }
if (W.b) { await G(`g.player.pos.set(${W.b[0] + 3},0,${W.b[1] + 3})`); await p.waitForTimeout(5000); await p.screenshot({ path: S('6-barrier'), timeout: 120000 }); }
// streaming: walk far away and back
const far = await G(`const P=g.player.pos;const x=P.x+520,z=P.z;g.player.pos.set(x,0,z);return [x,z]`); await p.waitForTimeout(8000); out.t4 = await st();
await G(`g.player.pos.set(${far[0] - 520},0,${far[1]})`); await p.waitForTimeout(8000); out.t5 = await st();
if (W.w) out.relooted = await G(`const w=g.roadT.wreckNear(${W.w[0]},${W.w[1]},1);return w?w.looted:'none'`);
// alley detail
await G(`for(const t of g.roadT.tiles.values()){const m=t.g.children.find(c=>c.type==='Group'&&c.children.length===4);if(m){g.player.pos.set(m.position.x+2,0,m.position.z+2);return}}`); await p.waitForTimeout(5000); await p.screenshot({ path: S('7-alley'), timeout: 120000 });
// blackout: lights dark
out.power = await G(`return null`);
console.log(JSON.stringify(out, null, 1)); console.log('errs', errs); await b.close();
