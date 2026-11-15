import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import {
  View,
  FlatList,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { ScreenView } from '../../src/components/ui/ScreenView';
import { PixelIcon, type PixelIconName } from '../../src/components/ui/PixelIcon';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Song, TileNote } from '../../types/song';
import { storageService } from '../../services/storage';
import { audioService } from '../../services/audio';
import { ACTIVE_THEME } from '../../constants/theme';
import { snapToGrid, getMeasureInfo } from '../../src/game/engine';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { listItemIn } from '../../src/components/ui/motion';
import { LANE_COLORS, LANE_LIGHT } from '../../src/theme/pixel';
import { FONTS } from '../../src/theme/pixel';

const PIXELS_PER_BEAT = 96; // 1/4 snap cells are 24px, 1/2 cells 48px
const TILE_GAP = 2; // px inset so neighbouring notes never visually touch
const DEFAULT_HOLD_BEATS = 1;
const MIN_BPM = 40;
const MAX_BPM = 300;
/** Clamps any number to a playable tempo (handles 0, negatives, NaN, huge values). */
const clampBpm = (value: number) =>
  Number.isFinite(value) ? Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(value))) : 120;

/** Extra beats after the song ends, so the last notes have room. */
const TAIL_BEATS = 4;
/** Grid length used until the audio's real duration is known. */
const FALLBACK_BEATS = 64;
/** The visible window loads in chunks of this many beats as you scroll. */
const CHUNK_BEATS = 8;
/** Space above / below the grid so the top and bottom beat labels are fully visible. */
const GRID_PAD_TOP = 28;
const GRID_PAD_BOTTOM = 36;

/** Number of beats in the grid: the song's length (plus a little tail). */
function gridBeatsFor(durationSeconds: number | null, bpm: number, tiles: TileNote[]): number {
  const songBeats = durationSeconds ? Math.ceil((durationSeconds * bpm) / 60) : FALLBACK_BEATS;
  const lastNote = tiles.reduce((m, t) => Math.max(m, t.beat + Math.max(t.durationBeats, 1)), 0);
  return Math.max(16, songBeats, Math.ceil(lastNote)) + TAIL_BEATS;
}

type Lane = 0 | 1 | 2 | 3;
type NoteType = 'tap' | 'hold';

/* ------------------------------------------------------------------------ *
 * Performance notes
 *  - The grid is as long as the song, but only the part near the screen is
 *    rendered: ruler labels, grid lines and notes are windowed by scroll
 *    position and load in chunks of CHUNK_BEATS as you scroll.
 *  - A single touch layer maps a tap's position to (lane, beat).
 *  - Tiles are memoized so only the changed tile re-renders.
 *  - The preview playhead moves via a Reanimated shared value.
 * ------------------------------------------------------------------------ */

/** Beat → y of the *bottom* edge of that beat's cell (beat 0 is at the bottom). */
const beatToY = (beat: number, gridHeight: number) => gridHeight - beat * PIXELS_PER_BEAT;

/** A note's footprint on the grid: [start, end) in beats. */
const noteEnd = (t: TileNote, cell: number) => t.beat + (t.durationBeats > 0 ? t.durationBeats : cell);

/** Visible window of the grid, in beats. */
interface BeatRange {
  from: number;
  to: number;
}

const beatsInRange = (range: BeatRange, totalBeats: number) => {
  const out: number[] = [];
  for (let b = Math.max(0, range.from); b <= Math.min(totalBeats, range.to); b++) out.push(b);
  return out;
};

interface RulerProps {
  beatsPerMeasure: number;
  totalBeats: number;
  range: BeatRange;
  /** Tap the ruler to move the Test start point. */
  onPressBeat: (e: GestureResponderEvent) => void;
}

const Ruler = memo(function Ruler({ beatsPerMeasure, totalBeats, range, onPressBeat }: RulerProps) {
  const gridHeight = totalBeats * PIXELS_PER_BEAT;
  return (
    <Pressable onPress={onPressBeat} style={[styles.rulerColumn, { height: gridHeight }]}>
      {beatsInRange(range, totalBeats).map((beat) => {
        const { measure, isBarline } = getMeasureInfo(beat, beatsPerMeasure);
        return (
          <View
            key={beat}
            pointerEvents="none"
            style={[styles.rulerMark, { top: beatToY(beat, gridHeight) - 14 }]}
          >
            {isBarline ? (
              <Text style={styles.barlineText}>M{measure}</Text>
            ) : (
              <Text style={styles.beatNumText}>{beat}</Text>
            )}
          </View>
        );
      })}
    </Pressable>
  );
});

interface GridGuidesProps {
  beatsPerMeasure: number;
  subdivision: number;
  totalBeats: number;
  range: BeatRange;
}

/** Strict grid: beat/bar lines plus faint lines for the current snap size (visible window only). */
const GridGuides = memo(function GridGuides({ beatsPerMeasure, subdivision, totalBeats, range }: GridGuidesProps) {
  const gridHeight = totalBeats * PIXELS_PER_BEAT;
  const cellsPerBeat = Math.round(1 / subdivision);
  const beats = beatsInRange(range, totalBeats);
  const cellLines: number[] = [];
  if (cellsPerBeat > 1) {
    for (const b of beats) {
      if (b >= totalBeats) continue;
      for (let i = 1; i < cellsPerBeat; i++) cellLines.push(b + i * subdivision);
    }
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {cellLines.map((beat) => (
        <View key={`c${beat}`} style={[styles.gridLine, styles.cellGridLine, { top: beatToY(beat, gridHeight) }]} />
      ))}
      {beats.map((beat) => {
        const { isBarline } = getMeasureInfo(beat, beatsPerMeasure);
        return (
          <View
            key={beat}
            style={[
              styles.gridLine,
              { top: beatToY(beat, gridHeight) },
              isBarline ? styles.barlineGridLine : styles.beatGridLine,
            ]}
          />
        );
      })}
      <View style={styles.laneColumnsRow}>
        {[0, 1, 2, 3].map((lane) => (
          <View key={lane} style={styles.editorLaneColumn} />
        ))}
      </View>
    </View>
  );
});

