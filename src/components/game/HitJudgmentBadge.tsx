import React from 'react';
import { HitJudgment } from '../../types/game';
import { ACTIVE_THEME } from '../../constants/theme';

interface HitJudgmentBadgeProps {
  judgment: HitJudgment | null;
  timeDiffMs?: number;
}

export const HitJudgmentBadge: React.FC<HitJudgmentBadgeProps> = ({ judgment, timeDiffMs }) => {
  if (!judgment) return null;

  const { judgments } = ACTIVE_THEME.feedback;
  let config = judgments.perfect;

  switch (judgment) {
    case 'PERFECT':
      config = judgments.perfect;
      break;
    case 'GREAT':
      config = judgments.great;
      break;
    case 'GOOD':
      config = judgments.good;
      break;
    case 'MISS':
      config = judgments.miss;
      break;
  }

  return (
    <div
      key={`${judgment}-${Date.now()}`}
      className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center justify-center animate-bounce z-20"
      style={{
        animationDuration: '350ms',
      }}
    >
      <div
        className="font-black tracking-widest text-2xl drop-shadow-md select-none"
        style={{
          color: config.color,
          textShadow: `0 0 16px ${config.glow}, 0 2px 4px rgba(0,0,0,0.8)`,
        }}
      >
        {config.text}
      </div>

      {judgment !== 'MISS' && typeof timeDiffMs === 'number' && (
        <span className="text-[11px] font-mono font-bold text-slate-300 opacity-80 mt-0.5">
          {timeDiffMs > 0 ? `+${timeDiffMs}ms` : `${timeDiffMs}ms`}
        </span>
      )}
    </div>
  );
};
