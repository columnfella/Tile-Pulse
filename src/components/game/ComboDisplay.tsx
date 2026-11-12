import React from 'react';

interface ComboDisplayProps {
  combo: number;
}

export const ComboDisplay: React.FC<ComboDisplayProps> = ({ combo }) => {
  if (combo <= 1) return null;

  return (
    <div className="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center select-none z-10 opacity-90">
      <div className="text-4xl font-extrabold tracking-tight text-white drop-shadow-md">
        {combo}
      </div>
      <div className="text-[10px] font-bold tracking-widest text-sky-400 uppercase">
        COMBO
      </div>
    </div>
  );
};
