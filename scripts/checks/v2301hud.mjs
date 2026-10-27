// v23.0.1 portrait mobile HUD: radio card under the status panel, no duplicate radio log line, nothing overlapping
// the joystick / 蹲 / 打 / weapon label, 跳過開場 clear of 打. argv: url outDir
import { launch } from '../lib.mjs';
import fs from 'node:fs';
const [url = 'http://localhost:4173/DefendTaipei-Lab/', out = 'shots/v2301'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await launch();
const R = {};
for (const [w, h] of [
  [360, 780],
  [390, 844],
  [412, 915],
]) {
  const ctx = await b.newContext({
    viewport: { width: w, height: h },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url);
  await p.waitForFunction(() => window.__newGame, null, { timeout: 180000 });
  await p.evaluate(() => window.__newGame());
  await p.waitForSelector('.ch', { state: 'visible', timeout: 180000 });
  await p.click('.ch[data-r="nurse"]');
  await p.evaluate(() => document.getElementById('startgo')?.click());
  await p.waitForFunction(() => window.__game?.started?.(), null, { timeout: 180000 });
  await p.waitForFunction(() => !document.getElementById('wake') || document.getElementById('skipbtn'), null, {
    timeout: 60000,
  });
  const skip = await p.evaluate(() => {
    const g = id => {
      const r = document.getElementById(id)?.getBoundingClientRect();
      return r && [r.left, r.top, r.right, r.bottom].map(Math.round);
    };
    return { skip: g('skipbtn'), act: g('pbact'), sec: g('pbsec') };
  });
  await p.screenshot({ path: `${out}/prologue_${w}x${h}.png` });
  await p.evaluate(() => window.__game.endPrologue());
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    window.__game.phone('📻 中廣（收音機）', '…佔領當局宣稱「水電維持正常供應」，但多處變電所已遭接管…');
  });
  await p.waitForTimeout(1200);
  const rects = await p.evaluate(() => {
    const o = {};
    for (const id of ['stats', 'phone', 'log', 'skipbtn', 'pbact', 'pbsec', 'joy', 'equip', 'pbhint', 'topright']) {
      const e = document.getElementById(id);
      if (!e || getComputedStyle(e).display === 'none' || (!e.offsetParent && getComputedStyle(e).position !== 'fixed'))
        continue;
      const r = e.getBoundingClientRect();
      if (r.width && r.height && (id !== 'log' || e.querySelector('div:not(.radio)')))
        o[id] = [r.left, r.top, r.right, r.bottom].map(Math.round);
    }
    o.portrait = document.body.classList.contains('portrait');
    o.radioLogVisible = [...document.querySelectorAll('#log .radio')].some(d => getComputedStyle(d).display !== 'none');
    o.phoneOpacity = getComputedStyle(document.getElementById('phone')).opacity;
    return o;
  });
  const hit = (a, c) => a && c && a[0] < c[2] && a[2] > c[0] && a[1] < c[3] && a[3] > c[1];
  const bad = [];
  if (hit(skip.skip, skip.act) || hit(skip.skip, skip.sec)) bad.push('skipbtn×打/蹲');
  for (const a of ['phone', 'log', 'skipbtn', 'pbhint'])
    for (const c of ['pbact', 'pbsec', 'joy', 'equip', 'stats', 'topright', 'phone', 'skipbtn'])
      if (a !== c && hit(rects[a], rects[c])) bad.push(a + '×' + c);
  await p.screenshot({ path: `${out}/portrait_${w}x${h}.png` });
  R[`${w}x${h}`] = {
    rects,
    overlaps: bad,
    underStats:
      rects.phone &&
      rects.stats &&
      Math.abs(rects.phone[1] - rects.stats[3] - 6) <= 2 &&
      rects.phone[0] === rects.stats[0] &&
      rects.phone[2] === rects.stats[2],
    errs,
  };
  await ctx.close();
}
console.log(JSON.stringify(R, null, 1));
await b.close();
