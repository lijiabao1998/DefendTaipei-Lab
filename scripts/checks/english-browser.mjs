// Actual Chromium UI regression. Build first: npm run build
// Run: node scripts/checks/english-browser.mjs
// URL, PW_CHROMIUM and SHOTS_DIR follow scripts/lib.mjs. Mobile is Chromium
// viewport/touch emulation, NOT an actual phone or Safari verification.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, shot, pickRole, preview } from '../lib.mjs';

let server;
let browser;
const results = { status: 'running', engine: 'Chromium', mobile: 'viewport/touch emulation', cases: [] };
const errors = [];
const timeout = Number(process.env.ENGLISH_TIMEOUT_MS || 600000);
async function ready(page) {
  await page.waitForFunction(() => typeof window.__newGame === 'function', null, { timeout, polling: 500 });
}
async function capture(page, name) {
  const path = shot(`english-${name}.png`);
  await page.screenshot({ path, timeout: 120000 });
  return path;
}
async function exercise(options, name) {
  const context = await browser.newContext(options);
  // Software WebGL is very slow on CI. Low graphics keeps this language/layout
  // check responsive without bypassing the real controls or locale defaults.
  await context.addInitScript(() => {
    if (!localStorage.getItem('dt.settings')) localStorage.setItem('dt.settings', JSON.stringify({ quality: 'low' }));
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const record = { name, graphicsQuality: 'low', viewport: options.viewport, screenshots: [], status: 'running' };
  results.cases.push(record);
  page.on('pageerror', error => errors.push(`${name}: ${error}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`${name}: ${message.text()}`);
  });
  try {
    await page.goto(process.env.URL || server.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await ready(page);
    assert.equal(
      await page.locator('html').getAttribute('lang'),
      'zh-Hant',
      'fresh context defaults to Traditional Chinese',
    );
    const language = page.locator('#title-language');
    await language.waitFor({ state: 'visible' });
    assert.equal(await language.inputValue(), 'zh-TW');
    assert.equal(await language.locator('option[value="en"]').textContent(), 'English');
    assert.equal(await language.locator('option[value="en"]').isEnabled(), true);

    // Exercise a real select change and native confirmation, not a storage shortcut.
    const navigation = page.waitForEvent('framenavigated', {
      predicate: frame => frame === page.mainFrame(),
      timeout: 120000,
    });
    const dialogHandled = new Promise((resolve, reject) => {
      page.once('dialog', dialog => {
        if (dialog.type() !== 'confirm') {
          dialog.dismiss().then(() => reject(new Error(`Unexpected ${dialog.type()} dialog`)), reject);
          return;
        }
        dialog.accept().then(resolve, reject);
      });
    });
    await Promise.all([navigation, dialogHandled, language.selectOption('en')]);
    await ready(page);
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await page.locator('#title-language').inputValue(), 'en');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dt.settings')).lang), 'en');
    assert.equal((await page.locator('#title h1').innerText()).trim(), 'Defend Taipei');
    assert.equal((await page.locator('#tmenu [data-a="new"]').innerText()).trim(), 'New game');
    assert.equal((await page.locator('#tmenu [data-a="set"]').innerText()).trim(), 'Settings');
    record.screenshots.push(await capture(page, `${name}-title`));

    await page.locator('#tmenu [data-a="set"]').click();
    await page.locator('#modal').waitFor({ state: 'visible' });
    assert.match(await page.locator('#modal h3').innerText(), /Settings/);
    assert.equal(await page.locator('#slang').inputValue(), 'en');
    record.screenshots.push(await capture(page, `${name}-settings`));
    // Touch UI intentionally collapses external keyboard bindings. Exercise its
    // visible disclosure before asserting text inside it.
    if (options.hasTouch) await page.locator('#modal .kdet > summary').click();
    assert.match(await page.locator('#kmsg').innerText(), /Click a binding/);
    assert.match(await page.locator('#klist').innerText(), /Move forward/);
    if (options.hasTouch) record.screenshots.push(await capture(page, `${name}-settings-keyboard`));
    await page.locator('#modal .mx').click();
    await page.locator('#modal').waitFor({ state: 'detached' });

    await pickRole(page, { g: 'f', role: 'nurse', skipIntro: true });
    await page.waitForFunction(() => window.__game?.started?.() && !document.getElementById('wake'), null, {
      timeout,
      polling: 500,
    });
    await page.waitForFunction(() => document.getElementById('stats')?.textContent.includes('Health'), null, {
      timeout,
    });
    const hud = await page.locator('#stats').innerText();
    assert.match(hud, /Health/);
    assert.doesNotMatch(hud, /生命|飢餓|口渴|精神/);
    record.hud = hud;
    if (options.hasTouch) {
      record.touchLabels = await page.evaluate(() =>
        ['pbact', 'pbsec'].map(id => {
          const button = document.getElementById(id);
          const range = document.createRange();
          range.selectNodeContents(button);
          const text = range.getBoundingClientRect();
          const box = button.getBoundingClientRect();
          return {
            id,
            label: button.textContent,
            textWidth: text.width,
            textHeight: text.height,
            width: box.width,
            height: box.height,
          };
        }),
      );
      for (const label of record.touchLabels) {
        assert.ok(label.textWidth <= label.width - 8, `${label.id} label fits horizontally`);
        assert.ok(label.textHeight <= label.height - 8, `${label.id} label fits vertically`);
      }
    }
    record.screenshots.push(await capture(page, `${name}-hud`));
    if (options.hasTouch) {
      await page.locator('#menubtn').tap();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.locator('#pmenu').waitFor({ state: 'visible' });
    assert.match(await page.locator('#pmenu .phead').innerText(), /Paused/);
    assert.equal((await page.locator('#pmenu [data-a="set"]').innerText()).trim(), 'Settings');
    assert.equal((await page.locator('#pmenu [data-a="inv"]').innerText()).trim(), 'Inventory');
    record.screenshots.push(await capture(page, `${name}-pause`));
    record.status = 'passed';
  } catch (error) {
    record.status = 'failed';
    record.error = String(error.stack || error);
    await capture(page, `${name}-failure`)
      .then(path => record.screenshots.push(path))
      .catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}
try {
  if (!process.env.URL) server = await preview(4187);
  browser = await launch();
  await exercise({ viewport: { width: 1280, height: 800 } }, 'desktop');
  await exercise({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, 'mobile');
  assert.deepEqual(errors, [], 'no page or console errors');
  results.status = 'passed';
  console.log('English Chromium UI checks passed (desktop + emulated mobile).');
} catch (error) {
  results.status = 'failed';
  results.error = String(error.stack || error);
  console.error(results.error);
  process.exitCode = 1;
} finally {
  results.errors = errors;
  await browser?.close();
  server?.stop();
  fs.writeFileSync(shot('english-results.json'), JSON.stringify(results, null, 2) + '\n');
}
