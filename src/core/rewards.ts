import { TUNING } from './tuning.js';
import { NEEDS, type Needs } from './types.js';

export interface RewardInput {
  needs: Needs;
  completedTotal: number;
  lastNoteDate: string | null;
  today: string;
}

export interface EarnedRewards {
  note: boolean;
  photo: boolean;
}

export function rewardsEarned({ needs, completedTotal, lastNoteDate, today }: RewardInput): EarnedRewards {
  const allHigh = NEEDS.every((need) => needs[need] >= TUNING.noteFrom);
  return {
    note: allHigh && lastNoteDate !== today,
    photo: completedTotal > 0 && completedTotal % TUNING.photoEvery === 0,
  };
}
