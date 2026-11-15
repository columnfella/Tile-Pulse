import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
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
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { ScreenView } from '../../src/components/ui/ScreenView';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Song, TileNote } from '../../types/song';
import { storageService } from '../../services/storage';
import { audioService } from '../../services/audio';
import { ACTIVE_THEME } from '../../constants/theme';
import { snapToGrid, getMeasureInfo } from '../../src/game/engine';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { listItemIn } from '../../src/components/ui/motion';
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Music2,
  Undo2,
  Redo2,
  Trash2,
  RotateCcw,
  Plus,
  Minus,
  Check,
} from 'lucide-react-native';

const PIXELS_PER_BEAT = 96; // 1/4 snap cells are 24px, 1/2 cells 48px
const TOTAL_BEATS = 48;
const GRID_HEIGHT = TOTAL_BEATS * PIXELS_PER_BEAT;
const TILE_GAP = 2; // px inset so neighbouring notes never visually touch
const DEFAULT_HOLD_BEATS = 1;
const MIN_BPM = 40;
const MAX_BPM = 300;
/** Clamps any number to a playable tempo (handles 0, negatives, NaN, huge values). */
const clampBpm = (value: number) =>
  Number.isFinite(value) ? Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(value))) : 120;
const BEAT_INDICES = Array.from({ length: TOTAL_BEATS + 1 }, (_, i) => i);

type Lane = 0 | 1 | 2 | 3;
type NoteType = 'tap' | 'hold';


/* ------------------------------------------------------------------------ *
 * Performance notes
 * The grid used to be ~800 individual Pressables re-rendered on every tap and
 * on every animation frame during preview. Now:
 *  - the static ruler / guide lines are memoized and only depend on the time
 *    signature,
 *  - a single touch layer maps a tap's position to (lane, beat),
 *  - tiles are memoized so only the changed tile re-renders,
 *  - the preview playhead moves via a Reanimated shared value (no React
 *    re-render per frame).
 * ------------------------------------------------------------------------ */

/** Beat → y of the *bottom* edge of that beat's cell (beat 0 is at the bottom). */
const beatToY = (beat: number) => GRID_HEIGHT - beat * PIXELS_PER_BEAT;

/** A note's footprint on the grid: [start, end) in beats. */
const noteEnd = (t: TileNote, cell: number) => t.beat + (t.durationBeats > 0 ? t.durationBeats : cell);

interface RulerProps {
  beatsPerMeasure: number;
  /** Tap the ruler to move the Test start point. */
  onPressBeat: (e: GestureResponderEvent) => void;
}

