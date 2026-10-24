export type ItemDef = { name: string; w: number; kind: 'food'|'drink'|'med'|'melee'|'gun'|'ammo'|'tool'; hunger?: number; thirst?: number; fatigue?: number; hp?: number; stopBleed?: boolean; dmg?: number; range?: number; ammo?: string; noise?: number; cd?: number };
export const ITEMS: Record<string, ItemDef> = {
  can: { name: '肉醬罐頭', w: 0.4, kind: 'food', hunger: 30 },
  noodle: { name: '泡麵', w: 0.15, kind: 'food', hunger: 20, thirst: -5 },
  bento: { name: '便當', w: 0.5, kind: 'food', hunger: 45 },
  ration: { name: '軍用口糧', w: 0.4, kind: 'food', hunger: 40 },
  rice: { name: '飯糰', w: 0.15, kind: 'food', hunger: 18 },
  water: { name: '礦泉水', w: 0.6, kind: 'drink', thirst: 40 },
  sport: { name: '運動飲料', w: 0.6, kind: 'drink', thirst: 30, fatigue: -5 },
  tea: { name: '珍珠奶茶', w: 0.7, kind: 'drink', thirst: 25, hunger: 10 },
  coffee: { name: '罐裝咖啡', w: 0.3, kind: 'drink', thirst: 10, fatigue: -25 },
  bandage: { name: '繃帶', w: 0.1, kind: 'med', hp: 5, stopBleed: true },
  medkit: { name: '急救包', w: 0.8, kind: 'med', hp: 35, stopBleed: true },
  pill: { name: '止痛藥', w: 0.05, kind: 'med', hp: 10 },
  bat: { name: '棒球棍', w: 1.2, kind: 'melee', dmg: 34, range: 1.8, noise: 5, cd: 0.7 },
  knife: { name: '菜刀', w: 0.5, kind: 'melee', dmg: 26, range: 1.3, noise: 3, cd: 0.45 },
  pipe: { name: '鐵管', w: 1.6, kind: 'melee', dmg: 30, range: 1.9, noise: 6, cd: 0.8 },
  pistol: { name: '手槍', w: 1.0, kind: 'gun', dmg: 48, range: 28, ammo: 'a9', noise: 40, cd: 0.4 },
  rifle: { name: '突擊步槍', w: 3.5, kind: 'gun', dmg: 62, range: 45, ammo: 'a556', noise: 55, cd: 0.18 },
  a9: { name: '9mm 子彈', w: 0.01, kind: 'ammo' },
  a556: { name: '5.8mm 子彈', w: 0.012, kind: 'ammo' },
  plank: { name: '木板', w: 1.0, kind: 'tool' },
  hammer: { name: '鐵鎚', w: 0.8, kind: 'tool' },
};
export const LOOT: Record<string, [string, number, number][]> = {
  // id, weight, max count
  store: [['noodle',5,3],['rice',4,3],['water',6,3],['sport',3,2],['tea',3,2],['coffee',3,2],['can',3,2],['bento',2,1],['pill',1,1]],
  pharmacy: [['bandage',6,3],['medkit',2,1],['pill',5,3],['water',2,2],['sport',1,1]],
  home: [['can',3,2],['noodle',3,2],['water',3,2],['tea',1,1],['knife',2,1],['bat',1,1],['bandage',2,1],['plank',2,2],['hammer',1,1],['pipe',1,1],['coffee',1,1]],
  police: [['pistol',3,1],['a9',5,12],['bandage',2,2],['bat',1,1]],
};
