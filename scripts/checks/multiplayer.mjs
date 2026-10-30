// Real WebSocket transport through the actual Worker, in isolated browser contexts.
// Requires Vite :5173 and wrangler dev :8787. No fetch/WebSocket mocking.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { pickRole, shot } from '../lib.mjs';
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }),
  ]);
  const pages = await Promise.all(contexts.map(c => c.newPage()));
  for (const p of pages) {
    p.on('console', m => {
      if (m.type() === 'error') console.error('browser:', m.text());
    });
    p.on('pageerror', e => console.error('pageerror:', e.message));
    p.on('requestfailed', r => console.error('requestfailed:', r.url(), r.failure()));
    await p.goto('http://localhost:5173/defendtaipei/scripts/checks/mp-transport.html');
    await p.evaluate(async () => {
      const { Net } = await import('/defendtaipei/src/net/net.ts');
      window.net = new Net('http://localhost:8787');
    });
  }
  const code = await pages[0].evaluate(() => net.create());
  for (let i = 0; i < 2; i++)
    await pages[i].evaluate(
      async ({ code, i }) => net.join(code, { name: 'Client ' + i, role: 'courier', g: 'm', x: i, z: 0 }),
      { code, i },
    );
  for (const p of pages)
    await p.waitForFunction(() => net.s && Object.values(net.s.players).filter(p => p.on).length === 2);
  const ids = await Promise.all(pages.map(p => p.evaluate(() => net.you)));
  assert.notEqual(ids[0], ids[1]);
  await pages[0].evaluate(() => net.cmd({ t: 'move', x: 0.3, z: 0 }));
  await pages[1].waitForFunction(id => Math.abs(net.s.players[id].x - 0.3) < 0.001, ids[0]);
  await pages[1].evaluate(() => net.cmd({ t: 'move', x: 1.3, z: 0 }));
  await pages[0].waitForFunction(id => Math.abs(net.s.players[id].x - 1.3) < 0.001, ids[1]);
  await pages[0].evaluate(() => net.ws.close());
  await pages[0].waitForFunction(() => net.ws?.readyState === 1 && net.tries === 0);
  await pages[0].evaluate(() => net.cmd({ t: 'move', x: 0.4, z: 0 }));
  await pages[1].waitForFunction(id => Math.abs(net.s.players[id].x - 0.4) < 0.001, ids[0]);
  // Progress protection checks exercise the actual storage module, not a mock implementation.
  await pages[0].evaluate(async () => {
    const s = await import('/defendtaipei/src/systems/save.ts');
    const keys = [s.GAME_SAVE_KEY, s.DISTRICT_TILES_KEY, s.ROAD_TILES_KEY, s.MAP_SAVE_KEY];
    keys.forEach(k => localStorage.setItem(k, 'sentinel'));
    s.setMultiplayerSession(true);
    s.clearSave();
    s.clearRoadTiles();
    s.writeSave({});
    s.writeDistrictTiles({});
    s.writeRoadTiles({});
    s.writeMapSave({ n: [], f: '' });
    if (keys.some(k => localStorage.getItem(k) !== 'sentinel')) throw Error('Single-player progress modified');
  });
  await pages[0].evaluate(() => net.leave());
  await pages[1].waitForFunction(id => !net.s.players[id]?.on, ids[0]);
  await pages[1].evaluate(() => net.leave());
  // Now load the actual desktop + phone game UIs (same independent contexts).
  const gameCode = await pages[1].evaluate(() => net.create());
  for (const p of pages)
    await p.evaluate(() => localStorage.setItem('dt.settings', JSON.stringify({ quality: 'low' })));
  console.log('Transport movement/reconnect/save protection passed; loading two real game clients at low quality.');
  for (const p of pages) {
    await p.goto(`http://localhost:5173/defendtaipei/?mp=http://localhost:8787&room=${gameCode}`);
    await pickRole(p, { g: 'm', role: 'courier', skipIntro: true });
  }
  for (const p of pages)
    await p.waitForFunction(
      () => window.__game?.net?.s && Object.values(window.__game.net.s.players).filter(p => p.on).length === 2,
      null,
      { timeout: 120000 },
    );
  const gameIds = await Promise.all(pages.map(p => p.evaluate(() => window.__game.net.you)));
  for (const p of pages)
    await p.evaluate(() => {
      window.__game.addItem('hammer');
      window.__game.addItem('pipe');
      window.__game.useItem('hammer');
    });
  await pages[0].waitForFunction(id => window.__game.net.s.players[id].weapon === 'hammer', gameIds[1]);
  await pages[1].waitForFunction(id => window.__game.net.s.players[id].weapon === 'hammer', gameIds[0]);
  await pages[0].screenshot({ path: shot('multiplayer-desktop.png') });
  await pages[1].screenshot({ path: shot('multiplayer-phone.png') });
  await pages[1].locator('#equip').dispatchEvent('pointerdown');
  await pages[0].waitForFunction(id => window.__game.net.s.players[id].weapon === 'pipe', gameIds[1]);
  await pages[0].evaluate(() => window.__game.useItem('pipe'));
  await pages[1].waitForFunction(id => window.__game.net.s.players[id].weapon === 'pipe', gameIds[0]);
  await pages[1].locator('#mpleave').click();
  await pages[1].waitForURL('**/defendtaipei/');
  console.log(
    JSON.stringify({
      passed: true,
      code,
      isolatedClients: 2,
      bidirectionalMovement: true,
      reconnect: true,
      saveProtection: true,
      leave: true,
    }),
  );
} catch (error) {
  for (const [i, c] of browser.contexts().entries())
    for (const p of c.pages()) {
      await p.screenshot({ path: shot(`multiplayer-failure-${i}.png`) }).catch(() => {});
      console.error(
        'Client',
        i,
        await p
          .evaluate(() => ({
            url: location.href,
            status: (window.__game?.net || window.net)?.status,
            socket: (window.__game?.net || window.net)?.ws?.readyState,
            tries: (window.__game?.net || window.net)?.tries,
            hud: document.getElementById('mphud')?.textContent,
          }))
          .catch(() => null),
      );
    }
  throw error;
} finally {
  await browser.close();
}
