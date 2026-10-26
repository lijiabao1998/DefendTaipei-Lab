// v22.4 title menu → settings / controls → role select; in game Esc closes the map first, then opens the pause
// menu; key rebinding swaps duplicates and the prompts follow the bound key; portrait ☰ opens the same pause menu.
// argv: url outDir
import { launch, pickRole } from '../lib.mjs';
const [url, out] = process.argv.slice(2);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
const shot = n => p.screenshot({ path: `${out}/${n}.png`, timeout: 120000 });
const vis = sel =>
  p.evaluate(s => {
    const e = document.querySelector(s);
    return (
      !!e &&
      e.getBoundingClientRect().width > 0 &&
      getComputedStyle(e).display !== 'none' &&
      !e.classList.contains('hidden')
    );
  }, sel);
await p.goto(url);
await p.waitForFunction(() => window.__newGame, null, { timeout: 600000, polling: 500 });
const R = {};
R.title = await p.evaluate(() => [...document.querySelectorAll('#tmenu button')].map(b => b.textContent));
R.cardsHidden = !(await vis('.ch'));
await shot('title');
await p.click('#tmenu button[data-a="set"]');
await p.click('#klist button[data-a="interact"]');
await p.keyboard.press('KeyQ'); // Q = 推開 → swapped onto E
R.swap = await p.evaluate(() => JSON.parse(localStorage.getItem('dt.keys')));
R.kmsg = await p.textContent('#kmsg');
await shot('settings');
await p.keyboard.press('Escape');
R.settingsClosed = !(await vis('#modal'));
await p.click('#tmenu button[data-a="help"]');
await shot('controls');
await p.keyboard.press('Escape');
await pickRole(p, { g: 'f', role: 'nurse', skipIntro: true });
await p.waitForFunction(() => window.__game?.started?.() && !document.getElementById('wake'), null, {
  timeout: 900000,
  polling: 2000,
});
await p.waitForTimeout(1500);
R.prompt = await p.evaluate(() => document.getElementById('prompt').textContent);
await p.keyboard.press('KeyM');
await p.waitForTimeout(400);
R.mapOpen = await p.evaluate(() => window.__game.map.open);
await p.keyboard.press('Escape');
await p.waitForTimeout(300);
R.mapClosedByEsc = !(await p.evaluate(() => window.__game.map.open));
R.pauseAfterMapEsc = await vis('#pmenu');
await p.keyboard.press('Escape');
await p.waitForTimeout(300);
R.pause = await vis('#pmenu');
await shot('pause');
await p.click('#pmenu button[data-a="set"]');
await p.click('#kreset');
R.reset = await p.evaluate(() => JSON.parse(localStorage.getItem('dt.keys')).interact);
await p.keyboard.press('Escape');
R.pauseStillOpen = await vis('#pmenu');
await p.keyboard.press('Escape');
R.resumed = !(await vis('#pmenu'));
R.errs = errs;
// portrait phone
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148',
});
const m = await ctx.newPage();
m.on('pageerror', e => errs.push(String(e)));
await m.goto(url);
await m.waitForFunction(() => window.__newGame, null, { timeout: 600000, polling: 500 });
await m.waitForTimeout(500);
await m.screenshot({ path: `${out}/mobile-title.png` });
R.mStartbarHidden = await m.evaluate(() => getComputedStyle(document.getElementById('startbar')).display === 'none');
await m.tap('#tmenu button[data-a="new"]');
await m.waitForTimeout(300);
R.mStartbarShown = await m.evaluate(() => getComputedStyle(document.getElementById('startbar')).display !== 'none');
await m.evaluate(() => {
  const x = document.getElementById('skipintro');
  x.checked = true;
  x.dispatchEvent(new Event('change'));
  document.querySelector('.ch[data-r="nurse"]').click();
});
await m.tap('#startgo');
await m.waitForFunction(() => window.__game?.started?.() && !document.getElementById('wake'), null, {
  timeout: 900000,
  polling: 2000,
});
await m.waitForTimeout(2000);
await m.tap('#menubtn');
await m.waitForTimeout(300);
R.mPause = await m.evaluate(() => !document.getElementById('pmenu').classList.contains('hidden'));
await m.screenshot({ path: `${out}/mobile-pause.png` });
await m.tap('#pmenu button[data-a="set"]');
await m.waitForTimeout(300);
await m.screenshot({ path: `${out}/mobile-settings.png` });
console.log(JSON.stringify(R, null, 1));
await b.close();
