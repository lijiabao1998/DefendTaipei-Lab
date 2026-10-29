// Student perk 「體力恢復快」: while sleeping, fatigue (the 精神 bar) recovers 1.5x as fast as for other roles;
// awake fatigue gain is unchanged. Runs the real game loop (window.__game.sim) for an office worker and a student.
import assert from 'node:assert/strict';
import { launch, preview, pickRole } from '../lib.mjs';

const srv = process.env.URL ? null : await preview(4186);
const base = process.env.URL || srv.url;
let browser;
try {
  browser = await launch();
  const measure = async role => {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(base, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__game?.save, null, { timeout: 600000 });
    await pickRole(page, { g: 'm', role });
    await page.waitForFunction(() => window.__game.started(), null, { timeout: 600000 });
    const r = await page.evaluate(() => {
      const g = window.__game;
      // keep soldiers from waking the sleeper; this only isolates the fatigue formula
      for (const s of g.sols) {
        s.state = 'dead';
        s.mesh.visible = false;
      }
      const p = g.player;
      p.fatigue = 80;
      p.sleeping = true;
      g.sim(100, 0.05);
      const asleep = { drop: 80 - p.fatigue, stillAsleep: p.sleeping };
      p.sleeping = false;
      p.fatigue = 20;
      g.sim(100, 0.05);
      return { role: g.role().id, rest: g.role().skills.rest ?? 1, ...asleep, awakeGain: p.fatigue - 20 };
    });
    await ctx.close();
    return { ...r, errors };
  };
  const office = await measure('office');
  const student = await measure('student');
  console.log(JSON.stringify({ office, student }));
  for (const r of [office, student]) {
    assert.deepEqual(r.errors, [], `${r.role}: page errors`);
    assert.ok(r.stillAsleep, `${r.role}: woke up during the measurement`);
    assert.ok(r.drop > 1, `${r.role}: fatigue should drop while sleeping`);
  }
  assert.equal(office.rest, 1);
  assert.equal(student.rest, 1.5);
  const ratio = student.drop / office.drop;
  assert.ok(Math.abs(ratio - 1.5) < 0.01, `student sleep recovery should be 1.5x, got ${ratio.toFixed(3)}x`);
  assert.ok(Math.abs(student.awakeGain - office.awakeGain) < 1e-6, 'awake fatigue gain must not change');
  console.log(JSON.stringify({ ok: true, ratio: +ratio.toFixed(3) }));
} finally {
  await browser?.close();
  srv?.stop();
}
