import { tr } from '../../i18n';
import type { StoryEvent } from './types';

/** 第四幕結局：解除警報。 */
export const ALL_CLEAR_ID = 'ending_all_clear';

export const ACT4: readonly StoryEvent[] = [
  {
    id: ALL_CLEAR_ID,
    act: 4,
    ending: true,
    text: tr(
      '長長一聲警報響過，這次是解除警報。街上的人慢慢走出地下室。',
      'One long siren sounds. This time, it is the all-clear. People slowly emerge from their basements.',
    ),
    emits: [{ type: 'alert.clear' }, { type: 'broadcast.play', id: 'am765_all_clear' }],
  },
];