const Ruler = memo(function Ruler({ beatsPerMeasure, onPressBeat }: RulerProps) {
  return (
    <Pressable onPress={onPressBeat} style={[styles.rulerColumn, { height: GRID_HEIGHT }]}>
      {BEAT_INDICES.map((beatIdx) => {
        const beat = TOTAL_BEATS - beatIdx;
        const { measure, isBarline } = getMeasureInfo(beat, beatsPerMeasure);
        return (
          <View
            key={beat}
            pointerEvents="none"
            style={[styles.rulerMark, { top: beatIdx * PIXELS_PER_BEAT - 14 }]}
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
}

/** Strict grid: beat/bar lines plus faint lines for the current snap size. */
const GridGuides = memo(function GridGuides({ beatsPerMeasure, subdivision }: GridGuidesProps) {
  const cellsPerBeat = Math.round(1 / subdivision);
  const cellLines: number[] = [];
  if (cellsPerBeat > 1) {
    for (let i = 0; i < TOTAL_BEATS * cellsPerBeat; i++) {
      if (i % cellsPerBeat !== 0) cellLines.push(i * subdivision);
    }
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {cellLines.map((beat) => (
        <View key={`c${beat}`} style={[styles.gridLine, styles.cellGridLine, { top: beatToY(beat) }]} />
      ))}
      {BEAT_INDICES.map((beatIdx) => {
        const beat = TOTAL_BEATS - beatIdx;
        const { isBarline } = getMeasureInfo(beat, beatsPerMeasure);
        return (
          <View
            key={beat}
            style={[
              styles.gridLine,
              { top: beatIdx * PIXELS_PER_BEAT },
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
  isSelected: boolean;
  onSelect: (id: string) => void;
}

/** A note drawn exactly inside its grid cells, with a small gap so notes never touch. */
const EditorTile = memo(function EditorTile({ tile, cell, isSelected, onSelect }: EditorTileProps) {
  const isHold = tile.durationBeats > 0;
  const top = beatToY(noteEnd(tile, cell)) + TILE_GAP;
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
          backgroundColor: isHold ? 'rgba(3, 105, 161, 0.75)' : '#0284c7',
          borderColor: isSelected ? '#ffffff' : '#38bdf8',
          borderWidth: isSelected ? 2 : 1,
        },
      ]}
    >
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
                    <Music2 size={18} color="#38bdf8" />
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
                  <ChevronRight size={18} color="#475569" />
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
  // Latest values for saving from timers / unmount
  const latestRef = useRef({ tiles, bpm });
  latestRef.current = { tiles, bpm };

  // Playhead position driven on the UI thread
  const playheadY = useSharedValue(GRID_HEIGHT);
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
      const y = GRID_HEIGHT - cur * (latestRef.current.bpm / 60) * PIXELS_PER_BEAT;
      playheadY.value = y;
      scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 200), animated: false });
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
      .reduce((min, t) => Math.min(min, t.beat), TOTAL_BEATS);

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
    const slotIndex = Math.floor((GRID_HEIGHT - locationY) / slotHeight);
    const beat = Math.max(0, Math.min(TOTAL_BEATS - activeSubdivision, slotIndex * activeSubdivision));
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
      const index = Math.floor((GRID_HEIGHT - e.nativeEvent.locationY) / cellPx);
      const beat = Math.max(0, Math.min(TOTAL_BEATS - activeSubdivision, index * activeSubdivision));
      setPreviewStartBeat(beat);
      if (!isPlayingPreview) playheadY.value = beatToY(beat);
    },
    [activeSubdivision, isPlayingPreview, playheadY]
  );

  const selectedTile = tiles.find((t) => t.id === selectedTileId);
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
            <ChevronLeft size={16} color="#cbd5e1" />
            <Text style={styles.backText}>Songs</Text>
          </PressableScale>

          <View style={styles.topBarCenter} pointerEvents="box-none">
            <PressableScale style={styles.playCenterBtn} onPress={handlePlayBeatmap} accessibilityLabel="Play Beatmap">
              <Play size={13} color="#ffffff" fill="#ffffff" />
              <Text style={styles.playCenterText}>Play</Text>
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
              <Undo2 size={16} color="#e2e8f0" />
            </PressableScale>
            <PressableScale
              scaleTo={0.85}
              disabled={!canRedo}
              style={[styles.iconBtn, !canRedo && styles.iconBtnDisabled]}
              onPress={handleRedo}
              accessibilityLabel="Redo"
            >
              <Redo2 size={16} color="#e2e8f0" />
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
                <Minus size={10} color="#cbd5e1" />
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
                <Plus size={10} color="#cbd5e1" />
              </PressableScale>
            </View>
          </View>

          <PressableScale
            style={[styles.previewBtn, isPlayingPreview && styles.previewBtnActive]}
            onPress={handleTogglePreview}
            accessibilityLabel={isPlayingPreview ? 'Pause Audio Preview' : 'Play Audio Preview'}
          >
            {isPlayingPreview ? <Pause size={13} color="#000000" /> : <Play size={13} color="#38bdf8" />}
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
              if (!isPlayingPreview) playheadY.value = GRID_HEIGHT;
            }}
            accessibilityLabel="Reset test start to the beginning"
          >
            <Play size={9} color="#4ade80" fill="#4ade80" />
            <Text style={styles.startChipText}>
              Test from {previewStartBeat === 0 ? 'start' : `b${previewStartBeat}`}
            </Text>
            {previewStartBeat !== 0 && <RotateCcw size={10} color="#4ade80" />}
          </PressableScale>
        </View>
      </Animated.View>

      <View style={styles.gridContainer}>
        {/* 4-Lane Vertical Musical Beat Grid */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.gridScroll}
          contentContainerStyle={{ height: GRID_HEIGHT }}
        >
          <View style={styles.gridRow}>
            <View>
              <Ruler beatsPerMeasure={beatsPerMeasure} onPressBeat={handleRulerPress} />
              {/* Test start flag on the ruler */}
              <View pointerEvents="none" style={[styles.startFlag, { top: Math.min(beatToY(previewStartBeat) - 7, GRID_HEIGHT - 15) }]}>
                <Play size={7} color="#052e16" fill="#052e16" />
              </View>
            </View>

            <View style={[styles.lanesArea, { height: GRID_HEIGHT }]} onLayout={handleLanesLayout}>
              <GridGuides beatsPerMeasure={beatsPerMeasure} subdivision={activeSubdivision} />

              {/* One touch target for the whole grid instead of hundreds of slots */}
              <Pressable style={StyleSheet.absoluteFill} onPress={handleGridPress} />

              {tiles.map((tile) => (
                <EditorTile
                  key={tile.id}
                  tile={tile}
                  cell={activeSubdivision}
                  isSelected={selectedTileId === tile.id}
                  onSelect={handleSelectTile}
                />
              ))}

              {/* Test start line */}
              <View pointerEvents="none" style={[styles.startLine, { top: beatToY(previewStartBeat) - 1 }]} />

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
                <Minus size={12} color="#ffffff" />
              </PressableScale>
              <Text style={styles.stepValueText}>{selectedTile.durationBeats}b</Text>
              <PressableScale style={styles.stepBtn} scaleTo={0.85} onPress={() => handleStepSelectedDuration(1)}>
                <Plus size={12} color="#ffffff" />
              </PressableScale>
              <PressableScale style={styles.deleteTileBtn} scaleTo={0.85} onPress={handleDeleteSelected}>
                <Trash2 size={13} color="#f87171" />
              </PressableScale>
            </View>
          </Animated.View>
        )}

        {/* Toast */}
        {toast && (
          <Animated.View entering={FadeInUp.springify().damping(16)} exiting={FadeOutUp.duration(200)} style={styles.toastCard}>
            <Check size={13} color="#4ade80" />
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
    color: '#94a3b8',
    fontSize: 14,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
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
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
  },
  playCenterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0284c7',
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: 20,
    shadowColor: '#38bdf8',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  playCenterText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  historyGroup: {
    flexDirection: 'row',
    gap: 6,
    zIndex: 1,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDisabled: {
    opacity: 0.35,
  },
  saveStatusText: {
    color: '#4ade80',
    fontSize: 11,
    marginLeft: 4,
  },
  saveStatusSaving: {
    color: '#94a3b8',
  },
  saveStatusError: {
    color: '#f87171',
    fontWeight: 'bold',
  },
  pickerHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  pickerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  pickerSub: {
    color: '#94a3b8',
    fontSize: 12,
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
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  pickerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerInfo: {
    flex: 1,
  },
  pickerSongTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  pickerMeta: {
    color: '#94a3b8',
    fontSize: 11,
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
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  selectedSongTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 6,
  },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  previewBtnActive: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  previewBtnText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0284c7',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
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
    fontSize: 10,
    color: '#64748b',
    fontWeight: 'bold',
    marginRight: 4,
  },
  snapBadge: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  snapBadgeActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38bdf8',
  },
  snapBadgeText: {
    color: '#94a3b8',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  snapBadgeTextActive: {
    color: '#38bdf8',
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
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  segmentActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
  },
  segmentIcon: {
    width: 10,
    height: 6,
    borderRadius: 2,
    backgroundColor: '#475569',
  },
  segmentIconHold: {
    height: 12,
  },
  segmentIconActive: {
    backgroundColor: '#38bdf8',
  },
  segmentText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#38bdf8',
    fontWeight: 'bold',
  },
  noteTypeHint: {
    flex: 1,
    textAlign: 'right',
    color: '#64748b',
    fontSize: 10,
  },
  notesCounterText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  gridContainer: {
    flex: 1,
  },
  inspectorBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    elevation: 8,
    backgroundColor: 'rgba(8, 47, 73, 0.94)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(3, 105, 161, 0.5)',
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
    color: '#38bdf8',
    fontWeight: 'bold',
    fontSize: 12,
  },
  inspectorSub: {
    color: '#94a3b8',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  inspectorDurationControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepBtn: {
    backgroundColor: '#1e293b',
    padding: 6,
    borderRadius: 6,
  },
  stepValueText: {
    color: '#ffffff',
    fontFamily: 'monospace',
    fontWeight: 'bold',
    fontSize: 11,
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
    backgroundColor: '#052e16',
    borderWidth: 1,
    borderColor: '#22c55e',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toastText: {
    color: '#4ade80',
    fontSize: 11,
    fontWeight: 'bold',
  },
  gridScroll: {
    flex: 1,
    backgroundColor: '#030712',
  },
  gridRow: {
    flexDirection: 'row',
  },
  rulerColumn: {
    width: 44,
    borderRightWidth: 1,
    borderRightColor: '#1e293b',
  },
  rulerMark: {
    position: 'absolute',
    left: 0,
    right: 4,
    alignItems: 'flex-end',
  },
  barlineText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  beatNumText: {
    color: '#475569',
    fontSize: 9,
    fontFamily: 'monospace',
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
    borderTopColor: 'rgba(56, 189, 248, 0.4)',
  },
  beatGridLine: {
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  laneColumnsRow: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
  },
  editorLaneColumn: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#1e293b',
  },
  gridTile: {
    position: 'absolute',
    borderRadius: 8,
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
    fontSize: 9,
    fontWeight: '900',
  },
  gridTileBeat: {
    color: '#bae6fd',
    fontSize: 8,
    fontFamily: 'monospace',
  },
  gridTileDuration: {
    color: '#e0f2fe',
    fontSize: 9,
    fontFamily: 'monospace',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  gridTileAnchor: {
    height: 3,
    backgroundColor: '#ffffff',
    borderRadius: 2,
    opacity: 0.6,
  },
  cellGridLine: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(30, 41, 59, 0.45)',
  },
  startLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#22c55e',
    opacity: 0.85,
  },
  startFlag: {
    position: 'absolute',
    left: 3, // labels are right-aligned, so the flag lives on the left
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22c55e',
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
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.4)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  startChipText: {
    color: '#4ade80',
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  bpmControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bpmBtn: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bpmText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    minWidth: 34,
    paddingVertical: 2,
    paddingHorizontal: 2,
    borderRadius: 5,
    backgroundColor: '#020617',
    textAlign: 'center',
  },
  playheadLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#f59e0b',
  },
  footer: {
    padding: 12,
    borderTopWidth: 1,
    backgroundColor: '#0f172a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerTipText: {
    color: '#94a3b8',
    fontSize: 11,
    flex: 1,
    marginRight: 8,
  },
  playBeatmapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  playBeatmapBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
