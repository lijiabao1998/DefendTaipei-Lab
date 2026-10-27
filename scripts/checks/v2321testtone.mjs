// v23.2.1: alert kind 'test' plays the short test chime, not the 萬安 siren; bare/'alert'/'clear' unchanged.
import { launch, preview, pickRole, gameUrl } from '../lib.mjs';
const srv = process.env.URL ? null : await preview(4182);
const url = gameUrl(process.env.URL || srv.url);
const b = await launch();
const ctx = await b.newContext();
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto(url, { waitUntil: 'commit' });
await pickRole(page, { g: 'f' });
await page.waitForFunction(() => window.__game?.audio, null, { timeout: 600000, polling: 1000 });
const r = await page.evaluate(async () => {
  const g = window.__game;
  await g.audioFx.sfxCtx()?.resume();
  const st = () => ({ test: g.audio().alertTest || 0, sirens: g.radio().bc.sirens });
  const a = st();
  g.siren('test');
  const b = st();
  g.siren('alert');
  const c = st();
  return { start: a, afterTest: b, afterAlert: c };
});
const ok =
  r.afterTest.test === r.start.test + 1 &&
  r.afterTest.sirens === r.start.sirens &&
  r.afterAlert.sirens === r.start.sirens + 1;
console.log(JSON.stringify({ ...r, errs, ok }, null, 1));
await ctx.close();
await b.close();
srv?.stop();
process.exit(ok && !errs.length ? 0 : 1);
