import { launch, shot, gameUrl } from '../lib.mjs';
const url = gameUrl(process.argv[2]);
const errs = [];
const out = {};
const S = n => shot(`v20-mp-${n}.png`);
const b = await launch();
const mk = async (q, n) => {
  const ctx = await b.newContext({ viewport: { width: 1100, height: 700 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(n + ':' + String(e)));
  await p.goto(url + q);
  await p.waitForFunction(() => window.__newGame, null, { timeout: 600000, polling: 500 });
  await p.evaluate(() => window.__newGame());
  await p.waitForSelector('.ch', { state: 'visible', timeout: 600000 });
  return p;
};
const a = await mk('', 'A');
await a.click('#skipintro');
await a.$eval('#mpnew', e => e.click());
await a.waitForFunction(() => /已建立/.test(document.getElementById('mpmsg').textContent), null, { timeout: 60000 });
const code = await a.inputValue('#mpcode');
out.code = code;
await a.screenshot({ path: S('1-lobby'), timeout: 120000 });
await a.evaluate(`document.querySelector('.ch[data-r="courier"]').click()`);
const bb = await mk('?room=' + code, 'B');
await bb.click('#skipintro');
await bb.evaluate(`window.__selG('f')`);
await bb.evaluate(`document.querySelector('.ch[data-r="nurse"]').click()`);
for (const p of [a, bb]) await p.waitForFunction(() => window.__game?.net?.s, null, { timeout: 600000, polling: 2000 });
const pa = await a.evaluate(`[window.__game.player.pos.x, window.__game.player.pos.z]`);
await bb.evaluate(`window.__game.player.pos.set(${pa[0] + 2.5},0,${pa[1] + 1})`);
await a.waitForTimeout(8000);
out.A = await a.evaluate(
  `(()=>{const n=window.__game.net;return {you:n.you,players:Object.values(n.s.players).map(p=>[p.name,p.role,+p.x.toFixed(1),+p.z.toFixed(1),p.on]),enemies:n.s.enemies.length,tick:n.s.tick,hud:document.getElementById('mphud').textContent}})()`,
);
out.B = await bb.evaluate(
  `(()=>{const n=window.__game.net;return {players:Object.keys(n.s.players).length,tick:n.s.tick,rejects:n.rejects}})()`,
);
await a.screenshot({ path: S('2-playerA-sees-B'), timeout: 120000 });
await bb.screenshot({ path: S('3-playerB-sees-A'), timeout: 120000 });
// speed hack from B -> server clamps & corrects
await bb.evaluate(`window.__game.net.cmd({t:'move',x:${pa[0] + 200},z:${pa[1]}})`);
await bb.waitForTimeout(3000);
out.hack = await bb.evaluate(`({rejects:window.__game.net.rejects})`);
// reconnect: drop B's socket
await bb.evaluate(`window.__game.net.ws.close()`);
await bb.waitForTimeout(1500);
out.drop = await bb.evaluate(`window.__game.net.status`);
await bb.waitForFunction(() => /^房間/.test(window.__game.net.status), null, { timeout: 120000, polling: 1000 });
out.reconnected = await bb.evaluate(`window.__game.net.status`);
await bb.screenshot({ path: S('4-reconnected'), timeout: 120000 });
console.log(JSON.stringify(out, null, 1));
console.log('errs', errs);
await b.close();
