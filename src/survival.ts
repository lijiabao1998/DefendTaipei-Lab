// v22 This War of Mine–style survival layer.
//  • Day / night: 06–18 patrols are out (stay home, manage the shelter, scavenging is risky); 18–06 is scavenging
//    time (extra finds while looting at night).
//  • Home shelter at the spawn: upgrades (board windows, beds, stove, rain collector, planter) built from loot.
//  • A survivor group (阿嬤, 廟公, a migrant worker, a neighbour) with a skill each, hunger, illness, injury, mood.
//  • Moral choices (taking an old person's medicine weighs on everyone), barter at 龍山寺 / 東園街市場 with
//    cigarettes, meds, batteries, cans and rice, and Taiwan-flavoured daily events.
//  • Scarcity grows every day; the 奪回 ending text is shaped by what you did.
// State is plain JSON (saved with the game) and the daily event is picked from a seed of the day number,
// so every client in a multiplayer room sees the same day.
export type Survivor = {
  id: string;
  name: string;
  role: string;
  skill: 'cook' | 'pray' | 'build' | 'scav';
  hunger: number; // 0 = starving, 100 = full
  sick: number; // 0 healthy … 100
  hurt: number; // 0 … 100
  mood: number; // 0 broken … 100
  here: boolean;
  dead?: boolean;
};
export type Upg = 'boards' | 'beds' | 'stove' | 'rain' | 'planter';
export const UPG: Record<Upg, { name: string; cost: Record<string, number>; desc: string }> = {
  boards: { name: '釘木板封窗', cost: { plank: 3 }, desc: '夜裡被搶的機會大減' },
  beds: { name: '撿來的床墊', cost: { plank: 2, cloth: 2 }, desc: '大家睡得好，生病和受傷好得快' },
  stove: { name: '瓦斯爐', cost: { scrap: 3, gas: 1 }, desc: '一包米煮成全組的一餐' },
  rain: { name: '頂樓集雨桶', cost: { scrap: 2, bucket: 1 }, desc: '下雨天自動接雨水' },
  planter: { name: '陽台菜圃', cost: { plank: 1, seeds: 1 }, desc: '每兩天收一把地瓜葉' },
};
/** barter values (in 香菸 equivalents); scarcity raises what food and meds are worth */
export const VAL: Record<string, number> = {
  cig: 1,
  umbrella: 1,
  mask: 2,
  powerbank: 4,
  bread: 1,
  battery: 2,
  can: 3,
  rice: 3,
  noodle: 2,
  pill: 4,
  bandage: 3,
  medkit: 8,
  water: 1,
  plank: 1,
  scrap: 1,
  cloth: 1,
  seeds: 2,
  gas: 3,
};
export const TRADE_SPOTS: { name: string; x: number; z: number }[] = [
  { name: '龍山寺廟埕・以物易物', x: -260, z: 392 },
  { name: '東園街市場・以物易物', x: -40, z: 610 },
];
export type SurvState = {
  day: number;
  karma: number;
  scarcity: number; // 1 → grows each day
  upg: Partial<Record<Upg, 1>>;
  group: Survivor[];
  stash: Record<string, number>;
  ev: string;
  log: string[];
  plantDay: number;
  prayDay: number;
  raided: number;
  stole: number;
  gave: number;
  /** the shelter: where this survivor started */
  home?: [number, number];
  /** v22.3 wallet (NTD) — only worth anything while the shops still run */
  cash?: number;
  /** v22.3 vending machines / lockers this player has pried open */
  pried?: string[];
  /** v22.5 cleared sniper posts */
  snpDead?: string[];
  /** v22.5 the scope moment: shot or spared the soldier helping a civilian */
  moral?: 'shot' | 'spared';
};
export function newSurv(): SurvState {
  const S = (id: string, name: string, role: string, skill: Survivor['skill'], here: boolean): Survivor => ({
    id,
    name,
    role,
    skill,
    hunger: 70,
    sick: 0,
    hurt: 0,
    mood: 70,
    here,
  });
  return {
    day: 1,
    karma: 0,
    scarcity: 1,
    upg: {},
    group: [
      S('ama', '阿嬤', '隔壁的阿嬤（會煮飯）', 'cook', true),
      S('miao', '廟公', '青山宮廟公（會安定人心）', 'pray', false),
      S('adi', '阿迪', '印尼移工（會修東西）', 'build', false),
      S('mei', '小美', '樓下的鄰居（會找東西）', 'scav', true),
    ],
    stash: { rice: 2, water: 2 },
    ev: '',
    log: [],
    plantDay: 0,
    prayDay: 0,
    raided: 0,
    stole: 0,
    gave: 0,
  };
}
const EVENTS: { id: string; t: string; fx: (s: SurvState, u: UtilFx) => string }[] = [
  { id: 'blackout', t: '⚡ 停電', fx: (_, u) => (u.power(false), '整區停電，冰箱裡的東西撐不了多久。') },
  { id: 'watercut', t: '🚱 停水', fx: (_, u) => (u.water(false), '自來水停了，只能靠存水和雨水。') },
  {
    id: 'siren',
    t: '📢 防空警報',
    fx: s => (s.group.forEach(g => (g.mood -= 6)), '防空警報響了一整晚，大家都沒睡好。'),
  },
  {
    id: 'typhoon',
    t: '🌀 颱風',
    fx: s => {
      if (s.upg.rain) s.stash.rainwater = (s.stash.rainwater || 0) + 4;
      return s.upg.boards ? '颱風過境，封好的窗撐住了。' : '颱風把沒封的窗吹破，大家又濕又冷。';
    },
  },
  {
    id: 'aid',
    t: '🍚 鄰長發物資',
    fx: s => (
      (s.stash.rice = (s.stash.rice || 0) + 2),
      (s.stash.can = (s.stash.can || 0) + 1),
      '鄰長挨家挨戶送來兩包米和罐頭。'
    ),
  },
  {
    id: 'evacb',
    t: '📻 疏散廣播',
    fx: s => (s.group.forEach(g => (g.mood -= 3)), '廣播要老弱婦孺往南疏散，但橋都被封了。'),
  },
  { id: 'calm', t: '☁ 平靜的一天', fx: () => '難得沒有槍聲，大家在屋裡補衣服、聊天。' },
];
export type UtilFx = { power: (on: boolean) => void; water: (on: boolean) => void };

