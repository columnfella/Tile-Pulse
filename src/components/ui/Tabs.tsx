import React from 'react';
import { Home, Sliders, PlayCircle } from 'lucide-react';
import { ACTIVE_THEME } from '../../constants/theme';

interface BottomTabBarProps {
  currentTab: 'home' | 'editor';
  onTabChange: (tab: 'home' | 'editor') => void;
  quickPlaySongTitle?: string;
  onQuickPlay?: () => void;
}

export const BottomTabBar: React.FC<BottomTabBarProps> = ({
  currentTab,
  onTabChange,
  quickPlaySongTitle,
  onQuickPlay,
}) => {
  const { ui } = ACTIVE_THEME;

  return (
    <nav
      aria-label="Bottom Navigation"
      className="w-full h-16 border-t flex items-center justify-around px-4 z-30 select-none shrink-0"
      style={{
        backgroundColor: ui.surfaceBackground,
        borderColor: ui.cardBorder,
      }}
    >
      {/* Home Tab Button */}
      <button
        onClick={() => onTabChange('home')}
        className={`flex-1 flex flex-col items-center justify-center py-1 transition-all cursor-pointer ${
          currentTab === 'home' ? 'text-sky-400 font-bold' : 'text-slate-400 hover:text-slate-200'
        }`}
        aria-label="Home tab"
        aria-current={currentTab === 'home' ? 'page' : undefined}
      >
        <Home size={20} className={currentTab === 'home' ? 'stroke-[2.5]' : 'stroke-[1.75]'} />
        <span className="text-[11px] mt-1">Songs</span>
      </button>

      {/* Center Quick Play Pill (if a song is selected or ready) */}
      {onQuickPlay && (
        <button
          onClick={onQuickPlay}
          className="mx-2 -mt-4 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer text-white"
          style={{
            background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
            boxShadow: '0 4px 16px rgba(56, 189, 248, 0.45)',
          }}
          aria-label="Play selected song"
        >
          <PlayCircle size={26} className="fill-white/20 stroke-[2.2]" />
        </button>
      )}

      {/* Beat Editor Tab Button */}
      <button
        onClick={() => onTabChange('editor')}
        className={`flex-1 flex flex-col items-center justify-center py-1 transition-all cursor-pointer ${
          currentTab === 'editor' ? 'text-sky-400 font-bold' : 'text-slate-400 hover:text-slate-200'
        }`}
        aria-label="Edit tab"
        aria-current={currentTab === 'editor' ? 'page' : undefined}
      >
        <Sliders size={20} className={currentTab === 'editor' ? 'stroke-[2.5]' : 'stroke-[1.75]'} />
        <span className="text-[11px] mt-1">Editor</span>
      </button>
    </nav>
  );
};
