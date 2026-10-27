// 北廣 AM765（北都廣播電台）synthetic voice scripts. Data only — playback belongs to audio/.
/** Same station label the radio log already uses. */
export const AM765_STATION = '📻 北廣 AM765（北都廣播電台）';

export interface RadioScript {
  id: string;
  voice: 'synth';
  text: string;
}

export const AM765: readonly RadioScript[] = [
  {
    id: 'am765_drill_01',
    voice: 'synth',
    text: '這裡是北廣 AM765。國防單位表示，解放軍今日在台灣周邊海空域進行演習，請市民保持冷靜，留意後續消息。',
  },
  {
    id: 'am765_all_clear',
    voice: 'synth',
    text: '這裡是北廣 AM765。台北市已解除警報，請市民依照指示返家，注意路上安全。',
  },
];