function seeded(n: number) {
  let s = (n * 2654435761) % 2147483647 || 7;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
export const isNight = (gameMin: number) => {
  const h = (gameMin / 60) % 24;
  return h < 6 || h >= 18;
};
/** one morning tick (06:00): eat, heal or sicken, mood, events, scarcity, upgrades produce */
export function dayTick(s: SurvState, raining: boolean, u: UtilFx) {
  s.day++;
  s.scarcity = Math.min(3, 1 + s.day * 0.07);
  const r = seeded(s.day);
  const out: string[] = [];
  const here = s.group.filter(g => g.here && !g.dead);
  // food: a stove turns one rice into a meal for everyone; otherwise one food item each
  let meals = 0;
  if (s.upg.stove && (s.stash.rice || 0) > 0) {
    s.stash.rice--;
    meals = here.length;
    out.push('阿嬤用瓦斯爐煮了一鍋稀飯。');
  }
  for (const g of here) {
    if (meals > 0) {
      meals--;
      g.hunger = Math.min(100, g.hunger + 45);
    } else {
      const f = ['can', 'noodle', 'rice', 'cupnoodle', 'snack', 'bento'].find(k => (s.stash[k] || 0) > 0);
      if (f) {
        s.stash[f]--;
        g.hunger = Math.min(100, g.hunger + 35);
      } else g.hunger -= 25;
    }
    g.hunger -= 15;
    const water = ['water', 'rainwater', 'tea'].find(k => (s.stash[k] || 0) > 0);
    if (water) s.stash[water]--;
    else g.sick += 12;
    if (g.hunger < 20) ((g.sick += 10), (g.mood -= 10));
    if (!s.upg.boards && r() < 0.08) g.sick += 15;
    const heal = s.upg.beds ? 18 : 8;
    g.hurt = Math.max(0, g.hurt - heal);
    if ((s.stash.pill || 0) > 0 && g.sick > 30) {
      s.stash.pill--;
      g.sick -= 35;
      out.push(`${g.name}吃了止痛錠，燒退了一點。`);
    } else g.sick = Math.max(0, g.sick - (s.upg.beds ? 10 : 4));
    g.mood -= 2 + s.scarcity * 1.5;
    if (s.karma < -2) g.mood -= 4;
    g.hunger = Math.max(0, Math.min(100, g.hunger));
    g.mood = Math.max(0, Math.min(100, g.mood));
    if (g.sick >= 100 || (g.hunger <= 0 && g.sick > 60)) {
      g.dead = true;
      out.push(`💀 ${g.name}沒撐過這一夜。`);
      s.group.forEach(o => (o.mood -= 20));
    } else if (g.mood < 15) out.push(`${g.name}整天不說話，眼神空洞（憂鬱）。`);
  }
  // planter / rain collector
  if (s.upg.planter && s.day - s.plantDay >= 2) {
    s.plantDay = s.day;
    s.stash.veg = (s.stash.veg || 0) + 2;
    s.stash.snack = (s.stash.snack || 0) + 1;
    out.push('陽台的地瓜葉可以收了。');
  }
  if (s.upg.rain && raining) s.stash.rainwater = (s.stash.rainwater || 0) + 3;
  // night raid on an unboarded shelter
  if (r() < (s.upg.boards ? 0.04 : 0.2) * s.scarcity) {
    const k = Object.keys(s.stash).find(x => (s.stash[x] || 0) > 0);
    if (k) {
      s.stash[k] = Math.max(0, s.stash[k] - 2);
      s.raided++;
      out.push(`🔦 半夜有人撬窗，偷走了一些${k === 'rice' ? '米' : '存貨'}。`);
    }
  }
  // newcomers knock on the door
  const away = s.group.find(g => !g.here && !g.dead);
  if (away && r() < 0.35 + s.karma * 0.05) {
    away.here = true;
    out.push(`🚪 ${away.role}敲門求收留，你讓他進來了。`);
  }
  const ev = EVENTS[Math.floor(r() * EVENTS.length)];
  s.ev = ev.t;
  out.unshift(`第 ${s.day} 天・${ev.t}：${ev.fx(s, u)}`);
  s.log = [...out, ...s.log].slice(0, 30);
  return out;
}
/** praying at the home 神明廳 (once a day): mood up for everyone, more with the 廟公 */
export function pray(s: SurvState) {
  if (s.prayDay === s.day) return '今天已經拜過了。';
  s.prayDay = s.day;
  const b = s.group.some(g => g.id === 'miao' && g.here && !g.dead) ? 15 : 8;
  s.group.forEach(g => !g.dead && (g.mood = Math.min(100, g.mood + b)));
  return `點了香，在神明廳前拜拜。大家的心情好一點（+${b}）。`;
}
export function avgMood(s: SurvState) {
  const a = s.group.filter(g => g.here && !g.dead);
  return a.length ? Math.round(a.reduce((t, g) => t + g.mood, 0) / a.length) : 0;
}
/** what an item fetches / costs at the barter stall today (scarcity makes food + meds dearer) */
export function price(s: SurvState, k: string) {
  const v = VAL[k] ?? 1;
  return Math.max(1, Math.round(/rice|can|noodle|pill|bandage|medkit|water/.test(k) ? v * s.scarcity : v));
}
/** the 奪回 ending paragraph, shaped by choices */
export function endingText(s: SurvState) {
  const alive = s.group.filter(g => g.here && !g.dead);
  const dead = s.group.filter(g => g.dead);
  const m = avgMood(s);
  let t = `撐了 ${s.day} 天，避難所裡還有 ${alive.length} 位街坊：${alive.map(g => g.name).join('、') || '沒有人'}。`;
  if (dead.length) t += `${dead.map(g => g.name).join('、')}沒能看到這一天。`;
  if (s.karma <= -3) t += '萬華奪回了，但你拿走過別人的救命藥，夜裡還是會想起那扇門。';
  else if (s.karma >= 3) t += '大家都記得，最難的時候是你把米分給了巷口的人。';
  else t += '萬華奪回了，大家互相扶著走出巷子。';
  if (m < 30) t += '活下來的人笑不太出來。';
  return t;
}
