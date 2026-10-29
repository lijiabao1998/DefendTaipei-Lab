import { tr } from '../../i18n';
// 北廣 AM765（北都廣播電台）synthetic voice scripts. Data only — playback belongs to audio/.
/** Same station label the radio log already uses. */
export const AM765_STATION = tr('📻 北廣 AM765（北都廣播電台）', '📻 Beiguang AM765 (Beidu Radio)');

export interface RadioScript {
  id: string;
  voice: 'synth';
  text: string;
}

export const AM765: readonly RadioScript[] = [
  {
    id: 'am765_drill_01',
    voice: 'synth',
    text: tr(
      '這裡是北廣 AM765。國防單位表示，解放軍今日在台灣周邊海空域進行演習，請市民保持冷靜，留意後續消息。',
      'This is Beiguang AM765. Defense authorities report PLA drills in the air and waters around Taiwan today. Please remain calm and stay tuned for updates.',
    ),
  },
  {
    id: 'am765_all_clear',
    voice: 'synth',
    text: tr(
      '這裡是北廣 AM765。台北市已解除警報，請市民依照指示返家，注意路上安全。',
      'This is Beiguang AM765. The all-clear has been sounded in Taipei. Please follow instructions when returning home and travel safely.',
    ),
  },
];
