import { chromium } from 'playwright';
const url = process.argv[2];
const errs = [];
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 2 });
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await p.waitForSelector('.ch', { state: 'visible', timeout: 300000 });
for (const g of ['m', 'f']) {
  await p.evaluate(`window.__selG('${g}')`);
  await p.waitForTimeout(500);
  await p.screenshot({ path: `/workspace/defendtaipei-v17-roles-select-${g}.png`, timeout: 120000 });
  for (const r of ['office', 'student', 'courier', 'nurse', 'tech']) {
    const bb = await p.locator(`.ch[data-r="${r}"]`).boundingBox();
    await p.screenshot({
      path: `/workspace/defendtaipei-v17-roles-close-${r}-${g}.png`,
      clip: bb,
      timeout: 120000,
      animations: 'disabled',
    });
  }
}
console.log('errs', errs);
await b.close();
