import { tr } from '../../i18n';
// Prologue phone push notifications: [seconds into the prologue, sender, text]. Moved out of core/main.ts in v23.2.
export const PRO_NEWS: [number, string, string][] = [
  [
    3,
    tr('📱 早安推播', '📱 Morning update'),
    tr('今日台北：多雲 26°C，午後局部陣雨。', 'Taipei today: cloudy, 26°C, with scattered afternoon showers.'),
  ],
  [
    12,
    tr('📱 新聞快訊', '📱 Breaking news'),
    tr(
      '國防部：共軍於台海周邊實施「聯合演習」，政府呼籲民眾照常上班上課。',
      'Defense Ministry: PLA forces are conducting joint exercises around the Taiwan Strait. The government urges people to attend work and school as usual.',
    ),
  ],
  [
    24,
    tr('📱 交通', '📱 Traffic'),
    tr(
      '北都地下鐵正常營運；西門町周邊道路車多請改道。',
      'Beidu Metro is running normally. Heavy traffic around Ximending; please take alternate routes.',
    ),
  ],
  [
    38,
    tr('📱 新聞快訊', '📱 Breaking news'),
    tr(
      '多處網站遭受大規模網路攻擊，部分銀行 App 暫停服務。',
      'Major cyberattacks hit multiple websites. Some banking apps have suspended service.',
    ),
  ],
];
