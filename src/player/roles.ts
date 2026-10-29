// Playable roles (fictional people). Each has a male/female faceless 白面人 outfit, spawn, destination, skills and starting pack.
export type Skills = {
  medic?: number;
  repair?: number;
  lockpick?: boolean;
  ride?: number;
  streets?: boolean;
  carry?: number;
  /** sleep recovery multiplier: fatigue (the 精神 bar) recovers this many times faster while sleeping */
  rest?: number;
};
export type Role = {
  id: string;
  name: string;
  age: [number, number];
  names: [string, string];
  blurb: string;
  spawn: 'home' | 'hospital' | 'scooter';
  dest: 'school' | 'office' | 'hospital' | 'delivery' | 'site';
  destLabel: string;
  skills: Skills;
  inv: Record<string, number>;
  look: { m: any; f: any };
  perks: string[];
};
const L = (top: number, bottom: number, o: any = {}) => ({ hair: 0x1a1410, top, bottom, shoes: 0xe8e8e8, ...o });
export const ROLES: Role[] = [
  {
    id: 'office',
    name: '上班族',
    age: [31, 29],
    names: ['志偉', '雅婷'],
    blurb: '每天搭捷運到西門町的辦公大樓上班',
    spawn: 'home',
    dest: 'office',
    destLabel: '公司（辦公大樓）',
    skills: { carry: 1 },
    inv: { coffee: 1, water: 1, noodle: 1 },
    perks: ['背包正常', '起點：自家'],
    look: {
      m: L(0xeef0f4, 0x262a34, { jacket: 0x262a34, shoes: 0x111111 }),
      f: L(0xf2eee6, 0x3a3f4a, { jacket: 0x3a3f4a, shoes: 0x111111 }),
    },
  },
  {
    id: 'student',
    name: '學生',
    age: [17, 16],
    names: ['冠宇', '欣妤'],
    blurb: '高中生，早上騎腳踏車去學校',
    spawn: 'home',
    dest: 'school',
    destLabel: '學校',
    skills: { carry: 1.1, rest: 1.5 },
    inv: { snack: 2, sport: 1, water: 1 },
    perks: ['體力恢復快', '背包稍大（書包）'],
    look: { m: L(0xf6f6f6, 0x1e2a50, { shoes: 0x222222 }), f: L(0xf6f6f6, 0x1e2a50, { shoes: 0x222222 }) },
  },
  {
    id: 'courier',
    name: '外送員',
    age: [32, 26],
    names: ['阿明', '佳琪'],
    blurb: '機車就停在巷口，閉著眼都認得萬華的巷子',
    spawn: 'scooter',
    dest: 'delivery',
    destLabel: '外送取餐點',
    skills: { ride: 1.25, streets: true, carry: 0.75 },
    inv: { water: 1, cupnoodle: 1, knife: 1 },
    perks: ['熟悉街道（地圖全開）', '騎車更快', '背包小'],
    look: { m: L(0x3a7a5a, 0x2a2a30, { jacket: 0x2f6a4c }), f: L(0x3a7a5a, 0x2a2a30, { jacket: 0x2f6a4c }) },
  },
  {
    id: 'nurse',
    name: '護理師',
    age: [29, 27],
    names: ['柏翰', '小雯'],
    blurb: '值完夜班在醫院宿舍醒來',
    spawn: 'hospital',
    dest: 'hospital',
    destLabel: '醫院急診',
    skills: { medic: 2 },
    inv: { bandage: 4, pill: 2, medkit: 1, water: 1 },
    perks: ['醫療技能：包紮效果加倍', '起點：醫院宿舍'],
    look: { m: L(0x5a9ab0, 0x5a9ab0, { shoes: 0xf4f4f4 }), f: L(0xd890a8, 0xd890a8, { shoes: 0xf4f4f4 }) },
  },
  {
    id: 'tech',
    name: '水電師傅',
    age: [45, 41],
    names: ['阿財', '淑芬'],
    blurb: '修電修水、開鎖接線都會，今天要去工地',
    spawn: 'home',
    dest: 'site',
    destLabel: '工地',
    skills: { repair: 2, lockpick: true },
    inv: { hammer: 1, pipe: 1, plank: 2, water: 1 },
    perks: ['修理：無線電只需 1 顆電池', '開鎖／接線發動', '工具箱'],
    look: { m: L(0x5a6a7a, 0x3a4048), f: L(0x6a7a8a, 0x3a4048) },
  },
];
export const roleById = (id?: string) => ROLES.find(r => r.id === id) || ROLES[2];
