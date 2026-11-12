import React, { useState, useRef } from 'react';
import { Song, TileNote } from '../types/song';
import { storageService } from '../services/storage';
import { ACTIVE_THEME } from '../constants/theme';
import {
  Upload,
  Play,
  Edit3,
  Trash2,
  Music2,
  Clock,
  Layers,
  Sparkles,
  X,
  FileAudio,
  Check,
} from 'lucide-react';

interface HomeScreenProps {
  songs: Song[];
  onRefreshSongs: () => Promise<void>;
  onPlaySong: (song: Song) => void;
  onEditSong: (song: Song) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  songs,
  onRefreshSongs,
  onPlaySong,
  onEditSong,
}) => {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [songTitle, setSongTitle] = useState('');
  const [bpmInput, setBpmInput] = useState('120');
  const [timeSignature, setTimeSignature] = useState<'4/4' | '3/4' | '6/8'>('4/4');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tap-tempo helper
  const [tapTimestamps, setTapTimestamps] = useState<number[]>([]);

  const handleTapTempo = () => {
    const now = Date.now();
    const recent = [...tapTimestamps.filter((t) => now - t < 3000), now];
    setTapTimestamps(recent);
    if (recent.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < recent.length; i++) {
        intervals.push(recent[i] - recent[i - 1]);
      }
      const avgIntervalMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (avgIntervalMs > 0) {
        const calculatedBpm = Math.round(60000 / avgIntervalMs);
        if (calculatedBpm >= 40 && calculatedBpm <= 280) {
          setBpmInput(`${calculatedBpm}`);
        }
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Pre-fill song title from filename without extension
      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      setSongTitle(cleanName);
      setErrorMsg('');
    }
  };

  const handleOpenUpload = () => {
    setSelectedFile(null);
    setSongTitle('');
    setBpmInput('120');
    setTimeSignature('4/4');
    setErrorMsg('');
    setIsUploadModalOpen(true);
  };

  const handleSaveUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Please select an audio file (.mp3, .wav, .m4a)');
      return;
    }
    const cleanTitle = songTitle.trim();
    if (!cleanTitle) {
      setErrorMsg('Song title is required');
      return;
    }
    const bpmNum = parseInt(bpmInput, 10);
    if (isNaN(bpmNum) || bpmNum < 40 || bpmNum > 300) {
      setErrorMsg('BPM must be a valid number between 40 and 300');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');

    try {
      const songId = `song_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      // Save audio blob into permanent storage
      const audioUri = await storageService.saveAudioBlob(songId, selectedFile);

      const [beatsPerMeasure, beatUnit] = timeSignature.split('/').map(Number);

      const newSong: Song = {
        id: songId,
        title: cleanTitle,
        audioUri,
        bpm: bpmNum,
        timeSignature: {
          beatsPerMeasure,
          beatUnit,
        },
        tiles: [], // Empty tiles array for new song
        createdAt: Date.now(),
      };

      await storageService.saveSong(newSong);
      await onRefreshSongs();
      setIsUploadModalOpen(false);
      // Immediately open in editor so user can start mapping!
      onEditSong(newSong);
    } catch (err) {
      console.error('Failed to save song:', err);
      setErrorMsg('Failed to process and store audio file. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSong = async (songId: string, title: string) => {
    if (window.confirm(`Are you sure you want to delete "${title}"?`)) {
      await storageService.deleteSong(songId);
      await onRefreshSongs();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none">
      {/* Top Header */}
      <header className="px-5 pt-8 pb-4 border-b flex items-center justify-between shrink-0"
        style={{
          borderColor: ACTIVE_THEME.ui.cardBorder,
          backgroundColor: ACTIVE_THEME.ui.surfaceBackground,
        }}
      >
        <div>
          <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
            <span>TilePulse</span>
            <Sparkles size={16} className="text-sky-400" />
          </h1>
          <p className="text-[11px] text-slate-400">4-Lane Rhythm Studio</p>
        </div>

        <button
          onClick={handleOpenUpload}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-md active:scale-95 cursor-pointer"
          style={{
            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            boxShadow: '0 2px 10px rgba(2, 132, 199, 0.4)',
          }}
          aria-label="Upload Song"
        >
          <Upload size={14} className="stroke-[2.5]" />
          <span>Upload Song</span>
        </button>
      </header>

      {/* Hidden File Input for Document Picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/mp3,audio/wav,audio/m4a,audio/*,.mp3,.wav,.m4a"
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
      />

      {/* Song List Content */}
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Song Library ({songs.length})
          </h2>
          <span className="text-[11px] text-sky-400 font-medium">Ready to play</span>
        </div>

        {songs.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400 border border-dashed rounded-2xl border-slate-700 mt-6">
            <Music2 size={36} className="text-slate-500 mb-2" />
            <p className="text-sm font-semibold text-slate-300">No songs yet</p>
            <p className="text-xs text-slate-500 mt-1">Tap &quot;Upload Song&quot; above to import your music.</p>
          </div>
        ) : (
          songs.map((song) => {
            const isStarter = song.id === 'starter_fur_elise';
            const tapCount = song.tiles.filter((t) => t.durationBeats === 0).length;
            const holdCount = song.tiles.filter((t) => t.durationBeats > 0).length;

            return (
              <div
                key={song.id}
                className="group relative p-4 rounded-2xl border transition-all duration-200"
                style={{
                  backgroundColor: ACTIVE_THEME.ui.cardBackground,
                  borderColor: ACTIVE_THEME.ui.cardBorder,
                }}
              >
                {/* Header row with badges */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-bold text-sm text-white truncate max-w-[200px]">
                        {song.title}
                      </h3>
                      {isStarter && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-sky-500/20 text-sky-300 border border-sky-400/30">
                          SAMPLE
                        </span>
                      )}
                    </div>
                    {song.artist && (
                      <p className="text-xs text-slate-400 truncate mt-0.5">{song.artist}</p>
                    )}
                  </div>

                  {/* Delete button (except starter protection prompt) */}
                  <button
                    onClick={() => handleDeleteSong(song.id, song.title)}
                    className="p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded-lg cursor-pointer"
                    aria-label={`Delete ${song.title}`}
                    title="Delete song"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {/* Metadata Pills */}
                <div className="flex items-center gap-2 mt-3 text-[11px] text-slate-300 flex-wrap">
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/60 font-mono">
                    <Clock size={11} className="text-sky-400" />
                    <span>{song.bpm} BPM</span>
                  </span>

                  <span className="px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/60 font-mono">
                    {song.timeSignature.beatsPerMeasure}/{song.timeSignature.beatUnit}
                  </span>

                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/60">
                    <Layers size={11} className="text-emerald-400" />
                    <span>{song.tiles.length} notes</span>
                    {holdCount > 0 && (
                      <span className="text-slate-400">({holdCount} hold)</span>
                    )}
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-800/80">
                  <button
                    onClick={() => onPlaySong(song)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold text-white transition-transform active:scale-95 cursor-pointer"
                    style={{
                      background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                      boxShadow: '0 2px 10px rgba(14, 165, 233, 0.35)',
                    }}
                    aria-label={`Play ${song.title}`}
                  >
                    <Play size={14} className="fill-white" />
                    <span>Play</span>
                  </button>

                  <button
                    onClick={() => onEditSong(song)}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3.5 rounded-xl text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors cursor-pointer"
                    aria-label={`Edit ${song.title}`}
                  >
                    <Edit3 size={13} />
                    <span>Edit</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </main>

      {/* Upload Modal Form */}
      {isUploadModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-sm rounded-3xl p-5 border shadow-2xl flex flex-col"
            style={{
              backgroundColor: ACTIVE_THEME.ui.surfaceBackground,
              borderColor: ACTIVE_THEME.ui.cardBorder,
            }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <FileAudio size={18} className="text-sky-400" />
                <span>Upload Audio Track</span>
              </h3>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveUpload} className="mt-4 space-y-4">
              {/* File selector pill */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Audio File (.mp3, .wav, .m4a)
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-3 rounded-xl border border-dashed border-slate-700 bg-slate-900/60 hover:bg-slate-900 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <span className="text-xs text-slate-300 truncate max-w-[200px]">
                    {selectedFile ? selectedFile.name : 'Tap to pick audio file...'}
                  </span>
                  <span className="text-[11px] text-sky-400 font-bold shrink-0">Browse</span>
                </div>
              </div>

              {/* Title input */}
              <div>
                <label htmlFor="song-title-input" className="block text-xs font-semibold text-slate-300 mb-1">
                  Song Title
                </label>
                <input
                  id="song-title-input"
                  type="text"
                  value={songTitle}
                  onChange={(e) => setSongTitle(e.target.value)}
                  placeholder="e.g. Moonlight Sonata"
                  className="w-full px-3 py-2 text-sm rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
                  required
                />
              </div>

              {/* BPM and Tap-Tempo */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="song-bpm-input" className="text-xs font-semibold text-slate-300">
                    BPM (Beats Per Minute)
                  </label>
                  <button
                    type="button"
                    onClick={handleTapTempo}
                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 hover:bg-sky-900 active:scale-95 cursor-pointer"
                  >
                    Tap Tempo
                  </button>
                </div>
                <input
                  id="song-bpm-input"
                  type="number"
                  min="40"
                  max="300"
                  value={bpmInput}
                  onChange={(e) => setBpmInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-slate-900 border border-slate-700 text-white font-mono focus:outline-none focus:border-sky-400"
                  required
                />
              </div>

              {/* Time Signature */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Time Signature
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['4/4', '3/4', '6/8'] as const).map((sig) => (
                    <button
                      key={sig}
                      type="button"
                      onClick={() => setTimeSignature(sig)}
                      className={`py-2 text-xs font-mono font-bold rounded-xl border transition-all cursor-pointer ${
                        timeSignature === sig
                          ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      {sig}
                    </button>
                  ))}
                </div>
              </div>

              {errorMsg && (
                <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/60 p-2.5 rounded-xl">
                  {errorMsg}
                </div>
              )}

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-400 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isSaving ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Create Song</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
