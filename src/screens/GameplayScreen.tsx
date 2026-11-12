import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Song, TileNote } from '../types/song';
import { HitJudgment, GameStats, ActiveTileState } from '../types/game';
import { ACTIVE_THEME } from '../constants/theme';
import {
  calculateNoteTimeSeconds,
  calculateTileY,
  calculateTileHeight,
  evaluateHitJudgment,
  isWithinHitWindow,
  isTilePastMissThreshold,
  calculateHoldProgress,
  calculateOverallAccuracy,
  formatAudioTime,
} from '../game/engine';
import { audioService } from '../services/audio';
import { storageService } from '../services/storage';
import { GameBoardBackground, LANE_KEYS } from '../components/game/GameBoardBackground';
import { TapTileView } from '../components/game/TapTileView';
import { HoldTileView } from '../components/game/HoldTileView';
import { HitJudgmentBadge } from '../components/game/HitJudgmentBadge';
import { ComboDisplay } from '../components/game/ComboDisplay';
import {
  Pause,
  Play,
  RotateCcw,
  Home,
  Award,
  Sparkles,
  Trophy,
} from 'lucide-react';

interface GameplayScreenProps {
  song: Song;
  onExitToHome: () => void;
  onRestart: () => void;
}

export const GameplayScreen: React.FC<GameplayScreenProps> = ({
  song,
  onExitToHome,
  onRestart,
}) => {
  // Game state
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(song.durationSeconds || 15);

  // Active inputs
  const [activeLanes, setActiveLanes] = useState<boolean[]>([false, false, false, false]);
  const [laneFlashes, setLaneFlashes] = useState<boolean[]>([false, false, false, false]);

  // Scoring and Judgments
  const [currentJudgment, setCurrentJudgment] = useState<HitJudgment | null>(null);
  const [judgmentTimeDiff, setJudgmentTimeDiff] = useState<number | undefined>(undefined);
  const [stats, setStats] = useState<GameStats>({
    score: 0,
    maxScore: song.tiles.length * 1000,
    combo: 0,
    maxCombo: 0,
    perfectCount: 0,
    greatCount: 0,
    goodCount: 0,
    missCount: 0,
    totalNotes: song.tiles.length,
    accuracy: 100,
  });

  // Dynamic Tile States map (tileId -> ActiveTileState)
  const tileStatesRef = useRef<Map<string, ActiveTileState>>(new Map());
  // Lane to currently held tile mapping
  const activeHoldByLaneRef = useRef<Map<number, string>>(new Map());
  // Frame loop ref
  const animFrameIdRef = useRef<number | null>(null);
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [boardDimensions, setBoardDimensions] = useState({ width: 360, height: 640 });

  // Theme dimensions
  const { geometry } = ACTIVE_THEME;
  const pixelsPerBeat = geometry.pixelsPerBeat;
  const hitLineY = Math.round(boardDimensions.height * (geometry.hitLineYPercent / 100));

  // Measure board size on mount and resize
  useEffect(() => {
    function measure() {
      if (boardContainerRef.current) {
        const { clientWidth, clientHeight } = boardContainerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          setBoardDimensions({ width: clientWidth, height: clientHeight });
        }
      }
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Initialize tile states
  useEffect(() => {
    const states = new Map<string, ActiveTileState>();
    song.tiles.forEach((t) => {
      states.set(t.id, {
        status: 'pending',
        heldBeats: 0,
        holdProgress: 0,
      });
    });
    tileStatesRef.current = states;
  }, [song]);

  // Load and play audio on mount
  useEffect(() => {
    let isMounted = true;

    async function startAudio() {
      try {
        const uri = await storageService.getAudioUriForSong(song);
        if (!isMounted) return;
        await audioService.loadTrack(song.id, uri, song.bpm, song.durationSeconds);
        if (!isMounted) return;
        audioService.play(0);
        setAudioDuration(audioService.getDuration());
      } catch (err) {
        console.warn('Audio start error:', err);
      }
    }

    startAudio();

    return () => {
      isMounted = false;
      audioService.stop();
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [song]);

  // Handle Score & Judgment Update
  const registerHit = useCallback(
    (tileId: string, judgment: HitJudgment, score: number, timeDiffMs?: number) => {
      setCurrentJudgment(judgment);
      setJudgmentTimeDiff(timeDiffMs);

      setStats((prev) => {
        const isHit = judgment !== 'MISS';
        const newCombo = isHit ? prev.combo + 1 : 0;
        const newMaxCombo = Math.max(prev.maxCombo, newCombo);
        const perfectCount = prev.perfectCount + (judgment === 'PERFECT' ? 1 : 0);
        const greatCount = prev.greatCount + (judgment === 'GREAT' ? 1 : 0);
        const goodCount = prev.goodCount + (judgment === 'GOOD' ? 1 : 0);
        const missCount = prev.missCount + (judgment === 'MISS' ? 1 : 0);
        const newScore = prev.score + score;

        const newAccuracy = calculateOverallAccuracy({
          perfectCount,
          greatCount,
          goodCount,
          missCount,
          totalNotes: prev.totalNotes,
        });

        return {
          ...prev,
          score: newScore,
          combo: newCombo,
          maxCombo: newMaxCombo,
          perfectCount,
          greatCount,
          goodCount,
          missCount,
          accuracy: newAccuracy,
        };
      });
    },
    []
  );

  // Trigger momentary lane flash
  const triggerLaneFlash = (lane: 0 | 1 | 2 | 3) => {
    setLaneFlashes((prev) => {
      const next = [...prev];
      next[lane] = true;
      return next;
    });
    setTimeout(() => {
      setLaneFlashes((prev) => {
        const next = [...prev];
        next[lane] = false;
        return next;
      });
    }, 90);
  };

  /**
   * Input: Lane Pressed (Pointer Down / Key Down)
   */
  const handleLanePressStart = useCallback(
    (lane: 0 | 1 | 2 | 3) => {
      if (isPaused || isCompleted) return;

      setActiveLanes((prev) => {
        const next = [...prev];
        next[lane] = true;
        return next;
      });

      triggerLaneFlash(lane);

      const curAudioTime = audioService.getCurrentTime();
      const secondsPerBeat = 60 / song.bpm;

      // Find the earliest unhit tile in this lane
      const laneTiles = song.tiles
        .filter((t) => t.lane === lane)
        .sort((a, b) => a.beat - b.beat);

      let targetTile: TileNote | null = null;
      let minDiff = Infinity;

      for (const t of laneTiles) {
        const state = tileStatesRef.current.get(t.id);
        if (state && (state.status === 'pending' || state.status === 'holding')) {
          const noteTime = calculateNoteTimeSeconds(t.beat, song.bpm);
          const diff = Math.abs(curAudioTime - noteTime);
          if (diff < minDiff && isWithinHitWindow(curAudioTime - noteTime)) {
            minDiff = diff;
            targetTile = t;
          }
        }
      }

      if (targetTile) {
        const noteTime = calculateNoteTimeSeconds(targetTile.beat, song.bpm);
        const timeDiffSec = curAudioTime - noteTime;
        const result = evaluateHitJudgment(timeDiffSec);

        if (targetTile.durationBeats === 0) {
          // Standard Tap Tile
          tileStatesRef.current.set(targetTile.id, {
            status: 'hit',
            heldBeats: 0,
            holdProgress: 1,
          });
          audioService.playHitSound(lane, result.judgment === 'PERFECT');
          registerHit(targetTile.id, result.judgment, result.score, Math.round(timeDiffSec * 1000));
        } else {
          // Hold Tile: Begin holding
          tileStatesRef.current.set(targetTile.id, {
            status: 'holding',
            heldBeats: 0,
            holdProgress: 0,
            holdStartTime: curAudioTime,
          });
          activeHoldByLaneRef.current.set(lane, targetTile.id);
          audioService.playHitSound(lane, true);
        }
      } else {
        // Tapped with no tile in hit window (empty tap)
        audioService.playHitSound(lane, false);
      }
    },
    [isPaused, isCompleted, song, registerHit]
  );

  /**
   * Input: Lane Released (Pointer Up / Key Up)
   */
  const handleLanePressEnd = useCallback(
    (lane: 0 | 1 | 2 | 3) => {
      setActiveLanes((prev) => {
        const next = [...prev];
        next[lane] = false;
        return next;
      });

      // Check if this lane was currently holding a Hold Tile
      const holdingTileId = activeHoldByLaneRef.current.get(lane);
      if (holdingTileId) {
        activeHoldByLaneRef.current.delete(lane);
        const tile = song.tiles.find((t) => t.id === holdingTileId);
        const state = tileStatesRef.current.get(holdingTileId);

        if (tile && state && state.status === 'holding') {
          const curTime = audioService.getCurrentTime();
          const startNoteTime = calculateNoteTimeSeconds(tile.beat, song.bpm);
          const durationSeconds = (tile.durationBeats * 60) / song.bpm;
          const progress = calculateHoldProgress(curTime, startNoteTime, durationSeconds);

          if (progress >= 0.85) {
            // Held successfully through the required duration!
            state.status = 'hit';
            state.holdProgress = 1;
            registerHit(tile.id, 'PERFECT', 1000);
          } else {
            // Released early
            state.status = 'missed';
            state.holdProgress = progress;
            registerHit(tile.id, 'MISS', 0);
          }
        }
      }
    },
    [song, registerHit]
  );

  // Keyboard controls listener (D, F, J, K)
  useEffect(() => {
    const keyMap: Record<string, 0 | 1 | 2 | 3> = {
      d: 0,
      D: 0,
      f: 1,
      F: 1,
      j: 2,
      J: 2,
      k: 3,
      K: 3,
    };

    const keysHeld = new Set<string>();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key in keyMap) {
        const lane = keyMap[e.key];
        keysHeld.add(e.key.toLowerCase());
        handleLanePressStart(lane);
      } else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        setIsPaused((p) => !p);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key in keyMap) {
        const lane = keyMap[e.key];
        keysHeld.delete(e.key.toLowerCase());
        handleLanePressEnd(lane);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleLanePressStart, handleLanePressEnd]);

  // Audio-Synced Game Loop
  useEffect(() => {
    if (isPaused || isCompleted) return;

    let lastTickTime = 0;

    const gameLoop = () => {
      const curTime = audioService.getCurrentTime();
      setAudioCurrentTime(curTime);

      // Check active hold notes and update progress / award score
      activeHoldByLaneRef.current.forEach((tileId, lane) => {
        const tile = song.tiles.find((t) => t.id === tileId);
        const state = tileStatesRef.current.get(tileId);
        if (tile && state && state.status === 'holding') {
          const startNoteTime = calculateNoteTimeSeconds(tile.beat, song.bpm);
          const durationSeconds = (tile.durationBeats * 60) / song.bpm;
          const progress = calculateHoldProgress(curTime, startNoteTime, durationSeconds);
          state.holdProgress = progress;

          // Sound tick during hold
          if (curTime - lastTickTime > 0.15) {
            audioService.playHoldTick(progress);
            lastTickTime = curTime;
          }

          if (progress >= 1.0) {
            // Completed hold!
            state.status = 'hit';
            activeHoldByLaneRef.current.delete(lane);
            registerHit(tile.id, 'PERFECT', 1000);
          }
        }
      });

      // Check for missed tiles that traveled past hit line without being tapped
      song.tiles.forEach((t) => {
        const state = tileStatesRef.current.get(t.id);
        if (state && state.status === 'pending') {
          const noteTime = calculateNoteTimeSeconds(t.beat, song.bpm);
          if (isTilePastMissThreshold(noteTime, curTime, t.durationBeats, song.bpm)) {
            state.status = 'missed';
            registerHit(t.id, 'MISS', 0);
          }
        }
      });

      // Check for song completion
      const songEndGrace = (song.durationSeconds || 15) + 1.0;
      if (curTime >= songEndGrace && song.tiles.length > 0) {
        setIsCompleted(true);
        audioService.stop();
        return;
      }

      animFrameIdRef.current = requestAnimationFrame(gameLoop);
    };

    animFrameIdRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [isPaused, isCompleted, song, registerHit]);

  // Pause / Resume Toggle
  const handleTogglePause = () => {
    if (isPaused) {
      audioService.play(audioService.getCurrentTime());
      setIsPaused(false);
    } else {
      audioService.pause();
      setIsPaused(true);
    }
  };

  const handleRestartGame = () => {
    audioService.stop();
    onRestart();
  };

  // Rank determination
  const getRank = (accuracy: number) => {
    if (accuracy >= 98) return 'S+';
    if (accuracy >= 94) return 'S';
    if (accuracy >= 85) return 'A';
    if (accuracy >= 70) return 'B';
    if (accuracy >= 55) return 'C';
    return 'D';
  };

  return (
    <div
      ref={boardContainerRef}
      className="relative w-full h-full flex flex-col overflow-hidden select-none"
      style={{ backgroundColor: ACTIVE_THEME.board.backgroundColor }}
    >
      {/* Top HUD Cluster (Score, Combo, Song Title, Pause button) */}
      <header className="absolute top-0 left-0 right-0 z-30 pt-7 pb-3 px-4 flex items-center justify-between pointer-events-none">
        {/* Left: Pause / Exit Button */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={handleTogglePause}
            className="w-9 h-9 rounded-xl bg-slate-900/80 border border-slate-700/80 flex items-center justify-center text-slate-200 hover:text-white transition-colors cursor-pointer active:scale-95 shadow"
            aria-label="Pause game"
          >
            <Pause size={16} />
          </button>

          <div className="flex flex-col">
            <span className="text-xs font-bold text-white truncate max-w-[130px]">
              {song.title}
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {formatAudioTime(audioCurrentTime)} / {formatAudioTime(audioDuration)}
            </span>
          </div>
        </div>

        {/* Right: Score Readout */}
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-bold tracking-widest text-sky-400 uppercase">
            SCORE
          </span>
          <span className="font-mono text-lg font-black text-white tabular-nums drop-shadow">
            {stats.score.toString().padStart(6, '0')}
          </span>
        </div>
      </header>

      {/* Center Animated Feedback (Judgment Badge + Combo Display) */}
      <HitJudgmentBadge judgment={currentJudgment} timeDiffMs={judgmentTimeDiff} />
      <ComboDisplay combo={stats.combo} />

      {/* Main 4-Lane Game Board Surface */}
      <GameBoardBackground
        hitLineY={hitLineY}
        activeLanes={activeLanes}
        laneFlashes={laneFlashes}
        onLanePressStart={handleLanePressStart}
        onLanePressEnd={handleLanePressEnd}
        showKeyLabels={true}
      >
        {/* Moving Tiles Layer - Driven directly by audioCurrentTime */}
        {song.tiles.map((tile) => {
          const state = tileStatesRef.current.get(tile.id) || {
            status: 'pending',
            heldBeats: 0,
            holdProgress: 0,
          };

          const noteTimeSeconds = calculateNoteTimeSeconds(tile.beat, song.bpm);
          // Audio-Synced Game Loop formula as requested in 3.D:
          // TileY = HitLineY - (NoteTimeSeconds - currentAudioTime) * PixelsPerBeat * (song.bpm / 60)
          const tileBottomY = calculateTileY(
            noteTimeSeconds,
            audioCurrentTime,
            pixelsPerBeat,
            song.bpm,
            hitLineY
          );

          const defaultTapHeight = geometry.defaultTapTileHeightPx;
          const tileHeight = calculateTileHeight(
            tile.durationBeats,
            pixelsPerBeat,
            defaultTapHeight
          );

          // Top Y position for CSS top
          const tileTopY = tileBottomY - tileHeight;

          // Optimization: Skip rendering if completely offscreen
          if (tileTopY > boardDimensions.height + 150 || tileBottomY < -200) {
            return null;
          }

          const lanePercent = 25;
          const leftPercent = tile.lane * lanePercent;

          if (tile.durationBeats > 0) {
            return (
              <div
                key={tile.id}
                className="absolute"
                style={{
                  left: `${leftPercent}%`,
                  width: `${lanePercent}%`,
                }}
              >
                <HoldTileView
                  y={tileTopY}
                  height={tileHeight}
                  lane={tile.lane}
                  isHolding={state.status === 'holding'}
                  holdProgress={state.holdProgress}
                  isHit={state.status === 'hit'}
                  isMissed={state.status === 'missed'}
                />
              </div>
            );
          }

          return (
            <div
              key={tile.id}
              className="absolute"
              style={{
                left: `${leftPercent}%`,
                width: `${lanePercent}%`,
              }}
            >
              <TapTileView
                y={tileTopY}
                height={tileHeight}
                lane={tile.lane}
                isHit={state.status === 'hit'}
                isMissed={state.status === 'missed'}
              />
            </div>
          );
        })}
      </GameBoardBackground>

      {/* Song Progress Bar at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-900 z-30">
        <div
          className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-100"
          style={{
            width: `${Math.min(100, (audioCurrentTime / (audioDuration || 1)) * 100)}%`,
          }}
        />
      </div>

      {/* Pause Modal */}
      {isPaused && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-5 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-xs rounded-3xl p-6 border shadow-2xl flex flex-col items-center text-center"
            style={{
              backgroundColor: ACTIVE_THEME.ui.surfaceBackground,
              borderColor: ACTIVE_THEME.ui.cardBorder,
            }}
          >
            <h3 className="text-xl font-black text-white tracking-tight">Game Paused</h3>
            <p className="text-xs text-slate-400 mt-1">{song.title}</p>

            <div className="w-full mt-6 space-y-2.5">
              <button
                onClick={handleTogglePause}
                className="w-full py-3 rounded-xl font-bold text-xs text-white bg-sky-600 hover:bg-sky-500 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                aria-label="Resume playing"
              >
                <Play size={15} className="fill-white" />
                <span>Resume</span>
              </button>

              <button
                onClick={handleRestartGame}
                className="w-full py-2.5 rounded-xl font-semibold text-xs text-slate-200 bg-slate-800 hover:bg-slate-700 active:scale-95 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                aria-label="Restart song"
              >
                <RotateCcw size={14} />
                <span>Restart</span>
              </button>

              <button
                onClick={onExitToHome}
                className="w-full py-2.5 rounded-xl font-semibold text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                aria-label="Back to home"
              >
                <Home size={14} />
                <span>Exit to Song List</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completion / Victory Overlay Modal */}
      {isCompleted && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-5 bg-black/85 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-sm rounded-3xl p-6 border shadow-2xl flex flex-col items-center text-center"
            style={{
              backgroundColor: ACTIVE_THEME.ui.surfaceBackground,
              borderColor: ACTIVE_THEME.ui.cardBorder,
            }}
          >
            {/* Rank Badge */}
            <div className="relative mb-3">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg border border-amber-300">
                <span className="text-2xl font-black text-black">
                  {getRank(stats.accuracy)}
                </span>
              </div>
              <Sparkles size={16} className="absolute -top-1 -right-1 text-amber-300 animate-spin" />
            </div>

            <h3 className="text-xl font-black text-white tracking-tight">Song Completed!</h3>
            <p className="text-xs text-slate-400 mt-0.5">{song.title}</p>

            {/* Score & Accuracy Hero readout */}
            <div className="w-full grid grid-cols-2 gap-2 my-4 p-3 rounded-2xl bg-slate-900/80 border border-slate-800">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase text-slate-400">Total Score</span>
                <span className="font-mono text-lg font-black text-sky-400">
                  {stats.score}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase text-slate-400">Accuracy</span>
                <span className="font-mono text-lg font-black text-emerald-400">
                  {stats.accuracy}%
                </span>
              </div>
            </div>

            {/* Judgment Breakdowns */}
            <div className="w-full grid grid-cols-4 gap-1.5 text-center text-[10px] font-mono mb-5">
              <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="font-bold text-sky-400">PERFECT</div>
                <div className="text-white text-xs font-bold mt-0.5">{stats.perfectCount}</div>
              </div>
              <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="font-bold text-emerald-400">GREAT</div>
                <div className="text-white text-xs font-bold mt-0.5">{stats.greatCount}</div>
              </div>
              <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="font-bold text-amber-400">GOOD</div>
                <div className="text-white text-xs font-bold mt-0.5">{stats.goodCount}</div>
              </div>
              <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="font-bold text-red-400">MISS</div>
                <div className="text-white text-xs font-bold mt-0.5">{stats.missCount}</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="w-full space-y-2">
              <button
                onClick={handleRestartGame}
                className="w-full py-3 rounded-xl font-bold text-xs text-white bg-sky-600 hover:bg-sky-500 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                aria-label="Play Again"
              >
                <RotateCcw size={14} />
                <span>Play Again</span>
              </button>

              <button
                onClick={onExitToHome}
                className="w-full py-2.5 rounded-xl font-semibold text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                aria-label="Back to Home"
              >
                <Home size={14} />
                <span>Back to Home</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
