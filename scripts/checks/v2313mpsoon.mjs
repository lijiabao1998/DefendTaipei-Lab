// v23.1.3: 多人連線 shows as 即將開放 (dimmed, toast on tap); ?mpdebug=1 restores the old flow.
import { launch, gameUrl, preview } from '../lib.mjs';
const srv = process.env.URL ? null : await preview(4181);
const url = gameUrl(process.env.URL || srv.url);
const out = process.env.OUT || '/workspace/v2313';
const b = await launch();
const res = {};
for (const [name, ctxOpt] of [
  ['desktop', { viewport: { width: 1280, height: 720 } }],
  [
    'portrait',
    {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
    },
  ],
]) {
  const p = await (await b.newContext(ctxOpt)).newPage();
  const errs = [];
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url, { waitUntil: 'commit' });
  await p.waitForSelector('#tmenu button[data-a="mp"]', { timeout: 120000, state: 'attached' });
  const r = await p.evaluate(() => {
    const m = document.querySelector('#tmenu button[data-a="mp"]');
    const c = getComputedStyle(m);
    return {
      label: m.textContent,
      soon: m.classList.contains('soon'),
      opacity: c.opacity,
      overflow: m.scrollWidth > m.clientWidth + 1 || m.getBoundingClientRect().right > innerWidth,
    };
  });
  await p.evaluate(() => document.querySelector('#tmenu button[data-a="mp"]').click());
  await p.waitForTimeout(400);
  r.toast = await p.evaluate(() => {
    const t = document.getElementById('soontoast');
    return t && t.classList.contains('on') ? t.textContent : null;
  });
  r.stillTitle = await p.evaluate(() => !document.body.classList.contains('selmode'));
  // keep the toast up for the screenshot (headless capture can take longer than its 2.2 s life)
  await p.evaluate(() => clearTimeout(document.getElementById('soontoast')._t));
  await p.screenshot({ path: `${out}/${name}.png` });
  await p.context().close();
  const q = await (await b.newContext(ctxOpt)).newPage();
  await q.goto(url + (url.includes('?') ? '&' : '?') + 'mpdebug=1', { waitUntil: 'commit' });
  await q.waitForSelector('#tmenu button[data-a="mp"]', { timeout: 120000, state: 'attached' });
  await q.evaluate(() => document.querySelector('#tmenu button[data-a="mp"]').click());
  await q.waitForTimeout(400);
  r.debug = await q.evaluate(() => ({
    label: document.querySelector('#tmenu button[data-a="mp"]').textContent,
    selmode: document.body.classList.contains('selmode'),
    mpsel: getComputedStyle(document.getElementById('mpsel')).display !== 'none',
  }));
  await q.context().close();
  r.errs = errs;
  res[name] = r;
}
console.log(JSON.stringify(res, null, 1));
await b.close();
srv?.stop();
