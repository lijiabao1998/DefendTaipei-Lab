// v23.1 radio: tap-to-expand card (portrait + desktop), 收音機紀錄 in the pause menu (persisted in the save),
// broadcast voice pipeline + radio bed, 萬安 siren pattern. argv: url outDir
import { launch } from '../lib.mjs';
import fs from 'node:fs';
const [url = 'http://localhost:4173/defendtaipei/', out = 'shots/v231'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await launch();
const R = {};
const W = '📻 北廣 AM765（北都廣播電台）',
  M = '…佔領當局宣稱「水電維持正常供應」，但多處變電所已遭接管。市民請自備飲水，夜間避免外出，並留意後續廣播。';
for (const [name, vp, mob] of [
  ['portrait', { width: 412, height: 915 }, true],
  ['desktop', { width: 1280, height: 720 }, false],
]) {
  const ctx = await b.newContext({ viewport: vp, isMobile: mob, hasTouch: mob, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url);
  await p.waitForFunction(() => window.__newGame, null, { timeout: 180000 });
  await p.evaluate(() => window.__newGame());
  await p.waitForSelector('.ch', { state: 'visible', timeout: 180000 });
  await p.evaluate(() => {
    const s = document.getElementById('skipintro');
    if (s) s.checked = true;
  });
  await p.click('.ch[data-r="nurse"]');
  await p.evaluate(() => document.getElementById('startgo')?.click());
  await p.waitForFunction(() => window.__game?.started?.(), null, { timeout: 180000 });
  await p.evaluate(() => window.__game.endPrologue?.());
  await p.waitForTimeout(1500);
  await p.evaluate(([w, m]) => window.__game.phone(w, m), [W, M]);
  await p.waitForTimeout(900);
  const h0 = await p.evaluate(() => document.getElementById('phone').getBoundingClientRect().height);
  await p.screenshot({ path: `${out}/${name}_card.png` });
  if (mob) await p.tap('#phone');
  else {
    const r = await p.evaluate(() => {
      const q = document.getElementById('phone').getBoundingClientRect();
      return [q.left + q.width / 2, q.top + q.height / 2];
    });
    await p.mouse.click(r[0], r[1]);
  }
  await p.waitForTimeout(500);
  const st = await p.evaluate(() => ({
    exp: document.getElementById('phone').classList.contains('exp'),
    h: document.getElementById('phone').getBoundingClientRect().height,
  }));
  await p.screenshot({ path: `${out}/${name}_expanded.png` });
  if (mob) await p.tap('#phone');
  else {
    const r = await p.evaluate(() => {
      const q = document.getElementById('phone').getBoundingClientRect();
      return [q.left + q.width / 2, q.top + q.height / 2];
    });
    await p.mouse.click(r[0], r[1]);
  }
  await p.waitForTimeout(400);
  const col = await p.evaluate(() => document.getElementById('phone').classList.contains('exp'));
  const r = await p.evaluate(() => window.__game.radio());
  R[name] = {
    h0: Math.round(h0),
    expanded: st.exp,
    hExp: Math.round(st.h),
    collapsedAgain: !col,
    log: r.log.length,
    bc: r.bc,
    errs,
  };
  if (!mob) {
    // pause menu → 收音機紀錄, save → reload → log restored
    await p.evaluate(([w]) => window.__game.phone(w, '…第二則測試廣播：請市民遠離河岸。'), [W]);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(600);
    await p.click('#pmenu button[data-a="rlog"]');
    await p.waitForTimeout(600);
    R.menuRows = await p.evaluate(() => document.querySelectorAll('#modal .rl').length);
    R.menuFirst = await p.evaluate(() => document.querySelector('#modal .rl')?.textContent);
    await p.screenshot({ path: `${out}/radio_log.png` });
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    await p.evaluate(() => window.__game.save?.() ?? document.querySelector('#pmenu button[data-a="save"]')?.click());
    // siren: alert pattern scheduled, then indoor muffle
    await p.evaluate(() => window.__game.siren('alert'));
    await p.waitForTimeout(800);
    R.siren = await p.evaluate(() => window.__game.radio().siren);
    await p.evaluate(() => window.__game.siren('clear'));
    R.sirenAfterClear = await p.evaluate(() => window.__game.radio().bc.sirens);
    // settings has 廣播 slider + 廣播語音 toggle
    await p.keyboard.press('Escape');
    await p.waitForTimeout(500);
    await p.evaluate(() => document.querySelector('#pmenu button[data-a="set"]').click());
    await p.waitForTimeout(500);
    R.settings = await p.evaluate(() => ({
      slider: !!document.querySelector('#modal input[data-k="radio"]'),
      voice: !!document.querySelector('#modal #svoice'),
    }));
    await p.screenshot({ path: `${out}/settings.png` });
    R.saved = await p.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem('dt.save') ||
            localStorage.getItem(Object.keys(localStorage).find(k => /save/i.test(k) && k !== 'dt.settings')) ||
            '{}',
        ).radio?.length,
    );
  }
  await ctx.close();
}
console.log(JSON.stringify(R, null, 1));
await b.close();
