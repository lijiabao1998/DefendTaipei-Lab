// Dedicated story-debug integration check. Does not claim complete playable story.
import assert from 'node:assert/strict';
import { launch, preview, pickRole, shot } from '../lib.mjs';
const srv = process.env.URL ? null : await preview(4183);
const base = process.env.URL || srv.url;
let browser;
try {
  browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const ready = () => page.waitForFunction(() => window.__game?.save, null, { timeout: 600000 });
  await page.goto(base + '?storydebug=1', { waitUntil: 'commit' });
  await ready();
  await pickRole(page, { g: 'f' });
  await page.waitForFunction(() => window.__game.started());
  const fired = await page.evaluate(() => window.__game.storyEvent('act1_siren_test'));
  assert.deepEqual(fired, { fired: true, saved: true });
  const progress = () => page.evaluate(() => JSON.parse(localStorage.getItem('defendtaipei-save-v1'))?.story);
  assert.deepEqual(await progress(), ['act1_siren_test']);
  await page.screenshot({ path: shot('story-debug-fired.png') });
  await page.evaluate(() => sessionStorage.setItem('dt.autoload', '1'));
  await page.reload({ waitUntil: 'commit' });
  await ready();
  await page.waitForFunction(() => window.__game.started());
  assert.equal((await page.evaluate(() => window.__game.storyEvent('act1_siren_test'))).fired, false);
  await page.screenshot({ path: shot('story-debug-restored-no-replay.png') });
  await page.evaluate(() => sessionStorage.setItem('dt.autoload', '1'));
  await page.goto(base, { waitUntil: 'commit' });
  await ready();
  await page.waitForFunction(() => window.__game.started());
  assert.equal(await page.evaluate(() => 'storyEvent' in window.__game), false);
  await page.evaluate(() => window.__game.save());
  assert.deepEqual(await progress(), ['act1_siren_test']);
  await page.screenshot({ path: shot('story-flag-off-preserves-save.png') });
  await page.evaluate(() => sessionStorage.setItem('dt.autoload', '1'));
  await page.goto(base + '?storydebug=1', { waitUntil: 'commit' });
  await ready();
  await page.waitForFunction(() => window.__game.started());
  // Use existing game new-session entry, not a synthetic storage replacement.
  await page.evaluate(() => window.__game.go(false, 'f', 'nurse', true));
  assert.deepEqual(await page.evaluate(() => window.__game.storyEvent('act1_siren_test')), {
    fired: true,
    saved: true,
  });
  await page.screenshot({ path: shot('story-new-game-independent-progress.png') });
  await page.evaluate(() => {
    // update applies passive regeneration before its death check; use a genuine lethal state.
    window.__game.player.hp = -1;
    window.__game.player.bleed = true;
  });
  await page.waitForFunction(() => document.getElementById('title')?.textContent?.includes('你陣亡了'), null, {
    timeout: 30000,
  });
  assert.equal(await page.evaluate(() => localStorage.getItem('defendtaipei-save-v1')), null);
  await page.screenshot({ path: shot('story-death-clears-save.png') });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        'manual event save',
        'reload no replay',
        'flag-off preservation',
        'new-game reset',
        'death save removal',
      ],
      errors,
    }),
  );
} finally {
  await browser?.close();
  srv?.stop();
}
