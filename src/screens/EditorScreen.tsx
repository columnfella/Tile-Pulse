import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Song, TileNote } from '../types/song';
import { storageService } from '../services/storage';
import { audioService } from '../services/audio';
import { ACTIVE_THEME } from '../constants/theme';
import { snapToGrid, getMeasureInfo } from '../game/engine';
import {
  Play,
  Pause,
  Save,
  Trash2,
  Volume2,
  Sparkles,
  ChevronDown,
  Plus,
  Minus,
  RotateCcw,
  Check,
} from 'lucide-react';

interface EditorScreenProps {
  songs: Song[];
  selectedSongId: string;
  onSelectSong: (songId: string) => void;
  onRefreshSongs: () => Promise<void>;
  onPlaySong: (song: Song) => void;
}

export const EditorScreen: React.FC<EditorScreenProps> = ({
  songs,
  selectedSongId,
  onSelectSong,
  onRefreshSongs,
  onPlaySong,
}) => {
  const currentSong = songs.find((s) => s.id === selectedSongId) || songs[0];

  const [tiles, setTiles] = useState<TileNote[]>(currentSong?.tiles || []);
  const [activeSubdivision, setActiveSubdivision] = useState<number>(0.5); // 0.25 (1/4), 0.5 (1/2), 1.0 (1 beat)
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);
  const [previewAudioTime, setPreviewAudioTime] = useState<number>(0);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const gridContainerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Sync internal tiles state when selected song changes and scroll to start of song
  useEffect(() => {
    if (currentSong) {
      setTiles(currentSong.tiles || []);
      setSelectedTileId(null);
      audioService.stop();
      setIsPlayingPreview(false);
      setPreviewAudioTime(0);

      // Scroll to start of song (bottom of grid, Measure 1)
      setTimeout(() => {
        if (gridContainerRef.current) {
          gridContainerRef.current.scrollTop = gridContainerRef.current.scrollHeight;
        }
      }, 50);
    }
  }, [currentSong?.id]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      audioService.stop();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Pixels per musical beat in the vertical grid
  const PIXELS_PER_BEAT = 80;
  const TOTAL_BEATS = 48; // 12 measures of 4/4 = 48 beats (plenty for starter/song)
  const gridHeight = TOTAL_BEATS * PIXELS_PER_BEAT;

  // Real-time audio preview sync loop
  const updatePreviewPlayhead = useCallback(() => {
    if (audioService.getIsPlaying()) {
      const cur = audioService.getCurrentTime();
      setPreviewAudioTime(cur);

      // Auto scroll grid to match playhead
      if (currentSong && gridContainerRef.current) {
        const curBeat = cur * (currentSong.bpm / 60);
        const targetScrollY = gridHeight - curBeat * PIXELS_PER_BEAT - 200;
        gridContainerRef.current.scrollTop = targetScrollY;
      }

      animationFrameRef.current = requestAnimationFrame(updatePreviewPlayhead);
    } else {
      setIsPlayingPreview(false);
    }
  }, [currentSong, gridHeight]);

  const handleTogglePreview = async () => {
    if (!currentSong) return;

    if (isPlayingPreview) {
      audioService.pause();
      setIsPlayingPreview(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    } else {
      const uri = await storageService.getAudioUriForSong(currentSong);
      await audioService.loadTrack(currentSong.id, uri, currentSong.bpm, currentSong.durationSeconds);

      // Start from current scroll position
      let startBeat = 0;
      if (gridContainerRef.current) {
        const scrollTop = gridContainerRef.current.scrollTop;
        const visibleBottomY = gridHeight - (scrollTop + 300);
        startBeat = Math.max(0, visibleBottomY / PIXELS_PER_BEAT);
      }
      const startSec = startBeat * (60 / currentSong.bpm);
      audioService.play(startSec);
      setIsPlayingPreview(true);
      animationFrameRef.current = requestAnimationFrame(updatePreviewPlayhead);
    }
  };

  const handleSaveBeatmap = async () => {
    if (!currentSong) return;
    const updatedSong: Song = {
      ...currentSong,
      tiles: [...tiles].sort((a, b) => a.beat - b.beat),
    };
    await storageService.saveSong(updatedSong);
    await onRefreshSongs();
    setSaveToast('Beatmap saved successfully!');
    setTimeout(() => setSaveToast(null), 2500);
  };

  /**
   * Tap on empty grid slot -> Places Normal Tap Tile (durationBeats: 0)
   * Tap on existing tile -> Deletes it or selects it
   */
  const handleGridSlotClick = (lane: 0 | 1 | 2 | 3, beat: number, e: React.MouseEvent) => {
    e.stopPropagation();

    // Check if an existing tile was clicked
    const existingIndex = tiles.findIndex(
      (t) => t.lane === lane && Math.abs(t.beat - beat) < 0.2
    );

    if (existingIndex >= 0) {
      // If clicking existing tile, toggle delete or select
      const clickedTile = tiles[existingIndex];
      if (selectedTileId === clickedTile.id) {
        // Delete tile on double selection or direct tap
        setTiles((prev) => prev.filter((t) => t.id !== clickedTile.id));
        setSelectedTileId(null);
      } else {
        setSelectedTileId(clickedTile.id);
      }
    } else {
      // Place standard Tap Tile (durationBeats: 0)
      const newTile: TileNote = {
        id: `tile_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        lane,
        beat,
        durationBeats: 0,
      };
      setTiles((prev) => [...prev, newTile]);
      setSelectedTileId(newTile.id);

      // Auditory click feedback
      audioService.playHitSound(lane, true);
    }
  };

  /**
   * Adjust durationBeats of selected tile (convert Tap Tile to Hold Tile)
   */
  const handleAdjustSelectedDuration = (delta: number) => {
    if (!selectedTileId) return;
    setTiles((prev) =>
      prev.map((t) => {
        if (t.id === selectedTileId) {
          const newDuration = Math.max(0, Math.round((t.durationBeats + delta) * 4) / 4);
          return { ...t, durationBeats: newDuration };
        }
        return t;
      })
    );
  };

  const handleDeleteSelected = () => {
    if (!selectedTileId) return;
    setTiles((prev) => prev.filter((t) => t.id !== selectedTileId));
    setSelectedTileId(null);
  };

  const handleClearAll = () => {
    if (window.confirm('Clear all notes from this beatmap?')) {
      setTiles([]);
      setSelectedTileId(null);
    }
  };

  if (!currentSong) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-slate-400">
        No song selected. Please create or select a song in the Songs tab.
      </div>
    );
  }

  const selectedTile = tiles.find((t) => t.id === selectedTileId);
  const beatsPerMeasure = currentSong.timeSignature.beatsPerMeasure || 4;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none">
      {/* Top Controls Header */}
      <header
        className="px-4 pt-6 pb-3 border-b flex flex-col gap-2 shrink-0"
        style={{
          borderColor: ACTIVE_THEME.ui.cardBorder,
          backgroundColor: ACTIVE_THEME.ui.surfaceBackground,
        }}
      >
        {/* Row 1: Song Dropdown & Quick Actions */}
        <div className="flex items-center justify-between gap-2">
          {/* Song Dropdown Selector */}
          <div className="relative flex-1 min-w-0">
            <label htmlFor="song-picker-select" className="sr-only">Select Song</label>
            <select
              id="song-picker-select"
              value={currentSong.id}
              onChange={(e) => onSelectSong(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-white font-bold text-xs rounded-xl py-2 pl-3 pr-8 appearance-none truncate cursor-pointer focus:outline-none focus:border-sky-400"
            >
              {songs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.bpm} BPM)
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
          </div>

          {/* Test / Preview Audio Button */}
          <button
            onClick={handleTogglePreview}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              isPlayingPreview
                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30'
                : 'bg-slate-800 text-sky-400 border border-slate-700 hover:bg-slate-750'
            }`}
            aria-label={isPlayingPreview ? 'Pause Audio Preview' : 'Play Audio Preview'}
          >
            {isPlayingPreview ? <Pause size={14} /> : <Play size={14} />}
            <span>{isPlayingPreview ? 'Pause' : 'Test'}</span>
          </button>

          {/* Save Button */}
          <button
            onClick={handleSaveBeatmap}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 transition-colors shadow-md cursor-pointer active:scale-95"
            aria-label="Save Beatmap"
          >
            <Save size={14} />
            <span>Save</span>
          </button>
        </div>

        {/* Row 2: Grid Snap Subdivisions & Note Counters */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 mr-1">Snap:</span>
            {([1.0, 0.5, 0.25] as const).map((sub) => (
              <button
                key={sub}
                onClick={() => setActiveSubdivision(sub)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer transition-colors ${
                  activeSubdivision === sub
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-400/50 font-bold'
                    : 'bg-slate-900 border border-slate-800 hover:text-slate-200'
                }`}
              >
                {sub === 1 ? '1/1' : sub === 0.5 ? '1/2' : '1/4'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-300">
              {tiles.length} notes
            </span>
            <button
              onClick={handleClearAll}
              className="text-[10px] text-slate-500 hover:text-red-400 cursor-pointer"
              title="Clear all tiles"
            >
              Clear
            </button>
          </div>
        </div>
      </header>

      {/* Selected Tile Inspector / Hold Tile Stretch Toolbar */}
      {selectedTile && (
        <div className="px-4 py-2 bg-sky-950/40 border-b border-sky-800/40 flex items-center justify-between text-xs animate-fade-in shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sky-300">
              {selectedTile.durationBeats > 0 ? 'HOLD NOTE' : 'TAP NOTE'}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              Lane {selectedTile.lane + 1} · Beat {selectedTile.beat}
            </span>
          </div>

          {/* Duration stretch buttons */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400">Duration:</span>
            <button
              onClick={() => handleAdjustSelectedDuration(-0.5)}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
              title="Decrease hold duration"
            >
              <Minus size={12} />
            </button>
            <span className="font-mono font-bold text-white text-[11px] w-8 text-center">
              {selectedTile.durationBeats}b
            </span>
            <button
              onClick={() => handleAdjustSelectedDuration(0.5)}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
              title="Stretch into hold tile"
            >
              <Plus size={12} />
            </button>

            <button
              onClick={handleDeleteSelected}
              className="ml-2 p-1 text-red-400 hover:text-red-300 cursor-pointer"
              title="Delete note"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Save Success Toast */}
      {saveToast && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-40 bg-emerald-950 border border-emerald-500/60 text-emerald-300 text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 animate-bounce">
          <Check size={13} />
          <span>{saveToast}</span>
        </div>
      )}

      {/* 4-Lane Vertical Musical Beat Grid */}
      <div
        ref={gridContainerRef}
        className="flex-1 relative overflow-y-auto overflow-x-hidden flex"
        style={{
          backgroundColor: '#030712',
        }}
      >
        {/* Left Beat / Measure Ruler Column */}
        <div
          className="w-12 border-r border-slate-800 shrink-0 select-none relative"
          style={{ height: `${gridHeight}px` }}
        >
          {Array.from({ length: TOTAL_BEATS + 1 }).map((_, beatIdx) => {
            const beat = TOTAL_BEATS - beatIdx;
            const { measure, isBarline } = getMeasureInfo(beat, beatsPerMeasure);
            const y = beatIdx * PIXELS_PER_BEAT;

            return (
              <div
                key={beat}
                className="absolute left-0 right-0 flex items-center justify-end pr-1.5"
                style={{ top: `${y}px`, height: '1px' }}
              >
                {isBarline ? (
                  <span className="text-[10px] font-bold font-mono text-sky-400">
                    M{measure}
                  </span>
                ) : (
                  <span className="text-[9px] font-mono text-slate-600">{beat}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* 4 Musical Lanes */}
        <div className="flex-1 relative flex" style={{ height: `${gridHeight}px` }}>
          {/* Horizontal Beat Grid Lines */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Whole beat lines */}
            {Array.from({ length: TOTAL_BEATS + 1 }).map((_, beatIdx) => {
              const beat = TOTAL_BEATS - beatIdx;
              const { isBarline } = getMeasureInfo(beat, beatsPerMeasure);
              const y = beatIdx * PIXELS_PER_BEAT;

              return (
                <div
                  key={`line_${beat}`}
                  className={`absolute left-0 right-0 ${
                    isBarline
                      ? 'border-t-2 border-sky-500/40'
                      : 'border-t border-slate-800'
                  }`}
                  style={{ top: `${y}px` }}
                />
              );
            })}

            {/* Half beat subdivision lines */}
            {activeSubdivision <= 0.5 &&
              Array.from({ length: TOTAL_BEATS }).map((_, beatIdx) => {
                const y = (beatIdx + 0.5) * PIXELS_PER_BEAT;
                return (
                  <div
                    key={`half_${beatIdx}`}
                    className="absolute left-0 right-0 border-t border-dashed border-slate-800/40"
                    style={{ top: `${y}px` }}
                  />
                );
              })}
          </div>

          {/* Interactive 4 Lanes Columns */}
          {([0, 1, 2, 3] as const).map((laneIndex) => (
            <div
              key={laneIndex}
              className="flex-1 relative border-r border-slate-800/80 cursor-crosshair hover:bg-sky-950/10 transition-colors"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickY = e.clientY - rect.top;
                // Convert Y position to musical beat
                const rawBeat = TOTAL_BEATS - clickY / PIXELS_PER_BEAT;
                const snappedBeat = snapToGrid(rawBeat, activeSubdivision);
                if (snappedBeat >= 0 && snappedBeat <= TOTAL_BEATS) {
                  handleGridSlotClick(laneIndex, snappedBeat, e);
                }
              }}
            >
              {/* Lane header key badge fixed at top */}
              <div className="sticky top-1 left-0 right-0 flex justify-center z-10 pointer-events-none opacity-40">
                <span className="text-[10px] font-bold text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded-full border border-slate-700">
                  Lane {laneIndex + 1}
                </span>
              </div>
            </div>
          ))}

          {/* Placed Tile Items */}
          <div className="absolute inset-0 pointer-events-none">
            {tiles.map((tile) => {
              const lanePercent = 25;
              const leftPercent = tile.lane * lanePercent;
              // Bottom of tile aligns with tile.beat
              const bottomY = gridHeight - tile.beat * PIXELS_PER_BEAT;
              const height =
                tile.durationBeats > 0
                  ? Math.max(36, tile.durationBeats * PIXELS_PER_BEAT)
                  : 44; // Clean compact editor tile height
              const topY = bottomY - height;
              const isSelected = selectedTileId === tile.id;

              return (
                <div
                  key={tile.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTileId(tile.id);
                  }}
                  className={`absolute pointer-events-auto rounded-lg transition-all cursor-pointer flex flex-col justify-between p-1 select-none ${
                    tile.durationBeats > 0
                      ? 'border-2 border-sky-400 bg-sky-900/60 shadow-lg shadow-sky-950'
                      : 'border border-sky-300 bg-gradient-to-b from-sky-600 to-sky-900 shadow-md'
                  } ${isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-black scale-[1.02]' : 'hover:brightness-125'}`}
                  style={{
                    left: `calc(${leftPercent}% + 3px)`,
                    width: `calc(${lanePercent}% - 6px)`,
                    top: `${topY}px`,
                    height: `${height}px`,
                  }}
                >
                  <div className="flex items-center justify-between text-[9px] font-bold text-white px-0.5">
                    <span>{tile.durationBeats > 0 ? 'HOLD' : 'TAP'}</span>
                    <span className="font-mono text-[8px] opacity-75">
                      b{tile.beat}
                    </span>
                  </div>

                  {tile.durationBeats > 0 && (
                    <div className="text-[9px] font-mono text-center font-bold text-sky-200">
                      {tile.durationBeats} beats
                    </div>
                  )}

                  <div className="w-full h-1 bg-white/40 rounded-full" />
                </div>
              );
            })}
          </div>

          {/* Moving Playhead Line during Test Preview */}
          {isPlayingPreview && (
            <div
              className="absolute left-0 right-0 pointer-events-none flex items-center z-30"
              style={{
                top: `${
                  gridHeight -
                  previewAudioTime * (currentSong.bpm / 60) * PIXELS_PER_BEAT
                }px`,
              }}
            >
              <div className="w-full h-0.5 bg-amber-400 shadow-[0_0_12px_#fbbf24]" />
              <div className="absolute -left-2 w-3 h-3 bg-amber-400 rotate-45" />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Action Footer */}
      <footer className="p-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0">
        <div className="text-[11px] text-slate-400">
          <span className="text-slate-200 font-semibold">Tip: </span>
          Tap empty slot to add note. Tap note to select/edit duration.
        </div>
        <button
          onClick={() => onPlaySong(currentSong)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 active:scale-95 transition-all cursor-pointer shadow"
        >
          <Play size={12} className="fill-white" />
          <span>Play Beatmap</span>
        </button>
      </footer>
    </div>
  );
};
