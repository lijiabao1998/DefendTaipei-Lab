import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1024, height: 640 } });
await p.goto('http://localhost:4173/DefendTaipei-Lab/'); await p.waitForFunction(() => window.__game, null, { timeout: 120000 });
await p.click('.ch[data-g="f"]'); await p.waitForTimeout(3000);
const n = await p.evaluate(`(()=>{const g=window.__game;window.__S=[];g.blds.forEach(b=>b.roof.children.forEach(o=>{if(o.isGroup&&o.children.length>=3)window.__S.push(o.getWorldPosition(new o.position.constructor()))}));window.__S.sort((a,b)=>a.y-b.y);return window.__S.length})()`);
for (const [i, nm] of [[2, 'a'], [Math.floor(n / 3), 'b'], [Math.floor(n / 2), 'c']]) {
  for (const night of [0, 1]) {
    await p.evaluate(`(()=>{const g=window.__game,q=window.__S[${i}];g.tp(q.x+13,q.z+13);g.setMin(${night ? 22 * 60 : 9 * 60})})()`);
    await p.waitForTimeout(5000); await p.screenshot({ path: `/workspace/defendtaipei-v9-rooftop-shack-${nm}-${night ? 'night' : 'day'}.png` });
  }
}
await b.close();
