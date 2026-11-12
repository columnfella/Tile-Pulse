import React, { useState } from 'react';
import { Smartphone, Maximize2 } from 'lucide-react';
import { ACTIVE_THEME } from '../../constants/theme';

interface MobileShellProps {
  children: React.ReactNode;
  activeScreen?: string;
}

/**
 * Mobile Device Container Frame
 * Provides an authentic mobile viewport experience with status bar,
 * while allowing full-width expansion if preferred.
 */
export const MobileShell: React.FC<MobileShellProps> = ({ children, activeScreen }) => {
  const [isFramed, setIsFramed] = useState(true);

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-0 sm:p-4 select-none"
      style={{
        backgroundColor: '#05070d',
      }}
    >
      {/* Desktop view frame switcher button */}
      <div className="fixed top-3 right-3 hidden sm:flex items-center gap-2 z-50 bg-slate-900/90 border border-slate-700/80 rounded-full px-3 py-1.5 shadow-xl text-xs text-slate-300">
        <button
          onClick={() => setIsFramed(!isFramed)}
          className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
          title={isFramed ? 'Switch to Full Screen View' : 'Switch to Mobile Frame'}
        >
          {isFramed ? <Maximize2 size={13} /> : <Smartphone size={13} />}
          <span>{isFramed ? 'Full View' : 'Phone Frame'}</span>
        </button>
      </div>

      {/* Main Container */}
      <div
        className={`relative overflow-hidden flex flex-col transition-all duration-300 ${
          isFramed
            ? 'w-full max-w-[410px] h-[100dvh] sm:h-[800px] sm:max-h-[94vh] sm:rounded-[36px] sm:border-[8px] sm:border-slate-800 sm:shadow-2xl'
            : 'w-full h-[100dvh]'
        }`}
        style={{
          backgroundColor: ACTIVE_THEME.ui.appBackground,
        }}
      >
        {/* Subtle Mobile Top Notch / Status Bar in Framed Mode */}
        {isFramed && (
          <div className="hidden sm:flex absolute top-0 left-0 right-0 h-6 items-center justify-between px-6 z-40 pointer-events-none opacity-60 text-[10px] text-slate-300">
            <span>9:41</span>
            <div className="w-20 h-4 bg-slate-900 rounded-b-xl border-b border-slate-700" />
            <span>100% 5G</span>
          </div>
        )}

        {/* Inner Content Area */}
        <div className="flex-1 relative flex flex-col overflow-hidden w-full h-full">
          {children}
        </div>
      </div>
    </div>
  );
};
