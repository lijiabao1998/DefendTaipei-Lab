import { ACT1 } from './act1';
import { ACT4 } from './act4';
import type { StoryEvent } from './types';

/** Four-act outline. This drop ships act 1 and the act-4 all-clear ending. */
export const STORY_ACTS = [
  { act: 1, title: '前兆' },
  { act: 2, title: '警報' },
  { act: 3, title: '圍城' },
  { act: 4, title: '結局' },
] as const;

export const STORY_EVENTS: readonly StoryEvent[] = [...ACT1, ...ACT4];
