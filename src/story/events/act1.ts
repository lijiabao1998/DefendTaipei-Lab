import { tr } from '../../i18n';
import type { StoryEvent } from './types';

/** 第一幕 前兆：演習新聞、搶購、防空警報測試。 */
export const ACT1: readonly StoryEvent[] = [
  {
    id: 'act1_drill_news',
    act: 1,
    text: tr(
      '收音機傳來消息：解放軍今天又在台灣周邊展開演習。',
      'The radio reports another round of PLA exercises around Taiwan today.',
    ),
    emits: [{ type: 'broadcast.play', id: 'am765_drill_01' }],
  },
  {
    id: 'act1_panic_buying',
    act: 1,
    text: tr(
      '萬華的超市門口排起長龍，泡麵和瓶裝水的貨架空了一半。',
      "Long queues form outside Wanhua's supermarkets. Shelves of instant noodles and bottled water are already half empty.",
    ),
    emits: [],
  },
  {
    id: 'act1_siren_test',
    act: 1,
    text: tr(
      '整點的防空警報測試響起，路人只是抬頭看了一眼。',
      'The hourly air-raid siren test sounds. Passersby barely glance up.',
    ),
    emits: [{ type: 'alert.issue', level: 'test' }],
  },
];
