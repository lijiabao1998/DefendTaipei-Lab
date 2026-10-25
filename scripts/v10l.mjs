import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] }); const errs = [];
const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://localhost:4173/DefendTaipei-Lab/'); await p.waitForFunction(() => window.__game, null, { timeout: 180000 });
await p.click('.ch[data-g="f"]'); await p.waitForTimeout(3000);
// kill 30 soldiers; teleport next to one with a gun drop
const r = await p.evaluate(`(()=>{const g=window.__game;const al=g.sols.filter(s=>s.state!=='dead'&&s.mesh.visible).slice(0,40);al.forEach(s=>g.damageSol(s,999,true));
 const ds=g.conts.filter(c=>c.label==='士兵遺留裝備');const sum={};ds.forEach(c=>Object.keys(c.items).forEach(k=>sum[k]=(sum[k]||0)+c.items[k]));
 const gc=ds.find(c=>c.gunMesh);if(gc)g.tp(gc.p?gc.p[0]:gc.mesh.position.x-1,gc.p?gc.p[1]:gc.mesh.position.z);return {n:ds.length,sum}})()`);
console.log(JSON.stringify(r)); await p.waitForTimeout(3000);
await p.screenshot({ path: '/workspace/defendtaipei-v10-loot-drop.png' });
await p.keyboard.press('KeyE'); await p.waitForTimeout(1200); await p.screenshot({ path: '/workspace/defendtaipei-v10-loot-panel.png' }); await p.keyboard.press('Escape');
await p.evaluate(`(()=>{const g=window.__game;for(const k of ['qbz191','qbz95','qbu191','qbu88','qsz92','qjy88','qcw05','qbs09','mag191','mag88','mag92','mag05','belt88','a58p','a12','a556','grenade','helmet','vest'])g.addItem(k,1);g.toggleInv()})()`);
await p.waitForTimeout(1200); await p.screenshot({ path: '/workspace/defendtaipei-v10-loot-inventory.png' });
console.log('errors', errs); await b.close();
