// In-module action list, adapted from the story drafts. The runner maps these onto core/bus;
// they are not bus event names.
export type StoryEmit =
  { type: 'broadcast.play'; id: string } | { type: 'alert.issue'; level: 'test' | 'alert' } | { type: 'alert.clear' };

export interface StoryEvent {
  id: string;
  act: number;
  /** Traditional Chinese narration. Radio copy lives in broadcasts/. */
  text: string;
  /** Set on act-4 endings. The all-clear ending emits alert clear. */
  ending?: boolean;
  emits: StoryEmit[];
}
