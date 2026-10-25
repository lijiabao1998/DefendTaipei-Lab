import { chromium, devices } from 'playwright';
const [url, tag] = [process.argv[2], process.argv[3]];
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await p.waitForFunction(() => window.__game, null, { timeout: 240000 });
await p.tap('.ch[data-g="f"]', { noWaitAfter: true, timeout: 120000 });
await p.waitForTimeout(4000);
const L = await p.evaluate(
  `(()=>{const g=window.__game;const c=g.blds.filter(b=>b.h>=6&&b.h<=13&&b.roof.children.length>=6&&Math.max(b.maxx-b.minx,b.maxz-b.minz)>22).sort((a,b)=>(b.maxx-b.minx)+(b.maxz-b.minz)-(a.maxx-a.minx)-(a.maxz-a.minz));return c.slice(0,40).filter((_,i)=>i%8==0).map(b=>[(b.minx+b.maxx)/2,(b.minz+b.maxz)/2,b.maxx,b.maxz])})()`,
);
const LB = await p.evaluate(
  `window.__game.blds.filter(b=>b.h>=6&&b.h<=13&&b.roof.children.length>=6&&Math.max(b.maxx-b.minx,b.maxz-b.minz)>22).sort((a,b)=>(b.maxx-b.minx)+(b.maxz-b.minz)-(a.maxx-a.minx)-(a.maxz-a.minz)).slice(0,40).filter((_,i)=>i<4).map(b=>[b.minx,b.minz,b.maxx,b.maxz])`,
);
let i = 0;
for (const [x0, z0, x1, z1] of LB) {
  if (i >= 6) break;
  const ok = await p.evaluate(
    `(()=>{const g=window.__game;const C=[[${(x0 + x1) / 2},${z0}-15],[${(x0 + x1) / 2}+6,${z0}-16],[${(x0 + x1) / 2},${z0}-20]];for(const [x,z] of C){if(!g.blds.some(b=>x>b.minx-1&&x<b.maxx+1&&z>b.minz-1&&z<b.maxz+1)){g.tp(x,z);g.setMin&&g.setMin(10*60);return true}}return false})()`,
  );
  if (!ok) continue;
  await p.waitForTimeout(5000);
  await p.screenshot({ path: `/workspace/defendtaipei-v14-rooftop-${tag}-${String.fromCharCode(97 + i++)}.png` });
}
console.log('errs', errs);
await b.close();
