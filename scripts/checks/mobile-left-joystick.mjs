// Real Chromium gameplay + pointer input; viewport/touch emulation, not a physical phone.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, preview, pickRole, shot } from '../lib.mjs';
const server = process.env.URL ? null : await preview(4183);
let browser;
const results = [];
const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
try {
  browser = await launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => localStorage.setItem('dt.settings', JSON.stringify({ quality: 'low' })));
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(process.env.URL || server.url);
  await pickRole(page, { skipIntro: false });
  // The prologue skip button must not collide with the newly-left thumb control.
  for (const [width, height] of [
    [390, 844],
    [360, 640],
    [320, 568],
    [844, 390],
    [667, 375],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    const joy = await page.locator('#joy').boundingBox();
    assert.ok(joy, 'joystick visible');
    assert.ok(joy.x >= 20 && joy.x + joy.width < width / 2, 'joystick in left half');
    assert.ok(joy.y > height / 2 && joy.y + joy.height <= height - 28, 'lower screen with bottom clearance');
    for (const id of ['skipbtn', 'pbact', 'pbsec', 'equip']) {
      if (await page.locator(`#${id}`).isVisible()) {
        assert.equal(overlap(joy, await page.locator(`#${id}`).boundingBox()), false, `no overlap with ${id}`);
      }
    }
    const screenshot = shot(`joystick-${width}x${height}.png`);
    await page.screenshot({ path: screenshot, timeout: 120000 });
    results.push({ width, height, joy, screenshot });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#skipbtn').click();
  await page.waitForFunction(() => !window.__game.PRO.on);
  const joy = await page.locator('#joy').boundingBox();
  const x = joy.x + joy.width / 2,
    y = joy.y + joy.height / 2;
  const pos = () => page.evaluate(() => [window.__game.player.pos.x, window.__game.player.pos.z]);
  const before = await pos();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 70, { steps: 8 });
  await page.waitForTimeout(1800);
  const moving = await pos();
  assert.ok(Math.hypot(moving[0] - before[0], moving[1] - before[1]) > 0.1, 'real pointer drag moves player');
  assert.notEqual(await page.locator('#joyk').evaluate(e => e.style.transform), '', 'knob follows drag');
  await page.mouse.up();
  assert.equal(await page.locator('#joyk').evaluate(e => e.style.transform), '', 'release recentres knob');
  // A new drag uses the post-rotation bounding box; cancellation also releases input.
  await page.setViewportSize({ width: 844, height: 390 });
  const rotated = await page.locator('#joy').boundingBox();
  await page.mouse.move(rotated.x + rotated.width / 2, rotated.y + rotated.height / 2);
  await page.mouse.down();
  await page.mouse.move(rotated.x + rotated.width / 2 + 25, rotated.y + rotated.height / 2);
  assert.notEqual(await page.locator('#joyk').evaluate(e => e.style.transform), '', 'rotated control still responds');
  await page.locator('#joy').dispatchEvent('pointercancel', { pointerId: 1 });
  assert.equal(await page.locator('#joyk').evaluate(e => e.style.transform), '', 'cancel recentres knob');
  await page.mouse.up();
  assert.deepEqual(errors, [], 'no page errors');
  await context.close();
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await desktop.goto(process.env.URL || server.url);
  await desktop.waitForSelector('#joy', { state: 'attached' });
  assert.equal(await desktop.locator('#joy').isVisible(), false, 'desktop joystick remains hidden');
  console.log('PASS mobile left joystick: 5 sizes, prologue skip, movement, release, rotation, cancel, desktop');
} finally {
  fs.writeFileSync(shot('joystick-results.json'), JSON.stringify(results, null, 2));
  await browser?.close();
  server?.stop();
}
