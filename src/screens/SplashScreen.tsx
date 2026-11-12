import React, { useEffect, useState } from 'react';
import { storageService } from '../services/storage';
import { Music, Sparkles } from 'lucide-react';
import { ACTIVE_THEME } from '../constants/theme';

interface SplashScreenProps {
  onLoaded: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onLoaded }) => {
  const [statusText, setStatusText] = useState('Initializing local audio storage...');

  useEffect(() => {
    let isMounted = true;

    async function initialize() {
      try {
        await storageService.initStorage();
        if (!isMounted) return;
        const params = new URLSearchParams(window.location.search);
        if (params.get('autostart') === '1' || params.get('quick') === '1') {
          onLoaded();
          return;
        }
        setStatusText('Loading sound engine...');
        await new Promise((res) => setTimeout(res, 80));
        if (!isMounted) return;
        setStatusText('Ready');
        await new Promise((res) => setTimeout(res, 40));
        if (isMounted) {
          onLoaded();
        }
      } catch (err) {
        console.error('Failed to init app:', err);
        if (isMounted) onLoaded();
      }
    }

    initialize();
    return () => {
      isMounted = false;
    };
  }, [onLoaded]);

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center p-6 text-center select-none"
      style={{
        backgroundColor: ACTIVE_THEME.ui.appBackground,
        color: ACTIVE_THEME.ui.textPrimary,
      }}
    >
      {/* Animated Glowing Icon */}
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-2xl bg-sky-500/25 blur-xl animate-pulse" />
        <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-700 flex items-center justify-center shadow-2xl border border-sky-300/40">
          <Music size={40} className="text-white drop-shadow-md stroke-[2]" />
        </div>
      </div>

      {/* Title Lockup */}
      <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-2">
        <span>TilePulse</span>
        <Sparkles size={18} className="text-sky-400" />
      </h1>
      <p className="text-xs font-semibold text-sky-400/80 uppercase tracking-widest mt-1">
        4-Lane Piano Rhythm Engine
      </p>

      {/* Loading Spinner & Status */}
      <div className="mt-10 flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-sky-400/30 border-t-sky-400 rounded-full animate-spin" />
        <span className="text-xs text-slate-400 font-mono tracking-wide">{statusText}</span>
      </div>
    </div>
  );
};