interface EditorTileProps {
  tile: TileNote;
  /** Height of one grid cell in beats (the current snap size). */
  cell: number;
  gridHeight: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

/** A note drawn exactly inside its grid cells, with a small gap so notes never touch. */
const EditorTile = memo(function EditorTile({ tile, cell, gridHeight, isSelected, onSelect }: EditorTileProps) {
  const isHold = tile.durationBeats > 0;
  const top = beatToY(noteEnd(tile, cell), gridHeight) + TILE_GAP;
  const height = (noteEnd(tile, cell) - tile.beat) * PIXELS_PER_BEAT - TILE_GAP * 2;
  const showLabel = height >= 30;

  return (
    <Pressable
      onPress={() => onSelect(tile.id)}
      style={[
        styles.gridTile,
        {
          top,
          height,
          left: `${tile.lane * 25}%`,
          right: `${(3 - tile.lane) * 25}%`,
          backgroundColor: isHold ? '#05070d' : LANE_COLORS[tile.lane],
          borderColor: isSelected ? '#ffffff' : '#000000',
          borderWidth: isSelected ? 3 : 2,
        },
      ]}
    >
      {/* Hold notes: black → blue gradient, like in the game */}
      {isHold && <LinearGradient colors={['#000000', '#123a9e', '#2f6bff']} style={StyleSheet.absoluteFill} />}
      {/* Pixel bevel highlight */}
      <View pointerEvents="none" style={[styles.tileBevel, { backgroundColor: LANE_LIGHT[tile.lane] }]} />
      {showLabel && (
        <View style={styles.gridTileHeader}>
          <Text style={styles.gridTileLabel}>{isHold ? 'HOLD' : 'TAP'}</Text>
          <Text style={styles.gridTileBeat}>b{tile.beat}</Text>
        </View>
      )}
      {isHold && showLabel && <Text style={styles.gridTileDuration}>{tile.durationBeats}b</Text>}
    </Pressable>
  );
});

/* ------------------------------------------------------------------------ *
 * Song picker — the Editor tab first asks which song to edit.
 * ------------------------------------------------------------------------ */

interface SongPickerProps {
  songs: Song[];
  loaded: boolean;
  onPick: (id: string) => void;
}

function SongPicker({ songs, loaded, onPick }: SongPickerProps) {
  return (
    <ScreenView style={[styles.safeArea, { backgroundColor: ACTIVE_THEME.ui.appBackground }]}>
      <Animated.View entering={FadeIn.duration(250)} style={styles.pickerHeader}>
        <Text style={styles.pickerTitle}>Beatmap Editor</Text>
        <Text style={styles.pickerSub}>Choose a song to edit</Text>
      </Animated.View>

      {loaded && songs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No songs yet — add some from the Songs tab.</Text>
        </View>
      ) : (
        <FlatList
          data={songs}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.pickerList}
          renderItem={({ item, index }) => {
            const holds = item.tiles.filter((t) => t.durationBeats > 0).length;
            return (
              <Animated.View entering={listItemIn(index)}>
                <PressableScale
                  scaleTo={0.97}
                  style={styles.pickerCard}
                  onPress={() => onPick(item.id)}
                  accessibilityLabel={`Edit ${item.title}`}
                >
                  <View style={styles.pickerIcon}>
                    <PixelIcon name="note" size={21} color="#4d8dff" />
                  </View>
                  <View style={styles.pickerInfo}>
                    <Text style={styles.pickerSongTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.pickerMeta}>
                      {item.bpm} BPM · {item.tiles.length} notes
                      {holds > 0 ? ` (${holds} hold)` : ''}
                    </Text>
                  </View>
                  <PixelIcon name="chevronRight" size={21} color="#3a4a70" />
                </PressableScale>
              </Animated.View>
            );
          }}
        />
      )}
    </ScreenView>
  );
}

/* ------------------------------------------------------------------------ *
 * Beatmap editor for one song: autosaves to the device, with undo / redo.
 * ------------------------------------------------------------------------ */

interface Snapshot {
  tiles: TileNote[];
  bpm: number;
}

const MAX_HISTORY = 100;
const AUTOSAVE_DELAY_MS = 400;

interface BeatmapEditorProps {
  song: Song;
  onBack: () => void;
  onSaved: (song: Song) => void;
}

