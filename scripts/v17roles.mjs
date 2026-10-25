import { chromium, devices } from 'playwright';
const url = process.argv[2];
const errs = [];
const out = [];
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const runs = [
  ['courier', 'm', 'desk'],
  ['nurse', 'f', 'phone'],
  ['tech', 'm', 'phone'],
  ['student', 'f', 'desk'],
  ['office', 'm', 'phone'],
];
for (const [role, g, dv] of runs) {
  const ctx = await b.newContext(dv === 'phone' ? devices['iPhone 13'] : { viewport: { width: 1366, height: 820 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(role + ':' + String(e)));
  await p.goto(url);
  await p.waitForSelector('.ch', { state: 'visible', timeout: 300000 });
  await p.evaluate(`window.__selG('${g}')`);
  if (role === 'courier' || role === 'nurse')
    await p.screenshot({ path: `/workspace/defendtaipei-v17-roles-select-${dv}.png`, fullPage: true });
  await p.evaluate(`document.querySelector('.ch[data-r="${role}"]').click()`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `/workspace/defendtaipei-v17-roles-${role}-${g}-1wake.png` });
  await p.waitForTimeout(14000);
  await p.screenshot({ path: `/workspace/defendtaipei-v17-roles-${role}-${g}-2commute.png` });
  const st = await p.evaluate(
    `(()=>{const g=window.__game;return {role:g.role().id,inv:g.player.inv,pro:g.PRO.stage,dest:g.PRO.label}})()`,
  );
  out.push(st);
  if (role === 'courier' || role === 'office') {
    await p.evaluate(`window.__game.PRO.t=80`);
    await p.waitForTimeout(7000);
    await p.screenshot({ path: `/workspace/defendtaipei-v17-roles-${role}-${g}-3invasion.png` });
    await p.waitForTimeout(12000);
    await p.screenshot({ path: `/workspace/defendtaipei-v17-roles-${role}-${g}-4survival.png` });
    out.push(await p.evaluate('window.__game.PRO.stage'));
  }
  await ctx.close();
}
console.log(JSON.stringify(out));
console.log('errs', errs);
await b.close();
