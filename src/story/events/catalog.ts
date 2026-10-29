import { tr } from '../../i18n';
import { ACT1 } from './act1';
import { ACT4 } from './act4';
import type { StoryEvent } from './types';

/** Four-act outline. This drop ships act 1 and the act-4 all-clear ending. */
export const STORY_ACTS = [
  { act: 1, title: tr('前兆', 'Warning Signs') },
  { act: 2, title: tr('警報', 'Alarm') },
  { act: 3, title: tr('圍城', 'Under Siege') },
  { act: 4, title: tr('結局', 'Endings') },
] as const;

export const STORY_EVENTS: readonly StoryEvent[] = [...ACT1, ...ACT4];
