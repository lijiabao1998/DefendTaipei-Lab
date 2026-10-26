// v21.5.1 mobile portrait: role select fits (sticky 開始遊戲 bar on screen, no in-game buttons over it),
// then in game the 搜/打/撤 thumb buttons + ☰ menu are on screen and do not overlap the joystick.
// argv: url outDir
import { launch } from '../lib.mjs';
const [url, out] = process.argv.slice(2);
const b = await launch();
const res = {};
for (const [w, h] of [
  [390, 844],
  [412, 915],
]) {
  const ctx = await b.newContext({
    viewport: { width: w, height: h },
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148',
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url);
  await p.waitForFunction(() => window.__newGame, null, { timeout: 600000, polling: 500 });
  await p.evaluate(() => window.__newGame());
  await p.waitForSelector('.ch', { state: 'visible', timeout: 600000 });
  await p.waitForTimeout(800);
  const sel = await p.evaluate(() => {
    const r = e => e && e.getBoundingClientRect();
    const sb = r(document.getElementById('startgo'));
    const cb = document.getElementById('coverbtn');
    return {
      portrait: document.body.classList.contains('portrait'),
      startVisible: !!sb && sb.width > 0 && sb.bottom <= innerHeight && sb.top >= 0,
      cards: document.querySelectorAll('.ch').length,
      coverHidden: !cb || getComputedStyle(cb).display === 'none',
    };
  });
  await p.screenshot({ path: `${out}/select-${w}x${h}.png` });
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
  await p.waitForTimeout(4000);
  const game = await p.evaluate(() => {
    const r = e => e && e.getBoundingClientRect();
    const bs = [...document.querySelectorAll('.pbtn')].map(r);
    const j = r(document.getElementById('joy'));
    const ov = (a, c) => a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom;
    const m = r(document.getElementById('menubtn'));
    return {
      btns: bs.length,
      inView: bs.every(x => x.width > 50 && x.right <= innerWidth && x.bottom <= innerHeight && x.top >= 0),
      noJoyOverlap: bs.every(x => !ov(x, j)),
      menu: !!m && m.width > 0,
    };
  });
  // hold 打 for a moment, then 撤, then open ☰
  await p.evaluate(() => (window.__game.MB.fire = true));
  await p.waitForTimeout(600);
  await p.evaluate(() => (window.__game.MB.fire = false));
  await p.tap('.pbtn:nth-child(3)');
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/portrait-${w}x${h}.png` });
  await p.tap('#menubtn');
  await p.waitForTimeout(300);
  game.menuOpen = await p.evaluate(() => !document.getElementById('pmenu').classList.contains('hidden'));
  await p.screenshot({ path: `${out}/menu-${w}x${h}.png` });
  res[`${w}x${h}`] = { sel, game, errs };
  await ctx.close();
}
console.log(JSON.stringify(res));
await b.close();
