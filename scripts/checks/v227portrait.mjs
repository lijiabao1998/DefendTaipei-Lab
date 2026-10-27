// v22.7 portrait controls: 2 thumb buttons (context 打/搜/… + 蹲), weapon tap-swap, 🗺 beside ☰, nothing over the
// joystick, all in view, landscape keeps the old 🛡/🗺 buttons. argv: url outDir
import { launch } from '../lib.mjs';
const [url, out] = process.argv.slice(2);
const b = await launch();
const res = {};
const geo = () => {
  const r = id => {
    const e = document.getElementById(id);
    if (!e || getComputedStyle(e).display === 'none') return null;
    const x = e.getBoundingClientRect();
    return x.width ? { l: x.left, r: x.right, t: x.top, b: x.bottom } : null;
  };
  const ids = ['pbact', 'pbsec', 'equip', 'menubtn', 'pmapbtn', 'joy', 'pbhint', 'stats'];
  const g = Object.fromEntries(ids.map(i => [i, r(i)]));
  const ov = (a, c) => a && c && a.l < c.r && c.l < a.r && a.t < c.b && c.t < a.b;
  const bad = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) if (ov(g[ids[i]], g[ids[j]])) bad.push(ids[i] + '×' + ids[j]);
  const inView = ['pbact', 'pbsec', 'equip', 'menubtn', 'pmapbtn', 'joy'].every(
    i => g[i] && g[i].l >= 0 && g[i].r <= innerWidth && g[i].t >= 0 && g[i].b <= innerHeight,
  );
  return {
    overlaps: bad,
    inView,
    oldHidden: !r('coverbtn') && !r('mapbtn'),
    act: document.getElementById('pbact')?.textContent,
    sec: document.getElementById('pbsec')?.textContent,
    btns: document.querySelectorAll('.pbtn').length,
  };
};
const tapHold = async (p, sel, ms) => {
  const r = await p.$eval(sel, e => {
    const x = e.getBoundingClientRect();
    return [x.left + x.width / 2, x.top + x.height / 2];
  });
  await p.dispatchEvent(sel, 'pointerdown', { pointerId: 1, clientX: r[0], clientY: r[1], isPrimary: true });
  await p.waitForTimeout(ms);
  return r;
};
const up = (p, sel, x = 0, y = 0) => p.dispatchEvent(sel, 'pointerup', { pointerId: 1, clientX: x, clientY: y });
for (const [w, h] of [
  [390, 844],
  [412, 915],
  [360, 780],
].filter((_, i) => !process.env.ONE || i === +process.env.ONE - 1)) {
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
  await p.waitForTimeout(3000);
  const G = `${w}x${h}`;
  const r = { home: await p.evaluate(geo) };
  await p.screenshot({ path: `${out}/home-${G}.png` });
  // step out into the lane so nothing is interactable
  const P0 = await p.evaluate(() => [window.__game.player.pos.x, window.__game.player.pos.z]);
  for (const [dx, dz] of [
    [6, 0],
    [-6, 0],
    [0, 6],
    [0, -6],
    [10, 10],
    [-10, -10],
    [14, 0],
    [0, 14],
  ]) {
    const ok = await p.evaluate(
      ([x, z]) => !window.__game.inBld(x, z) && (window.__game.tp(x, z), true),
      [P0[0] + dx, P0[1] + dz],
    );
    if (!ok) continue;
    await p.waitForTimeout(500);
    if ((await p.evaluate(() => document.getElementById('pbact').textContent)) === '打') break;
  }
  r.idle = await p.evaluate(geo);
  await p.screenshot({ path: `${out}/idle-${G}.png` });
  // 蹲 tap → sneak (or cover), tap again → up
  await tapHold(p, '#pbsec', 80);
  await up(p, '#pbsec');
  await p.waitForTimeout(200);
  r.secOn = await p.evaluate(() => window.__game.pst());
  r.secLabel = await p.evaluate(() => document.getElementById('pbsec').textContent);
  await p.screenshot({ path: `${out}/crouch-${G}.png` });
  await tapHold(p, '#pbsec', 80);
  await up(p, '#pbsec');
  await p.waitForTimeout(100);
  r.secOff = await p.evaluate(() => window.__game.pst());
  // long-press 蹲 → 撤
  await tapHold(p, '#pbsec', 1200);
  r.retreat = (await p.evaluate(() => window.__game.pst())).rn > 0;
  await up(p, '#pbsec');
  // hold 打 → MB.fire
  await tapHold(p, '#pbact', 300);
  r.fireHeld = (await p.evaluate(() => window.__game.pst())).fire;
  await up(p, '#pbact');
  r.fireReleased = !(await p.evaluate(() => window.__game.pst())).fire;
  // weapon tap-swap
  await p.evaluate(() => (window.__game.addItem('knife', 1), window.__game.equipSet('')));
  await p.tap('#equip');
  await p.waitForTimeout(150);
  r.swap1 = (await p.evaluate(() => window.__game.pst())).eq;
  // context: stand at a container
  const c = await p.evaluate(() => window.__game.contNear());
  if (c) {
    await p.evaluate(([x, z]) => window.__game.tp(x + 0.6, z), c);
    await p.waitForTimeout(800);
    r.ctx = await p.evaluate(geo);
    r.ctxHint = await p.evaluate(() => document.getElementById('pbhint').textContent);
    await p.screenshot({ path: `${out}/context-${G}.png` });
  }
  // scoped rifle: label 瞄 → hold = scope on, drag aims, release fires
  await p.evaluate(() => {
    window.__game.tp(...(window.__game.contNear() || [0, 0]).map(v => v + 25));
    window.__game.addItem('t93', 1);
    window.__game.addItem('a762n', 10);
    window.__game.equipSet('t93');
  });
  await p.waitForTimeout(600);
  r.scopeLabel = await p.evaluate(() => document.getElementById('pbact').textContent);
  const ammo0 = (await p.evaluate(() => window.__game.pst())).ammo;
  const [x0, y0] = await tapHold(p, '#pbact', 200);
  r.scopeOn = (await p.evaluate(() => window.__game.pst())).scope;
  await p.dispatchEvent('#pbact', 'pointermove', { pointerId: 1, clientX: x0 - 40, clientY: y0 - 10 });
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/scope-${G}.png` });
  await up(p, '#pbact', x0 - 40, y0 - 10);
  await p.waitForTimeout(300);
  r.shotFired = (await p.evaluate(() => window.__game.pst())).ammo === ammo0 - 1;
  await tapHold(p, '#pbsec', 60);
  await up(p, '#pbsec');
  await p.waitForTimeout(200);
  r.scopeExit = !(await p.evaluate(() => window.__game.pst())).scope;
  await p.tap('#menubtn');
  await p.waitForTimeout(300);
  r.menuInv = await p.evaluate(() => !!document.querySelector('#pmenu button[data-a="inv"]'));
  await p.screenshot({ path: `${out}/menu-${G}.png` });
  r.errs = errs;
  res[G] = r;
  await ctx.close();
}
// landscape mobile unchanged: old buttons, no portrait ones
{
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto(url);
  await p.waitForFunction(() => window.__newGame, null, { timeout: 600000, polling: 500 });
  res.landscape = await p.evaluate(() => ({ portrait: document.body.classList.contains('portrait') }));
  await ctx.close();
}
console.log(JSON.stringify(res, null, 1));
await b.close();
