import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  SafeAreaView,
  Dimensions,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Song, TileNote } from '../../types/song';
import { storageService } from '../../services/storage';
import { audioService } from '../../services/audio';
import { ACTIVE_THEME } from '../../constants/theme';
import { snapToGrid, getMeasureInfo } from '../../src/game/engine';
import {
  Play,
  Pause,
  Save,
  Trash2,
  ChevronDown,
  Plus,
  Minus,
  Check,
} from 'lucide-react';

export default function EditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ songId?: string }>();

  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedSongId, setSelectedSongId] = useState<string>(params.songId || '');
  const [tiles, setTiles] = useState<TileNote[]>([]);
  const [activeSubdivision, setActiveSubdivision] = useState<number>(0.5);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);
  const [previewAudioTime, setPreviewAudioTime] = useState<number>(0);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const scrollViewRef = useRef<any>(null);
  const animFrameRef = useRef<number | null>(null);

  const PIXELS_PER_BEAT = 80;
  const TOTAL_BEATS = 48;
  const gridHeight = TOTAL_BEATS * PIXELS_PER_BEAT;

  // Load songs from storage
  useEffect(() => {
    async function load() {
      const list = await storageService.getSongs();
      setSongs(list);
      const initialId = params.songId || (list[0]?.id ?? '');
      setSelectedSongId(initialId);
      const target = list.find((s) => s.id === initialId) || list[0];
      if (target) {
        setTiles(target.tiles || []);
      }
    }
    load();
  }, [params.songId]);

  const currentSong = songs.find((s) => s.id === selectedSongId) || songs[0];

  // Sync internal tiles when song changes
  useEffect(() => {
    if (currentSong) {
      setTiles(currentSong.tiles || []);
      setSelectedTileId(null);
      audioService.stop();
      setIsPlayingPreview(false);
      setPreviewAudioTime(0);

      // Scroll to start of song (bottom of grid, Measure 1)
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: false });
      }, 50);
    }
  }, [currentSong?.id]);

  useEffect(() => {
    return () => {
      audioService.stop();
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  const updatePreviewPlayhead = useCallback(() => {
    if (audioService.getIsPlaying()) {
      const cur = audioService.getCurrentTime();
      setPreviewAudioTime(cur);

      if (currentSong) {
        const curBeat = cur * (currentSong.bpm / 60);
        const targetScrollY = Math.max(0, gridHeight - curBeat * PIXELS_PER_BEAT - 200);
        scrollViewRef.current?.scrollTo({ y: targetScrollY, animated: false });
      }

      animFrameRef.current = requestAnimationFrame(updatePreviewPlayhead);
    } else {
      setIsPlayingPreview(false);
    }
  }, [currentSong, gridHeight]);

  const handleTogglePreview = async () => {
    if (!currentSong) return;

    if (isPlayingPreview) {
      audioService.pause();
      setIsPlayingPreview(false);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    } else {
      const uri = await storageService.getAudioUriForSong(currentSong);
      await audioService.loadTrack(currentSong.id, uri, currentSong.bpm, currentSong.durationSeconds);
      audioService.play(0);
      setIsPlayingPreview(true);
      animFrameRef.current = requestAnimationFrame(updatePreviewPlayhead);
    }
  };

  const handleSaveBeatmap = async () => {
    if (!currentSong) return;
    const updatedSong: Song = {
      ...currentSong,
      tiles: [...tiles].sort((a, b) => a.beat - b.beat),
    };
    await storageService.saveSong(updatedSong);
    setSaveToast('Beatmap saved successfully!');
    setTimeout(() => setSaveToast(null), 2500);
  };

  const handleGridSlotPress = (lane: 0 | 1 | 2 | 3, beat: number) => {
    const existingIndex = tiles.findIndex(
      (t) => t.lane === lane && Math.abs(t.beat - beat) < 0.2
    );

    if (existingIndex >= 0) {
      const clickedTile = tiles[existingIndex];
      if (selectedTileId === clickedTile.id) {
        setTiles((prev) => prev.filter((t) => t.id !== clickedTile.id));
        setSelectedTileId(null);
      } else {
        setSelectedTileId(clickedTile.id);
      }
    } else {
      const newTile: TileNote = {
        id: `tile_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        lane,
        beat,
        durationBeats: 0,
      };
      setTiles((prev) => [...prev, newTile]);
      setSelectedTileId(newTile.id);
      audioService.playHitSound(lane, true);
    }
  };

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

  const selectedTile = tiles.find((t) => t.id === selectedTileId);
  const beatsPerMeasure = currentSong?.timeSignature?.beatsPerMeasure || 4;

  if (!currentSong) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: ACTIVE_THEME.ui.appBackground }]}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No song loaded.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: ACTIVE_THEME.ui.appBackground }]}>
      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: ACTIVE_THEME.ui.cardBorder }]}>
        <View style={styles.headerControlsRow}>
          {/* Song Switcher */}
          <View style={styles.songSelectorBox}>
            <Text style={styles.selectedSongTitle} numberOfLines={1}>
              {currentSong.title} ({currentSong.bpm} BPM)
            </Text>
            <ChevronDown size={14} color="#94a3b8" />
          </View>

          {/* Test Preview Button */}
          <Pressable
            style={[
              styles.previewBtn,
              isPlayingPreview && { backgroundColor: '#f59e0b' },
            ]}
            onPress={handleTogglePreview}
            accessibilityLabel={isPlayingPreview ? 'Pause Audio Preview' : 'Play Audio Preview'}
          >
            {isPlayingPreview ? (
              <Pause size={13} color="#000000" />
            ) : (
              <Play size={13} color="#38bdf8" />
            )}
            <Text
              style={[
                styles.previewBtnText,
                isPlayingPreview && { color: '#000000' },
              ]}
            >
              {isPlayingPreview ? 'Pause' : 'Test'}
            </Text>
          </Pressable>

          {/* Save Button */}
          <Pressable
            style={styles.saveBtn}
            onPress={handleSaveBeatmap}
            accessibilityLabel="Save Beatmap"
          >
            <Save size={13} color="#ffffff" />
            <Text style={styles.saveBtnText}>Save</Text>
          </Pressable>
        </View>

        {/* Subdivisions Row */}
        <View style={styles.subdivisionsRow}>
          <View style={styles.snapButtonsGroup}>
            <Text style={styles.snapLabel}>SNAP:</Text>
            {([1.0, 0.5, 0.25] as const).map((sub) => (
              <Pressable
                key={sub}
                onPress={() => setActiveSubdivision(sub)}
                style={[
                  styles.snapBadge,
                  activeSubdivision === sub && styles.snapBadgeActive,
                ]}
              >
                <Text
                  style={[
                    styles.snapBadgeText,
                    activeSubdivision === sub && styles.snapBadgeTextActive,
                  ]}
                >
                  {sub === 1 ? '1/1' : sub === 0.5 ? '1/2' : '1/4'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.notesCounterText}>{tiles.length} notes</Text>
        </View>
      </View>

      {/* Selected Tile Inspector / Hold Duration Toolbar */}
      {selectedTile && (
        <View style={styles.inspectorBar}>
          <View style={styles.inspectorInfo}>
            <Text style={styles.inspectorTitle}>
              {selectedTile.durationBeats > 0 ? 'HOLD NOTE' : 'TAP NOTE'}
            </Text>
            <Text style={styles.inspectorSub}>
              Lane {selectedTile.lane + 1} · Beat {selectedTile.beat}
            </Text>
          </View>

          <View style={styles.inspectorDurationControls}>
            <Pressable
              style={styles.stepBtn}
              onPress={() => handleAdjustSelectedDuration(-0.5)}
            >
              <Minus size={12} color="#ffffff" />
            </Pressable>
            <Text style={styles.stepValueText}>{selectedTile.durationBeats}b</Text>
            <Pressable
              style={styles.stepBtn}
              onPress={() => handleAdjustSelectedDuration(0.5)}
            >
              <Plus size={12} color="#ffffff" />
            </Pressable>
            <Pressable style={styles.deleteTileBtn} onPress={handleDeleteSelected}>
              <Trash2 size={13} color="#f87171" />
            </Pressable>
          </View>
        </View>
      )}

      {/* Save Success Toast */}
      {saveToast && (
        <View style={styles.toastCard}>
          <Check size={13} color="#4ade80" />
          <Text style={styles.toastText}>{saveToast}</Text>
        </View>
      )}

      {/* 4-Lane Vertical Musical Beat Grid */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.gridScroll}
        contentContainerStyle={{ height: gridHeight }}
      >
        <View style={styles.gridRow}>
          {/* Left Beat / Measure Numbers Column */}
          <View style={[styles.rulerColumn, { height: gridHeight }]}>
            {Array.from({ length: TOTAL_BEATS + 1 }).map((_, beatIdx) => {
              const beat = TOTAL_BEATS - beatIdx;
              const { measure, isBarline } = getMeasureInfo(beat, beatsPerMeasure);
              const y = beatIdx * PIXELS_PER_BEAT;

              return (
                <View key={beat} style={[styles.rulerMark, { top: y }]}>
                  {isBarline ? (
                    <Text style={styles.barlineText}>M{measure}</Text>
                  ) : (
                    <Text style={styles.beatNumText}>{beat}</Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* 4 Lanes Piano Roll Area */}
          <View style={[styles.lanesArea, { height: gridHeight }]}>
            {/* Horizontal Grid Lines */}
            {Array.from({ length: TOTAL_BEATS + 1 }).map((_, beatIdx) => {
              const beat = TOTAL_BEATS - beatIdx;
              const { isBarline } = getMeasureInfo(beat, beatsPerMeasure);
              const y = beatIdx * PIXELS_PER_BEAT;

              return (
                <View
                  key={`line_${beat}`}
                  style={[
                    styles.gridLine,
                    { top: y },
                    isBarline ? styles.barlineGridLine : styles.beatGridLine,
                  ]}
                />
              );
            })}

            {/* 4 Interactive Columns */}
            {([0, 1, 2, 3] as const).map((laneIndex) => (
              <View key={laneIndex} style={styles.editorLaneColumn}>
                {Array.from({ length: TOTAL_BEATS * (1 / activeSubdivision) }).map(
                  (_, subIdx) => {
                    const beat = (TOTAL_BEATS * (1 / activeSubdivision) - 1 - subIdx) * activeSubdivision;
                    return (
                      <Pressable
                        key={subIdx}
                        style={[
                          styles.subdivisionSlot,
                          { height: PIXELS_PER_BEAT * activeSubdivision },
                        ]}
                        onPress={() => handleGridSlotPress(laneIndex, snapToGrid(beat, activeSubdivision))}
                      />
                    );
                  }
                )}
              </View>
            ))}

            {/* Rendered Tile Elements in Grid */}
            {tiles.map((tile) => {
              const bottomY = gridHeight - tile.beat * PIXELS_PER_BEAT;
              const height =
                tile.durationBeats > 0
                  ? Math.max(36, tile.durationBeats * PIXELS_PER_BEAT)
                  : 44;
              const topY = bottomY - height;
              const isSelected = selectedTileId === tile.id;
              const laneWidthPercent = 25;
              const leftOffsetPercent = tile.lane * laneWidthPercent;

              return (
                <Pressable
                  key={tile.id}
                  onPress={() => setSelectedTileId(tile.id)}
                  style={[
                    styles.gridTile,
                    {
                      top: topY,
                      height: height,
                      left: `${leftOffsetPercent}%`,
                      width: `${laneWidthPercent}%`,
                      backgroundColor:
                        tile.durationBeats > 0
                          ? 'rgba(3, 105, 161, 0.7)'
                          : '#0284c7',
                      borderColor: isSelected ? '#ffffff' : '#38bdf8',
                      borderWidth: isSelected ? 2 : 1,
                    },
                  ]}
                >
                  <View style={styles.gridTileHeader}>
                    <Text style={styles.gridTileLabel}>
                      {tile.durationBeats > 0 ? 'HOLD' : 'TAP'}
                    </Text>
                    <Text style={styles.gridTileBeat}>b{tile.beat}</Text>
                  </View>
                  {tile.durationBeats > 0 && (
                    <Text style={styles.gridTileDuration}>
                      {tile.durationBeats}b
                    </Text>
                  )}
                  <View style={styles.gridTileAnchor} />
                </Pressable>
              );
            })}

            {/* Moving Playhead Line */}
            {isPlayingPreview && (
              <View
                style={[
                  styles.playheadLine,
                  {
                    top:
                      gridHeight -
                      previewAudioTime * (currentSong.bpm / 60) * PIXELS_PER_BEAT,
                  },
                ]}
              />
            )}
          </View>
        </View>
      </ScrollView>

      {/* Footer Navigation Bar */}
      <View style={[styles.footer, { borderTopColor: ACTIVE_THEME.ui.cardBorder }]}>
        <Text style={styles.footerTipText}>
          Tip: Tap empty slot to add note. Tap note to edit duration.
        </Text>
        <Pressable
          style={styles.playBeatmapBtn}
          onPress={() => router.push(`/play/${currentSong.id}`)}
          accessibilityLabel="Play Beatmap"
        >
          <Play size={12} color="#ffffff" fill="#ffffff" />
          <Text style={styles.playBeatmapBtnText}>Play Beatmap</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
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
    maxWidth: 160,
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
  notesCounterText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  inspectorBar: {
    backgroundColor: 'rgba(8, 47, 73, 0.6)',
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
    top: 90,
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
  editorLaneColumn: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#1e293b',
  },
  subdivisionSlot: {
    width: '100%',
  },
  gridTile: {
    position: 'absolute',
    borderRadius: 8,
    padding: 4,
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
  playheadLine: {
    position: 'absolute',
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