function BeatmapEditor({ song, onBack, onSaved }: BeatmapEditorProps) {
  const router = useRouter();

  const [tiles, setTiles] = useState<TileNote[]>(song.tiles || []);
  const [bpm, setBpm] = useState<number>(song.bpm);
  const [activeSubdivision, setActiveSubdivision] = useState<number>(0.5);
  const [noteType, setNoteType] = useState<NoteType>('tap');
  // Beat where the Test preview starts (set by tapping the ruler)
  const [previewStartBeat, setPreviewStartBeat] = useState<number>(0);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [toast, setToast] = useState<string | null>(null);

  // Undo / redo stacks of full snapshots (cheap: beatmaps are small)
  const pastRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const [, setHistoryVersion] = useState(0);

  const scrollViewRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const animFrameRef = useRef<number | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lanesWidthRef = useRef(1);
  const isFirstRenderRef = useRef(true);
  // Song length (seconds). Measured from the audio when the song doesn't store it.
  const [durationSec, setDurationSec] = useState<number | null>(
    song.durationSeconds && song.durationSeconds > 0 ? song.durationSeconds : null
  );
  // Grid length follows the song: you can't place notes past its end
  const totalBeats = useMemo(() => gridBeatsFor(durationSec, bpm, tiles), [durationSec, bpm, tiles]);
  const gridHeight = totalBeats * PIXELS_PER_BEAT;
  const gridHeightRef = useRef(gridHeight);
  gridHeightRef.current = gridHeight;

  // Visible window (in beats), updated in chunks as you scroll
  const [range, setRange] = useState<BeatRange>({ from: 0, to: CHUNK_BEATS * 3 });
  const viewportHeightRef = useRef(600);

  // Latest values for saving from timers / unmount
  const latestRef = useRef({ tiles, bpm });
  latestRef.current = { tiles, bpm };

  // Playhead position driven on the UI thread
  const playheadY = useSharedValue(gridHeight);
  const playheadStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: playheadY.value }],
  }));

  /* ------------------------------ saving ------------------------------ */

  // Kept in a ref: the parent passes a new `song` object after every save,
  // which must not re-trigger the autosave effect.
  const songRef = useRef(song);
  songRef.current = song;

  const buildSong = useCallback(
    (): Song => ({
      ...songRef.current,
      bpm: latestRef.current.bpm,
      tiles: [...latestRef.current.tiles].sort((a, b) => a.beat - b.beat),
    }),
    []
  );

  const saveNow = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const updated = buildSong();
    try {
      await storageService.saveSong(updated);
      onSaved(updated);
      setSaveStatus('saved');
    } catch (err) {
      console.warn('Autosave failed:', err);
      setSaveStatus('error');
    }
  }, [buildSong, onSaved]);

  // Autosave shortly after every change
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void saveNow(), AUTOSAVE_DELAY_MS);
  }, [tiles, bpm, saveNow]);

  // Scroll to the start of the song (bottom of grid) when opened
  useEffect(() => {
    const t = setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(t);
  }, []);

  // Learn the song's real length from its audio when it isn't stored yet,
  // and remember it so the grid is the right size next time.
  useEffect(() => {
    if (durationSec) return;
    let cancelled = false;
    (async () => {
      try {
        const uri = await storageService.getAudioUriForSong(songRef.current);
        await audioService.loadTrack(songRef.current.id, uri, songRef.current.bpm, songRef.current.durationSeconds);
        const measured = audioService.getDuration();
        if (cancelled || !measured || measured <= 0) return;
        setDurationSec(measured);
        const updated = { ...songRef.current, durationSeconds: measured };
        await storageService.saveSong({ ...updated, bpm: latestRef.current.bpm, tiles: latestRef.current.tiles });
        onSaved({ ...updated, bpm: latestRef.current.bpm, tiles: latestRef.current.tiles });
      } catch (err) {
        console.warn('Could not measure song length:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Recomputes which beats are near the screen; state only changes per chunk. */
  const updateRange = useCallback(
    (scrollY: number) => {
      const viewH = viewportHeightRef.current;
      const topBeat = (gridHeightRef.current - (scrollY - GRID_PAD_TOP)) / PIXELS_PER_BEAT;
      const bottomBeat = (gridHeightRef.current - (scrollY - GRID_PAD_TOP) - viewH) / PIXELS_PER_BEAT;
      const from = Math.max(0, Math.floor((bottomBeat - CHUNK_BEATS) / CHUNK_BEATS) * CHUNK_BEATS);
      const to = Math.ceil((topBeat + CHUNK_BEATS) / CHUNK_BEATS) * CHUNK_BEATS;
      setRange((prev) => (prev.from === from && prev.to === to ? prev : { from, to }));
    },
    []
  );

  const handleGridScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = e.nativeEvent.contentOffset.y;
    updateRange(e.nativeEvent.contentOffset.y);
  };

  const handleViewportLayout = (e: LayoutChangeEvent) => {
    viewportHeightRef.current = e.nativeEvent.layout.height || 600;
  };

  // On leaving: stop audio and flush any pending save
  useEffect(() => {
    return () => {
      audioService.stop();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        storageService.saveSong(buildSong()).catch((err) => console.warn('Final save failed:', err));
      }
    };
  }, [buildSong]);

  // Stop the preview when switching tabs
  useFocusEffect(
    useCallback(
      () => () => {
        audioService.stop();
        setIsPlayingPreview(false);
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      },
      []
    )
  );

  /* ------------------------------ history ----------------------------- */

  /** Applies an edit and records the previous state for undo. */
  const commit = (next: Partial<Snapshot>) => {
    pastRef.current.push({ tiles, bpm });
    if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
    futureRef.current = [];
    if (next.tiles) setTiles(next.tiles);
    if (next.bpm !== undefined) setBpm(next.bpm);
    setHistoryVersion((v) => v + 1);
  };

  const restore = (snap: Snapshot) => {
    setTiles(snap.tiles);
    setBpm(snap.bpm);
    if (selectedTileId && !snap.tiles.some((t) => t.id === selectedTileId)) setSelectedTileId(null);
    setHistoryVersion((v) => v + 1);
  };

  const handleUndo = () => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push({ tiles, bpm });
    restore(prev);
  };

  const handleRedo = () => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push({ tiles, bpm });
    restore(next);
  };

  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  /* ------------------------------ preview ----------------------------- */

  const updatePreviewPlayhead = useCallback(() => {
    if (audioService.getIsPlaying()) {
      const cur = audioService.getCurrentTime();
      const y = gridHeightRef.current - cur * (latestRef.current.bpm / 60) * PIXELS_PER_BEAT;
      playheadY.value = y;
      scrollViewRef.current?.scrollTo({ y: Math.max(0, y + GRID_PAD_TOP - 200), animated: false });
      animFrameRef.current = requestAnimationFrame(updatePreviewPlayhead);
    } else {
      setIsPlayingPreview(false);
    }
  }, [playheadY]);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const handleTogglePreview = async () => {
    if (isPlayingPreview) {
      audioService.pause();
      setIsPlayingPreview(false);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }
    try {
      const uri = await storageService.getAudioUriForSong(song);
      await audioService.loadTrack(song.id, uri, bpm, song.durationSeconds);
      // Start from the marker set on the ruler
      audioService.play((previewStartBeat * 60) / bpm);
      setIsPlayingPreview(true);
      animFrameRef.current = requestAnimationFrame(updatePreviewPlayhead);
    } catch (err) {
      console.warn('Preview playback failed:', err);
      showToast("Could not play this song's audio.");
    }
  };

  const handlePlayBeatmap = async () => {
    // A song with no notes would start a game that never ends
    if (tiles.length === 0) {
      showToast('Add some notes before playing');
      return;
    }
    // Stop the Test preview so it doesn't keep playing under the game
    audioService.stop();
    setIsPlayingPreview(false);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    await saveNow(); // the game reads the beatmap from storage
    router.push(`/play/${song.id}`);
  };

  const handleBack = async () => {
    audioService.stop();
    if (saveTimerRef.current) await saveNow();
    onBack();
  };

  /* ------------------------------ editing ----------------------------- */

  /** Start of the next note in `lane` after `beat` (or the end of the grid). */
  const nextNoteStart = (lane: Lane, beat: number, ignoreId?: string) =>
    tiles
      .filter((t) => t.lane === lane && t.id !== ignoreId && t.beat > beat)
      .reduce((min, t) => Math.min(min, t.beat), totalBeats);

  const handleGridSlotPress = (lane: Lane, beat: number) => {
    const cell = activeSubdivision;
    // Strict grid: a tap inside any note's footprint targets that note
    const existing = tiles.find(
      (t) => t.lane === lane && beat >= t.beat - 1e-6 && beat < noteEnd(t, cell) - 1e-6
    );

    if (existing) {
      if (selectedTileId === existing.id) {
        commit({ tiles: tiles.filter((t) => t.id !== existing.id) });
        setSelectedTileId(null);
      } else {
        setSelectedTileId(existing.id);
      }
      return;
    }

    // Holds are clamped so they never run into the next note in the lane
    const room = nextNoteStart(lane, beat) - beat;
    if (room < cell - 1e-6) return; // no free cell here
    const durationBeats =
      noteType === 'hold' ? Math.max(cell, Math.min(DEFAULT_HOLD_BEATS, room)) : 0;
    const newTile: TileNote = {
      id: `tile_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      lane,
      beat,
      durationBeats,
    };
    commit({ tiles: [...tiles, newTile] });
    setSelectedTileId(newTile.id);
  };

  /** Single touch layer: converts the tap position into a lane and snapped beat. */
  const handleGridPress = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    const lane = Math.max(0, Math.min(3, Math.floor((locationX / lanesWidthRef.current) * 4))) as Lane;
    const slotHeight = PIXELS_PER_BEAT * activeSubdivision;
    const slotIndex = Math.floor((gridHeight - locationY) / slotHeight);
    const beat = Math.max(0, Math.min(totalBeats - activeSubdivision, slotIndex * activeSubdivision));
    handleGridSlotPress(lane, snapToGrid(beat, activeSubdivision));
  };

  const handleLanesLayout = (e: LayoutChangeEvent) => {
    lanesWidthRef.current = e.nativeEvent.layout.width || 1;
  };

  const handleSelectTile = useCallback((id: string) => setSelectedTileId(id), []);

  /** Switches the note type for new notes, and converts the selected note too. */
  const handleSelectNoteType = (type: NoteType) => {
    setNoteType(type);
    const target = tiles.find((t) => t.id === selectedTileId);
    if (!target) return;
    if (type === 'tap' && target.durationBeats === 0) return;
    if (type === 'hold' && target.durationBeats > 0) return;
    const room = nextNoteStart(target.lane, target.beat, target.id) - target.beat;
    const durationBeats =
      type === 'tap' ? 0 : Math.max(activeSubdivision, Math.min(DEFAULT_HOLD_BEATS, room));
    commit({ tiles: tiles.map((t) => (t.id === target.id ? { ...t, durationBeats } : t)) });
  };

  /** Lengthens/shortens the selected hold by one grid cell, never overlapping the next note. */
  const handleStepSelectedDuration = (direction: 1 | -1) => {
    const target = tiles.find((t) => t.id === selectedTileId);
    if (!target) return;
    const cell = activeSubdivision;
    const room = nextNoteStart(target.lane, target.beat, target.id) - target.beat;
    const next = Math.round((target.durationBeats + direction * cell) / cell) * cell;
    // Shrinking below one cell turns the hold back into a tap note
    const durationBeats = next < cell - 1e-6 ? 0 : Math.min(next, room);
    if (durationBeats === target.durationBeats) return;
    commit({ tiles: tiles.map((t) => (t.id === target.id ? { ...t, durationBeats } : t)) });
  };

  const handleDeleteSelected = () => {
    if (!selectedTileId) return;
    commit({ tiles: tiles.filter((t) => t.id !== selectedTileId) });
    setSelectedTileId(null);
  };

  /** Changes the song's tempo. */
  const handleStepBpm = (delta: number) => {
    const next = clampBpm(bpm + delta);
    if (next !== bpm) commit({ bpm: next });
  };

  // Typed BPM: a text draft that is validated when editing ends
  const [bpmDraft, setBpmDraft] = useState<string>(String(song.bpm));
  const [isEditingBpm, setIsEditingBpm] = useState(false);
  const bpmEditingRef = useRef(false); // end/submit/blur can all fire; handle once

  // Keep the field in sync when BPM changes another way (+/−, undo, redo)
  useEffect(() => {
    if (!isEditingBpm) setBpmDraft(String(bpm));
  }, [bpm, isEditingBpm]);

  /** Digits only, max 3 characters — letters, minus signs, dots etc. are dropped. */
  const handleBpmTyping = (text: string) => {
    setBpmDraft(text.replace(/[^0-9]/g, '').slice(0, 3));
  };

  const handleBpmCommit = () => {
    if (!bpmEditingRef.current) return;
    bpmEditingRef.current = false;
    setIsEditingBpm(false);
    const parsed = parseInt(bpmDraft, 10);
    if (!bpmDraft || Number.isNaN(parsed)) {
      setBpmDraft(String(bpm)); // empty or invalid: keep the previous tempo
      return;
    }
    const next = clampBpm(parsed);
    if (next !== parsed) {
      showToast(`BPM must be ${MIN_BPM}–${MAX_BPM} — set to ${next}`);
    }
    setBpmDraft(String(next));
    if (next !== bpm) commit({ bpm: next });
  };

  /** Ruler tap: moves the point where "Test" starts playing from. */
  const handleRulerPress = useCallback(
    (e: GestureResponderEvent) => {
      const cellPx = PIXELS_PER_BEAT * activeSubdivision;
      const index = Math.floor((gridHeightRef.current - e.nativeEvent.locationY) / cellPx);
      const beat = Math.max(0, Math.min(gridHeightRef.current / PIXELS_PER_BEAT - activeSubdivision, index * activeSubdivision));
      setPreviewStartBeat(beat);
      if (!isPlayingPreview) playheadY.value = beatToY(beat, gridHeightRef.current);
    },
    [activeSubdivision, isPlayingPreview, playheadY]
  );

  const selectedTile = tiles.find((t) => t.id === selectedTileId);

  // Only notes inside the visible window are mounted
  const visibleTiles = useMemo(
    () =>
      tiles.filter(
        (t) => noteEnd(t, activeSubdivision) >= range.from && t.beat <= range.to
      ),
    [tiles, range, activeSubdivision]
  );

  // When the grid's length changes (song length measured, BPM changed), keep
  // the same beats on screen: the grid grows at the top, so shift the scroll.
  const prevGridHeightRef = useRef(gridHeight);
  const scrollYRef = useRef(0);
  useEffect(() => {
    const delta = gridHeight - prevGridHeightRef.current;
    prevGridHeightRef.current = gridHeight;
    if (delta === 0) return;
    const y = Math.max(0, scrollYRef.current + delta);
    scrollViewRef.current?.scrollTo({ y, animated: false });
    scrollYRef.current = y;
    updateRange(y);
    if (!isPlayingPreview) playheadY.value = beatToY(previewStartBeat, gridHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridHeight]);
  const beatsPerMeasure = song.timeSignature?.beatsPerMeasure || 4;

  return (
    <ScreenView style={[styles.safeArea, { backgroundColor: ACTIVE_THEME.ui.appBackground }]}>
      {/* Top Header */}
      <Animated.View
        entering={FadeIn.duration(250)}
        style={[styles.header, { borderBottomColor: ACTIVE_THEME.ui.cardBorder }]}
      >
        {/* Row 1: back · Play (centered) · undo / redo */}
        <View style={styles.topBar}>
          <PressableScale scaleTo={0.9} style={styles.backBtn} onPress={handleBack} accessibilityLabel="Back to song list">
            <PixelIcon name="chevronLeft" size={14} color="#cdd6ea" />
            <Text style={styles.backText}>Songs</Text>
          </PressableScale>

          <View style={styles.topBarCenter} pointerEvents="box-none">
            <PressableScale style={styles.playCenterBtn} onPress={handlePlayBeatmap} accessibilityLabel="Play Beatmap">
              <PixelIcon name="play" size={14} color="#ffffff" />
              <Text style={styles.playCenterText}>PLAY</Text>
            </PressableScale>
          </View>

          <View style={styles.historyGroup}>
            <PressableScale
              scaleTo={0.85}
              disabled={!canUndo}
              style={[styles.iconBtn, !canUndo && styles.iconBtnDisabled]}
              onPress={handleUndo}
              accessibilityLabel="Undo"
            >
              <PixelIcon name="undo" size={14} color="#e6ecf7" />
            </PressableScale>
            <PressableScale
              scaleTo={0.85}
              disabled={!canRedo}
              style={[styles.iconBtn, !canRedo && styles.iconBtnDisabled]}
              onPress={handleRedo}
              accessibilityLabel="Redo"
            >
              <PixelIcon name="redo" size={14} color="#e6ecf7" />
            </PressableScale>
          </View>
        </View>

        {/* Row 2: song + tempo + test */}
        <View style={styles.headerControlsRow}>
          <View style={styles.songSelectorBox}>
            <Text style={styles.selectedSongTitle} numberOfLines={1}>
              {song.title}
            </Text>
            <View style={styles.bpmControl}>
              <PressableScale scaleTo={0.85} style={styles.bpmBtn} onPress={() => handleStepBpm(-1)} accessibilityLabel="Decrease BPM">
                <PixelIcon name="minus" size={14} color="#cdd6ea" />
              </PressableScale>
              <TextInput
                value={bpmDraft}
                onChangeText={handleBpmTyping}
                onFocus={() => {
                  bpmEditingRef.current = true;
                  setIsEditingBpm(true);
                }}
                onEndEditing={handleBpmCommit}
                onSubmitEditing={handleBpmCommit}
                onBlur={handleBpmCommit}
                keyboardType="number-pad"
                inputMode="numeric"
                returnKeyType="done"
                maxLength={3}
                selectTextOnFocus
                style={styles.bpmText}
                accessibilityLabel="BPM"
              />
              <PressableScale scaleTo={0.85} style={styles.bpmBtn} onPress={() => handleStepBpm(1)} accessibilityLabel="Increase BPM">
                <PixelIcon name="plus" size={14} color="#cdd6ea" />
              </PressableScale>
            </View>
          </View>

          <PressableScale
            style={[styles.previewBtn, isPlayingPreview && styles.previewBtnActive]}
            onPress={handleTogglePreview}
            accessibilityLabel={isPlayingPreview ? 'Pause Audio Preview' : 'Play Audio Preview'}
          >
            {isPlayingPreview ? <PixelIcon name="pause" size={14} color="#000000" /> : <PixelIcon name="play" size={14} color="#4d8dff" />}
            <Text style={[styles.previewBtnText, isPlayingPreview && { color: '#000000' }]}>
              {isPlayingPreview ? 'Pause' : 'Test'}
            </Text>
          </PressableScale>
        </View>

        {/* Row 3: snap + note type */}
        <View style={styles.subdivisionsRow}>
          <View style={styles.snapButtonsGroup}>
            <Text style={styles.snapLabel}>SNAP:</Text>
            {([1.0, 0.5, 0.25] as const).map((sub) => (
              <PressableScale
                key={sub}
                scaleTo={0.9}
                onPress={() => setActiveSubdivision(sub)}
                style={[styles.snapBadge, activeSubdivision === sub && styles.snapBadgeActive]}
              >
                <Text style={[styles.snapBadgeText, activeSubdivision === sub && styles.snapBadgeTextActive]}>
                  {sub === 1 ? '1/1' : sub === 0.5 ? '1/2' : '1/4'}
                </Text>
              </PressableScale>
            ))}
          </View>

          <View style={styles.segmented}>
            {(['tap', 'hold'] as const).map((type) => {
              const active = noteType === type;
              return (
                <PressableScale
                  key={type}
                  scaleTo={0.94}
                  onPress={() => handleSelectNoteType(type)}
                  style={[styles.segment, active && styles.segmentActive]}
                  accessibilityLabel={type === 'tap' ? 'Place tap notes' : 'Place hold notes'}
                >
                  <View style={[styles.segmentIcon, type === 'hold' && styles.segmentIconHold, active && styles.segmentIconActive]} />
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {type === 'tap' ? 'Tap' : 'Hold'}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>

        {/* Row 4: status + test start */}
        <View style={styles.noteTypeRow}>
          <Text style={styles.notesCounterText}>{tiles.length} notes</Text>
          <Text
            style={[
              styles.saveStatusText,
              saveStatus === 'saving' && styles.saveStatusSaving,
              saveStatus === 'error' && styles.saveStatusError,
            ]}
          >
            {saveStatus === 'saving' ? '· saving…' : saveStatus === 'error' ? '· not saved!' : '· saved'}
          </Text>
          <View style={styles.flexSpacer} />
          {/* Where "Test" starts — tap the ruler numbers to move it */}
          <PressableScale
            scaleTo={0.92}
            style={styles.startChip}
            onPress={() => {
              setPreviewStartBeat(0);
              if (!isPlayingPreview) playheadY.value = gridHeight;
            }}
            accessibilityLabel="Reset test start to the beginning"
          >
            <PixelIcon name="play" size={7} color="#4d8dff" />
            <Text style={styles.startChipText}>
              Test from {previewStartBeat === 0 ? 'start' : `b${previewStartBeat}`}
            </Text>
            {previewStartBeat !== 0 && <PixelIcon name="reset" size={14} color="#4d8dff" />}
          </PressableScale>
        </View>
      </Animated.View>

      <View style={styles.gridContainer}>
        {/* 4-Lane Vertical Musical Beat Grid */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.gridScroll}
          contentContainerStyle={{
            height: gridHeight + GRID_PAD_TOP + GRID_PAD_BOTTOM,
            paddingTop: GRID_PAD_TOP,
            paddingBottom: GRID_PAD_BOTTOM,
          }}
          onScroll={handleGridScroll}
          scrollEventThrottle={32}
          onLayout={handleViewportLayout}
        >
          <View style={styles.gridRow}>
            <View>
              <Ruler beatsPerMeasure={beatsPerMeasure} totalBeats={totalBeats} range={range} onPressBeat={handleRulerPress} />
              {/* Test start flag on the ruler */}
              <View pointerEvents="none" style={[styles.startFlag, { top: Math.min(beatToY(previewStartBeat, gridHeight) - 7, gridHeight - 15) }]}>
                <PixelIcon name="play" size={7} color="#0b1a33" />
              </View>
            </View>

            <View style={[styles.lanesArea, { height: gridHeight }]} onLayout={handleLanesLayout}>
              <GridGuides beatsPerMeasure={beatsPerMeasure} subdivision={activeSubdivision} totalBeats={totalBeats} range={range} />

              {/* One touch target for the whole grid instead of hundreds of slots */}
              <Pressable style={StyleSheet.absoluteFill} onPress={handleGridPress} />

              {visibleTiles.map((tile) => (
                <EditorTile
                  key={tile.id}
                  tile={tile}
                  cell={activeSubdivision}
                  gridHeight={gridHeight}
                  isSelected={selectedTileId === tile.id}
                  onSelect={handleSelectTile}
                />
              ))}

              {/* Test start line */}
              <View pointerEvents="none" style={[styles.startLine, { top: beatToY(previewStartBeat, gridHeight) - 1 }]} />

              {/* Moving Playhead Line */}
              {isPlayingPreview && (
                <Animated.View
                  entering={FadeIn.duration(150)}
                  pointerEvents="none"
                  style={[styles.playheadLine, playheadStyle]}
                />
              )}
            </View>
          </View>
        </ScrollView>

        {/* Selected Tile Inspector (floats over the grid, so the grid doesn't jump) */}
        {selectedTile && (
          <Animated.View entering={FadeInUp.duration(180)} exiting={FadeOutUp.duration(150)} style={styles.inspectorBar}>
            <View style={styles.inspectorInfo}>
              <Text style={styles.inspectorTitle}>
                {selectedTile.durationBeats > 0 ? 'HOLD NOTE' : 'TAP NOTE'}
              </Text>
              <Text style={styles.inspectorSub}>
                Lane {selectedTile.lane + 1} · Beat {selectedTile.beat}
              </Text>
            </View>

            <View style={styles.inspectorDurationControls}>
              <PressableScale style={styles.stepBtn} scaleTo={0.85} onPress={() => handleStepSelectedDuration(-1)}>
                <PixelIcon name="minus" size={14} color="#ffffff" />
              </PressableScale>
              <Text style={styles.stepValueText}>{selectedTile.durationBeats}b</Text>
              <PressableScale style={styles.stepBtn} scaleTo={0.85} onPress={() => handleStepSelectedDuration(1)}>
                <PixelIcon name="plus" size={14} color="#ffffff" />
              </PressableScale>
              <PressableScale style={styles.deleteTileBtn} scaleTo={0.85} onPress={handleDeleteSelected}>
                <PixelIcon name="trash" size={14} color="#FF6B4A" />
              </PressableScale>
            </View>
          </Animated.View>
        )}

        {/* Toast */}
        {toast && (
          <Animated.View entering={FadeInUp.springify().damping(16)} exiting={FadeOutUp.duration(200)} style={styles.toastCard}>
            <PixelIcon name="check" size={14} color="#4d8dff" />
            <Text style={styles.toastText}>{toast}</Text>
          </Animated.View>
        )}
      </View>
    </ScreenView>
  );
}

/* ------------------------------------------------------------------------ *
 * Editor tab: song picker → beatmap editor.
 * ------------------------------------------------------------------------ */

export default function EditorScreen() {
  // `t` changes on every "Edit" tap from the Songs tab so the same song can be reopened
  const params = useLocalSearchParams<{ songId?: string; t?: string }>();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const handledRequestRef = useRef<string | null>(null);

  // Reload songs whenever the tab gains focus (songs may have been added on
  // the Songs tab). Open a song directly when navigated here with ?songId=.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      storageService
        .getSongs()
        .then((list) => {
          if (cancelled) return;
          setSongs(list);
          setLoaded(true);
          const request = params.songId ? `${params.songId}:${params.t ?? ''}` : null;
          if (request && request !== handledRequestRef.current && list.some((s) => s.id === params.songId)) {
            handledRequestRef.current = request;
            setEditingId(params.songId!);
          }
        })
        .catch((err) => console.warn('Failed to load songs:', err));
      return () => {
        cancelled = true;
      };
    }, [params.songId, params.t])
  );

  const handleSaved = useCallback((updated: Song) => {
    setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  const editingSong = editingId ? songs.find((s) => s.id === editingId) : undefined;

  if (editingSong) {
    return (
      <BeatmapEditor
        key={editingSong.id}
        song={editingSong}
        onBack={() => setEditingId(null)}
        onSaved={handleSaved}
      />
    );
  }

  return <SongPicker songs={songs} loaded={loaded} onPick={setEditingId} />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#9aa7c2',
    fontFamily: FONTS.body,
    fontSize: 20,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 2,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    minHeight: 36,
  },
  topBarCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingRight: 8,
    zIndex: 1,
  },
  backText: {
    color: '#cdd6ea',
    fontFamily: FONTS.body,
    fontSize: 19,
  },
  playCenterBtn: {
    height: 36,
    minWidth: 104,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF6B4A',
    // Pixel bevel: light top/left, dark bottom/right
    borderWidth: 3,
    borderTopColor: '#ff9a82',
    borderLeftColor: '#ff9a82',
    borderBottomColor: '#a83a22',
    borderRightColor: '#a83a22',
  },
  playCenterText: {
    color: '#ffffff',
    fontFamily: FONTS.pixel,
    fontSize: 11,
    lineHeight: 14,
    includeFontPadding: false,
    textAlignVertical: 'center',
    // Press Start 2P sits slightly high; nudge it to the optical centre
    marginTop: 2,
  },
  historyGroup: {
    flexDirection: 'row',
    gap: 6,
    zIndex: 1,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 0,
    backgroundColor: '#15203a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDisabled: {
    opacity: 0.35,
  },
  saveStatusText: {
    color: '#4d8dff',
    fontFamily: FONTS.body,
    fontSize: 16,
    marginLeft: 4,
  },
  saveStatusSaving: {
    color: '#9aa7c2',
  },
  saveStatusError: {
    color: '#FF6B4A',
    fontWeight: 'bold',
  },
  pickerHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  pickerTitle: {
    color: '#ffffff',
    fontFamily: FONTS.pixel,
    fontSize: 14,
    letterSpacing: 0,
  },
  pickerSub: {
    color: '#9aa7c2',
    fontFamily: FONTS.body,
    fontSize: 17,
    marginTop: 2,
  },
  pickerList: {
    padding: 16,
    paddingTop: 4,
    gap: 10,
  },
  pickerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: '#15203a',
    backgroundColor: '#0b1220',
  },
  pickerIcon: {
    width: 40,
    height: 40,
    borderRadius: 0,
    backgroundColor: 'rgba(77, 141, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerInfo: {
    flex: 1,
  },
  pickerSongTitle: {
    color: '#ffffff',
    fontFamily: FONTS.body,
    fontSize: 20,
  },
  pickerMeta: {
    color: '#9aa7c2',
    fontFamily: FONTS.body,
    fontSize: 16,
    marginTop: 2,
  },
  headerControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  songSelectorBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0b1220',
    borderWidth: 2,
    borderColor: '#1f2e52',
    borderRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  selectedSongTitle: {
    color: '#ffffff',
    fontFamily: FONTS.body,
    fontSize: 17,
    flex: 1,
    marginRight: 6,
  },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#15203a',
    borderWidth: 2,
    borderColor: '#1f2e52',
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  previewBtnActive: {
    backgroundColor: '#FF6B4A',
    borderColor: '#FF6B4A',
  },
  previewBtnText: {
    color: '#4d8dff',
    fontFamily: FONTS.body,
    fontSize: 17,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FF6B4A',
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  saveBtnText: {
    color: '#ffffff',
    fontFamily: FONTS.body,
    fontSize: 17,
  },
  subdivisionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  snapButtonsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  snapLabel: {
    fontFamily: FONTS.body,
    fontSize: 15,
    color: '#6b7a99',
    marginRight: 4,
  },
  snapBadge: {
    backgroundColor: '#0b1220',
    borderWidth: 2,
    borderColor: '#15203a',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 0,
  },
  snapBadgeActive: {
    backgroundColor: 'rgba(77, 141, 255, 0.2)',
    borderColor: '#4d8dff',
  },
  snapBadgeText: {
    color: '#9aa7c2',
    fontFamily: FONTS.body,
    fontSize: 16,
  },
  snapBadgeTextActive: {
    color: '#4d8dff',
    fontWeight: 'bold',
  },
  noteTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#0b1220',
    borderWidth: 2,
    borderColor: '#15203a',
    borderRadius: 0,
    padding: 2,
    gap: 2,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 0,
  },
  segmentActive: {
    backgroundColor: 'rgba(77, 141, 255, 0.2)',
  },
  segmentIcon: {
    width: 10,
    height: 6,
    borderRadius: 0,
    backgroundColor: '#3a4a70',
  },
  segmentIconHold: {
    height: 12,
  },
  segmentIconActive: {
    backgroundColor: '#4d8dff',
  },
  segmentText: {
    color: '#9aa7c2',
    fontFamily: FONTS.body,
    fontSize: 16,
  },
  segmentTextActive: {
    color: '#4d8dff',
    fontWeight: 'bold',
  },
  noteTypeHint: {
    flex: 1,
    textAlign: 'right',
    color: '#6b7a99',
    fontFamily: FONTS.body,
    fontSize: 15,
  },
  notesCounterText: {
    color: '#cdd6ea',
    fontFamily: FONTS.body,
    fontSize: 16,
  },
  gridContainer: {
    overflow: 'hidden', // grid content never draws under the header or tab bar
    flex: 1,
  },
  inspectorBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    elevation: 8,
    backgroundColor: 'rgba(58, 26, 18, 0.94)',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(217, 80, 47, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inspectorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inspectorTitle: {
    color: '#4d8dff',
    fontFamily: FONTS.body,
    fontSize: 17,
  },
  inspectorSub: {
    color: '#9aa7c2',
    fontFamily: FONTS.body,
    fontSize: 16,
  },
  inspectorDurationControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepBtn: {
    backgroundColor: '#15203a',
    padding: 6,
    borderRadius: 0,
  },
  stepValueText: {
    color: '#ffffff',
    fontFamily: FONTS.body,
    fontSize: 16,
    width: 28,
    textAlign: 'center',
  },
  deleteTileBtn: {
    padding: 4,
    marginLeft: 4,
  },
  toastCard: {
    position: 'absolute',
    top: 52,
    alignSelf: 'center',
    zIndex: 50,
    backgroundColor: '#0b1a33',
    borderWidth: 2,
    borderColor: '#4d8dff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toastText: {
    color: '#4d8dff',
    fontFamily: FONTS.body,
    fontSize: 16,
  },
  gridScroll: {
    flex: 1,
    backgroundColor: '#05070d',
  },
  gridRow: {
    flexDirection: 'row',
  },
  rulerColumn: {
    width: 44,
    borderRightWidth: 2,
    borderRightColor: '#15203a',
  },
  rulerMark: {
    position: 'absolute',
    left: 0,
    right: 4,
    alignItems: 'flex-end',
  },
  barlineText: {
    color: '#4d8dff',
    fontFamily: FONTS.body,
    fontSize: 15,
  },
  beatNumText: {
    color: '#3a4a70',
    fontFamily: FONTS.body,
    fontSize: 13,
  },
  lanesArea: {
    flex: 1,
    flexDirection: 'row',
    position: 'relative',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  barlineGridLine: {
    borderTopWidth: 2,
    borderTopColor: 'rgba(77, 141, 255, 0.4)',
  },
  beatGridLine: {
    borderTopWidth: 2,
    borderTopColor: '#15203a',
  },
  laneColumnsRow: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
  },
  editorLaneColumn: {
    flex: 1,
    borderRightWidth: 2,
    borderRightColor: '#15203a',
  },
  tileBevel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  gridTile: {
    position: 'absolute',
    borderRadius: 0,
    marginHorizontal: TILE_GAP,
    paddingHorizontal: 4,
    paddingVertical: 2,
    justifyContent: 'space-between',
  },
  gridTileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  gridTileLabel: {
    color: '#ffffff',
    fontFamily: FONTS.body,
    fontSize: 13,
  },
  gridTileBeat: {
    color: '#c4d9ff',
    fontFamily: FONTS.body,
    fontSize: 12,
  },
  gridTileDuration: {
    color: '#e3edff',
    fontFamily: FONTS.body,
    fontSize: 13,
    textAlign: 'center',
  },
  gridTileAnchor: {
    height: 3,
    backgroundColor: '#ffffff',
    borderRadius: 0,
    opacity: 0.6,
  },
  cellGridLine: {
    borderTopWidth: 2,
    borderTopColor: 'rgba(21, 32, 58, 0.45)',
  },
  startLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#4d8dff',
    opacity: 0.85,
  },
  startFlag: {
    position: 'absolute',
    left: 3, // labels are right-aligned, so the flag lives on the left
    width: 14,
    height: 14,
    borderRadius: 0,
    backgroundColor: '#4d8dff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flexSpacer: {
    flex: 1,
  },
  startChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(77, 141, 255, 0.12)',
    borderWidth: 2,
    borderColor: 'rgba(77, 141, 255, 0.4)',
    borderRadius: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  startChipText: {
    color: '#4d8dff',
    fontFamily: FONTS.body,
    fontSize: 15,
  },
  bpmControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bpmBtn: {
    width: 20,
    height: 20,
    borderRadius: 0,
    backgroundColor: '#15203a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bpmText: {
    color: '#4d8dff',
    fontFamily: FONTS.body,
    fontSize: 16,
    minWidth: 34,
    paddingVertical: 2,
    paddingHorizontal: 2,
    borderRadius: 0,
    backgroundColor: '#070b14',
    textAlign: 'center',
  },
  playheadLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#FF6B4A',
  },
  footer: {
    padding: 12,
    borderTopWidth: 2,
    backgroundColor: '#0b1220',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerTipText: {
    color: '#9aa7c2',
    fontFamily: FONTS.body,
    fontSize: 16,
    flex: 1,
    marginRight: 8,
  },
  playBeatmapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF6B4A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 0,
  },
  playBeatmapBtnText: {
    color: '#ffffff',
    fontFamily: FONTS.body,
    fontSize: 17,
  },
});
