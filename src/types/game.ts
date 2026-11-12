export type HitJudgment = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';

export interface HitResult {
  tileId: string;
  lane: 0 | 1 | 2 | 3;
  judgment: HitJudgment;
  score: number;
  timeDiffMs: number;
  combo: number;
  timestamp: number;
}

export type TileStatus = 'pending' | 'holding' | 'hit' | 'missed';

export interface ActiveTileState {
  status: TileStatus;
  heldBeats: number;
  holdProgress: number; // 0 to 1
  holdStartTime?: number;
  lastScoreBeat?: number;
}

export interface GameStats {
  score: number;
  maxScore: number;
  combo: number;
  maxCombo: number;
  perfectCount: number;
  greatCount: number;
  goodCount: number;
  missCount: number;
  totalNotes: number;
  accuracy: number;
}

export type GameScreenState = 'splash' | 'home' | 'editor' | 'play';
