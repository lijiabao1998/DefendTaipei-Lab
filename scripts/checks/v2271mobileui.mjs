// v22.7.1 mobile UI: title menu appears after loading (fresh + reload), no in-game HUD on the title, settings modal
// has a sticky ✕ header / opaque backdrop / internal scroll / outside-tap + Back close, touch settings shown, and
// the ☰ pause menu closes by ✕ / outside tap / Back. Android Chrome UA + touch. argv: url outDir
import { launch } from '../lib.mjs';
const [url, out] = process.argv.slice(2);
const b = await launch();
const UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const res = {};
const vis = sel => {
  const e = document.querySelector(sel);
  if (!e || getComputedStyle(e).display === 'none' || getComputedStyle(e).visibility === 'hidden') return false;
  const r = e.getBoundingClientRect();
  return (
    r.width > 0 &&
    r.height > 0 &&
    r.top >= 0 &&
    r.bottom <= innerHeight + 0.5 &&
    r.left >= 0 &&
    r.right <= innerWidth + 0.5
  );
};
const titleState = p =>
  p.evaluate(vis => {
    const v = new Function('sel', `return (${vis})(sel)`);
    return {
      ver: document.querySelector('#title h2').textContent,
      tmenu: v('#tmenu') && document.querySelectorAll('#tmenu button').length,
      equipHidden: !v('#equip'),
      hudBtnsHidden: !v('#pbact') && !v('#menubtn') && !v('#pmapbtn'),
      rescue: !!document.getElementById('rescue'),
    };
  }, vis.toString());
const modalState = p =>
  p.evaluate(vis => {
    const v = new Function('sel', `return (${vis})(sel)`);
    const m = document.getElementById('modal');
    if (!m) return null;
    const body = m.querySelector('.mbody');
    const bg = getComputedStyle(m).backgroundColor;
    return {
      xVisible: v('#modal .mx'),
      closeVisible: v('#modal .mclose'),
      boxFits: v('#modal .mbox'),
      scrolls: body.scrollHeight > body.clientHeight,
      backdropAlpha: +(bg.match(/[\d.]+\)$/) || ['1'])[0].replace(')', ''),
      touchOpts: !!m.querySelector('#sbtn') && !!m.querySelector('#svib'),
      keysCollapsed: !!m.querySelector('details.kdet:not([open]) #klist'),
    };
  }, vis.toString());
// real touch drag through CDP (the joystick's touchmove blocker must not stop it)
const swipe = async (p, cdp, x, y0, y1) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 8; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / 8 }],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(400);
};
const waitTitle = p =>
  p.waitForFunction(() => document.getElementById('tmenu')?.offsetHeight > 0, null, { timeout: 600000, polling: 500 });
for (const [w, h] of [
  [360, 780],
  [390, 844],
  [412, 915],
].filter((_, i) => !process.env.ONE || i === +process.env.ONE - 1)) {
  const G = `${w}x${h}`;
  const ctx = await b.newContext({
    viewport: { width: w, height: h },
    hasTouch: true,
    isMobile: true,
    userAgent: UA,
    deviceScaleFactor: 2,
  });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  const r = {};
  await p.goto(url);
  await waitTitle(p);
  await p.waitForTimeout(800);
  r.fresh = await titleState(p);
  await p.screenshot({ path: `${out}/title-fresh-${G}.png` });
  // settings from the title
  await p.tap('#tmenu button[data-a="set"]');
  await p.waitForTimeout(300);
  r.set = await modalState(p);
  await p.screenshot({ path: `${out}/settings-${G}.png` });
  await p.tap('#modal details.kdet summary');
  await p.waitForTimeout(300);
  r.set.scrollsExpanded = await p.$eval('#modal .mbody', e => e.scrollHeight > e.clientHeight);
  const bx = await p.$eval('#modal .mbody', e => {
    const q = e.getBoundingClientRect();
    return [q.left + q.width / 2, q.top + q.height * 0.8, q.top + q.height * 0.2];
  });
  await swipe(p, cdp, bx[0], bx[1], bx[2]);
  r.set.touchScrolled = await p.$eval('#modal .mbody', e => e.scrollTop > 0);
  await p.screenshot({ path: `${out}/settings-scrolled-${G}.png` });
  await p.tap('#modal .mx');
  await p.waitForTimeout(300);
  r.closeX = !(await p.$('#modal'));
  // outside tap
  await p.tap('#tmenu button[data-a="set"]');
  await p.waitForTimeout(300);
  await p.touchscreen.tap(w / 2, 4);
  await p.waitForTimeout(300);
  r.closeOutside = !(await p.$('#modal'));
  // Android Back
  await p.tap('#tmenu button[data-a="help"]');
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/help-${G}.png` });
  await p.goBack({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(500);
  r.closeBack = !(await p.$('#modal')) && (await p.evaluate(() => document.getElementById('tmenu')?.offsetHeight > 0));
  // reload
  await p.reload();
  await waitTitle(p);
  await p.waitForTimeout(800);
  r.reload = await titleState(p);
  await p.screenshot({ path: `${out}/title-reload-${G}.png` });
  // in game: ☰ pause menu
  await p.evaluate(() => window.__newGame());
  await p.waitForSelector('.ch', { state: 'visible' });
  await p.evaluate(() => {
    const box = document.getElementById('skipintro');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    document.querySelector('.ch[data-r="nurse"]').click();
  });
  await p.tap('#startgo');
  await p.waitForFunction(() => window.__game?.started?.() && !document.getElementById('wake'), null, {
    timeout: 900000,
    polling: 2000,
  });
  await p.waitForTimeout(2500);
  const pOpen = () => p.evaluate(() => !document.getElementById('pmenu')?.classList.contains('hidden'));
  await p.tap('#menubtn');
  await p.waitForTimeout(300);
  r.pause = await p.evaluate(vis => {
    const v = new Function('sel', `return (${vis})(sel)`);
    return {
      x: v('#pmenu .px'),
      allBtns: [...document.querySelectorAll('#pmenu button')].every(
        b => b.getBoundingClientRect().bottom <= innerHeight,
      ),
      inv: !!document.querySelector('#pmenu button[data-a="inv"]'),
    };
  }, vis.toString());
  await p.screenshot({ path: `${out}/pause-${G}.png` });
  await p.tap('#pmenu .px');
  await p.waitForTimeout(300);
  r.pause.closeX = !(await pOpen());
  await p.tap('#menubtn');
  await p.waitForTimeout(300);
  await p.touchscreen.tap(w / 2, h - 10);
  await p.waitForTimeout(300);
  r.pause.closeOutside = !(await pOpen());
  await p.tap('#menubtn');
  await p.waitForTimeout(300);
  await p.tap('#pmenu button[data-a="set"]');
  await p.waitForTimeout(300);
  r.pause.setOverPause = await modalState(p);
  await p.screenshot({ path: `${out}/pause-settings-${G}.png` });
  await p.goBack({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(500);
  r.pause.backClosesModalOnly = !(await p.$('#modal')) && (await pOpen());
  await p.goBack({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(500);
  r.pause.backClosesPause = !(await pOpen()) && (await p.evaluate(() => window.__game.started()));
  r.errs = errs;
  res[G] = r;
  await ctx.close();
}
console.log(JSON.stringify(res, null, 1));
await b.close();
