import { launch, shot, gameUrl, devices } from '../lib.mjs';
const url = gameUrl(process.argv[2]);
const errs = [];
const out = {};
const b = await launch();
for (const dv of (process.argv[3] || 'desk,phone').split(',')) {
  const ctx = await b.newContext(dv === 'phone' ? devices['iPhone 13'] : { viewport: { width: 1366, height: 820 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(dv + ':' + String(e)));
  await p.goto(url);
  await p.waitForSelector('.ch', { state: 'visible', timeout: 300000 });
  await p.evaluate(`document.querySelector('#gsel ~ label input, input[type=checkbox]').checked=true`);
  await p.evaluate(`document.querySelector('.ch[data-r="${dv === 'desk' ? 'courier' : 'tech'}"]').click()`);
  await p.waitForTimeout(4000);
  await p.evaluate(`window.__game.endPrologue&&window.__game.endPrologue()`);
  await p.waitForTimeout(3000);
  const info = await p.evaluate(
    `(()=>{const g=window.__game,d=g.drive,P=g.player.pos;const l=d.list.map(v=>({k:v.kind,n:v.s.name,d:Math.hypot(v.pos.x-P.x,v.pos.z-P.z)|0}));const c={};for(const v of l)c[v.k]=(c[v.k]||0)+1;return {count:l.length,kinds:c,near:l.sort((a,b)=>a.d-b.d).slice(0,6)}})()`,
  );
  out[dv] = info;
  // tour: teleport camera to several vehicle kinds
  const kinds =
    dv === 'desk'
      ? ['bus', 'delivery', 'taxi', 'kei', 'ubike', 'sedan', 'van', 'garbage', 'moto', 'escooter', 'basket', 'scooter']
      : ['delivery', 'taxi', 'sedan'];
  for (const k of kinds) {
    const ok = await p.evaluate(
      `(()=>{const g=window.__game,v=g.drive.list.find(v=>v.kind==='${k}');if(!v)return 0;g.player.pos.set(v.pos.x+2.2,0,v.pos.z+2.2);return 1})()`,
    );
    if (!ok) continue;
    await p.waitForTimeout(2500);
    await p.screenshot({ path: shot(`v18-vehicles-${dv}-${k}.png`), timeout: 120000 });
  }
  // enter + drive
  const r = await p.evaluate(
    `(()=>{const g=window.__game,d=g.drive;const v=${dv === 'desk' ? 'd.list.filter(v=>v.kind===`delivery`&&v.key).pop()' : 'd.list.find(v=>v.kind===`sedan`)'};g.player.inv.hose=1;g.player.pos.set(v.pos.x+0.5,0,v.pos.z+0.5);const m=d.enter(v);return {msg:m,cur:!!d.cur,st:d.status(v)}})()`,
  );
  out[dv + '_enter'] = r;
  const p0 = await p.evaluate(`(()=>{const v=window.__game.drive.cur;return v?[v.pos.x,v.pos.z,v.fuel]:null})()`);
  if (dv === 'desk') {
    await p.keyboard.down('KeyW');
    await p.waitForTimeout(6000);
    await p.keyboard.up('KeyW');
  } else {
    await p.evaluate(`(()=>{})()`);
    const jb = await p.locator('#joy').boundingBox();
    if (jb) {
      await p.mouse.move(jb.x + jb.width / 2, jb.y + jb.height / 2);
      await p.mouse.down();
      await p.mouse.move(jb.x + jb.width / 2, jb.y);
      await p.waitForTimeout(6000);
      await p.mouse.up();
    }
  }
  const p1 = await p.evaluate(`(()=>{const v=window.__game.drive.cur;return v?[v.pos.x,v.pos.z,v.fuel,v.v]:null})()`);
  out[dv + '_drive'] = { p0, p1 };
  await p.screenshot({ path: shot(`v18-vehicles-${dv}-driving.png`), timeout: 120000 });
  await ctx.close();
}
console.log(JSON.stringify(out, null, 1));
console.log('errs', errs);
await b.close();
