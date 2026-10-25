// Loot dropped by killed PLA soldiers: weapon + magazines with weighted rarity.
// The soldier type comes from the soldier id: 0 步槍兵 rifleman, 1 射手 marksman, 2 機槍手 machine gunner,
// 3 軍官 officer, 4 特戰 special forces.
function solType(id: number) {
  const r = (((Math.sin(id * 91.7 + 3.1) * 43758.5453) % 1) + 1) % 1;
  return r < 0.66 ? 0 : r < 0.78 ? 1 : r < 0.86 ? 2 : r < 0.94 ? 3 : 4;
}
export function plaDrop(id: number) {
  const t = solType(id),
    it: Record<string, number> = {};
  const R = Math.random,
    pk = (a: [string, number][]) => {
      let r = R() * a.reduce((s, x) => s + x[1], 0);
      for (const [k, w] of a) if ((r -= w) <= 0) return k;
      return a[0][0];
    };
  const add = (k: string, n = 1) => {
    if (n > 0) it[k] = (it[k] || 0) + n;
  };
  if (t === 0) {
    if (R() < 0.35)
      add(
        pk([
          ['qbz191', 3],
          ['qbz95', 2],
        ]),
      );
    add('mag191', R() < 0.5 ? 1 : 0);
    add('a556', Math.floor(R() * 25));
  }
  if (t === 1) {
    if (R() < 0.4)
      add(
        pk([
          ['qbu191', 2],
          ['qbu88', 1],
        ]),
      );
    add(R() < 0.5 ? 'mag88' : 'mag191', 1);
    add('a556', Math.floor(R() * 12));
  }
  if (t === 2) {
    if (R() < 0.3) add('qjy88');
    add('belt88', R() < 0.6 ? 1 : 0);
    add('a556', 10 + Math.floor(R() * 40));
  }
  if (t === 3) {
    if (R() < 0.55) add('qsz92');
    add('mag92', 1 + (R() < 0.3 ? 1 : 0));
  }
  if (t === 4) {
    if (R() < 0.4)
      add(
        pk([
          ['qcw05', 2],
          ['qbs09', 1],
        ]),
      );
    add(R() < 0.5 ? 'mag05' : 'a12', R() < 0.5 ? 1 : 4);
  }
  if (R() < (t === 4 ? 0.15 : 0.03)) add('fpv');
  if (R() < 0.1) add('dmotor', 1 + Math.floor(R() * 2));
  if (R() < 0.18) add('grenade');
  if (R() < 0.08) add('helmet');
  if (R() < 0.04) add('vest');
  if (R() < 0.45) add('ration');
  if (R() < 0.25) add('bandage');
  return it;
}
