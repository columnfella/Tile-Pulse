import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { PixelIcon, type PixelIconName } from '../ui/PixelIcon';
import { PressableScale } from '../ui/PressableScale';
import { useScreenInsets } from '../ui/useScreenInsets';
import { formatAudioTime } from '../../game/engine';
import {
  getArtistTopTracks,
  lookupSongTempo,
  searchArtists,
  searchTrackByArtist,
  searchTracks,
  type OnlineArtist,
  type OnlineTrack,
  type SongTempoInfo,
} from '../../services/songInfo';
import { FONTS, PIXEL } from '../../theme/pixel';

import { C, alpha } from '../../theme/palette';
const SEARCH_DEBOUNCE_MS = 500;

type Mode = 'song' | 'artist' | 'songByArtist';

const MODES: { key: Mode; label: string; icon: PixelIconName }[] = [
  { key: 'song', label: 'Song', icon: 'note' },
  { key: 'artist', label: 'Artist', icon: 'person' },
  { key: 'songByArtist', label: 'By artist', icon: 'mic' },
];

type TempoState =
  | { status: 'loading' }
  | { status: 'done'; info: SongTempoInfo }
  | { status: 'error'; message: string };

const formatFans = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M fans` : n >= 1_000 ? `${Math.round(n / 1_000)}K fans` : `${n} fans`;

interface BpmLookupSheetProps {
  visible: boolean;
  /** Pre-fills the search (usually the song being edited). */
  initialQuery: string;
  currentBpm: number;
  onApply: (bpm: number) => void;
  onClose: () => void;
}

/**
 * Online tempo lookup (Deezer search; BPM from Deezer, MusicBrainz &
 * AcousticBrainz). Opened from the Editor's small "BPM?" button; picking a
 * result applies its BPM to the song being edited.
 */
export function BpmLookupSheet({ visible, initialQuery, currentBpm, onApply, onClose }: BpmLookupSheetProps) {
  const insets = useScreenInsets();
  const [mode, setMode] = useState<Mode>('song');
  const [query, setQuery] = useState(initialQuery);
  const [songQuery, setSongQuery] = useState('');
  const [tracks, setTracks] = useState<OnlineTrack[]>([]);
  const [artists, setArtists] = useState<OnlineArtist[]>([]);
  const [openArtist, setOpenArtist] = useState<OnlineArtist | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [tempo, setTempo] = useState<Record<number, TempoState>>({});

  // Start from the edited song's title each time the sheet opens
  useEffect(() => {
    if (visible) {
      setQuery(initialQuery);
      setOpenArtist(null);
    }
  }, [visible, initialQuery]);

  const run = useCallback((controller: AbortController, task: () => Promise<void>) => {
    setIsLoading(true);
    setError(null);
    task()
      .catch((err) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Search failed.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!visible || openArtist) return;
    const q = query.trim();
    const s = songQuery.trim();
    const ready = mode === 'songByArtist' ? q.length >= 2 && s.length >= 1 : q.length >= 2;
    setExpandedId(null);
    if (!ready) {
      setTracks([]);
      setArtists([]);
      setIsLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      run(controller, async () => {
        if (mode === 'artist') {
          const r = await searchArtists(q, controller.signal);
          if (!controller.signal.aborted) setArtists(r);
        } else {
          const r =
            mode === 'song' ? await searchTracks(q, controller.signal) : await searchTrackByArtist(q, s, controller.signal);
          if (!controller.signal.aborted) setTracks(r);
        }
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [visible, mode, query, songQuery, openArtist, run]);

  useEffect(() => {
    if (!openArtist) return;
    const controller = new AbortController();
    setTracks([]);
    setExpandedId(null);
    run(controller, async () => {
      const r = await getArtistTopTracks(openArtist.id, controller.signal);
      if (!controller.signal.aborted) setTracks(r);
    });
    return () => controller.abort();
  }, [openArtist, run]);

  const handleModeChange = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setOpenArtist(null);
    setTracks([]);
    setArtists([]);
    setError(null);
  };

  const handleToggleTrack = (track: OnlineTrack) => {
    Keyboard.dismiss();
    if (expandedId === track.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(track.id);
    const existing = tempo[track.id];
    if (existing && existing.status !== 'error') return;
    setTempo((t) => ({ ...t, [track.id]: { status: 'loading' } }));
    lookupSongTempo(track)
      .then((info) => setTempo((t) => ({ ...t, [track.id]: { status: 'done', info } })))
      .catch((err) =>
        setTempo((t) => ({
          ...t,
          [track.id]: { status: 'error', message: err instanceof Error ? err.message : 'Lookup failed.' },
        }))
      );
  };

  const renderTempoPanel = (track: OnlineTrack) => {
    const state = tempo[track.id];
    if (!state || state.status === 'loading') {
      return (
        <View style={styles.panelRow}>
          <ActivityIndicator size="small" color={PIXEL.accent2} />
          <Text style={styles.muted}>Looking up tempo…</Text>
        </View>
      );
    }
    if (state.status === 'error') return <Text style={styles.errorText}>{state.message}</Text>;

    const { bpm, timeSignature, source } = state.info;
    return (
      <Animated.View entering={FadeIn.duration(160)}>
        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>BPM</Text>
            <Text style={[styles.statValue, bpm === null && styles.statMissing]}>{bpm ?? 'Not found'}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>TIME SIG</Text>
            <Text style={[styles.statValue, timeSignature === null && styles.statMissing]}>
              {timeSignature ?? 'Not found'}
            </Text>
          </View>
        </View>
        {source ? <Text style={styles.sourceText}>BPM source: {source}</Text> : null}
        {bpm !== null && (
          <PressableScale scaleTo={0.96} style={styles.applyBtn} onPress={() => onApply(bpm)}>
            <PixelIcon name="check" size={14} color={C.onAccent} />
            <Text style={styles.applyText}>
              {bpm === currentBpm ? `Already ${bpm} BPM` : `Use ${bpm} BPM (now ${currentBpm})`}
            </Text>
          </PressableScale>
        )}
      </Animated.View>
    );
  };

  const renderTrack = ({ item }: { item: OnlineTrack }) => {
    const expanded = expandedId === item.id;
    return (
      <PressableScale scaleTo={0.98} style={[styles.card, expanded && styles.cardExpanded]} onPress={() => handleToggleTrack(item)}>
        <View style={styles.cardTop}>
          {item.coverUrl ? (
            <Image source={{ uri: item.coverUrl }} style={styles.cover} />
          ) : (
            <View style={styles.cover}>
              <PixelIcon name="note" size={14} color={PIXEL.accent2} />
            </View>
          )}
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {item.artist}
              {item.album ? ` · ${item.album}` : ''}
            </Text>
          </View>
          {item.durationSeconds ? <Text style={styles.cardMeta}>{formatAudioTime(item.durationSeconds)}</Text> : null}
        </View>
        {expanded && <View style={styles.panel}>{renderTempoPanel(item)}</View>}
      </PressableScale>
    );
  };

  const renderArtist = ({ item }: { item: OnlineArtist }) => (
    <PressableScale
      scaleTo={0.98}
      style={styles.card}
      onPress={() => {
        Keyboard.dismiss();
        setOpenArtist(item);
      }}
    >
      <View style={styles.cardTop}>
        {item.pictureUrl ? (
          <Image source={{ uri: item.pictureUrl }} style={styles.cover} />
        ) : (
          <View style={styles.cover}>
            <PixelIcon name="person" size={14} color={PIXEL.accent2} />
          </View>
        )}
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.cardMeta}>{formatFans(item.fans)}</Text>
        </View>
        <PixelIcon name="chevronRight" size={14} color={C.textFaint} />
      </View>
    </PressableScale>
  );

  const renderBody = () => {
    const needsInput =
      !openArtist &&
      (mode === 'songByArtist' ? query.trim().length < 2 || songQuery.trim().length < 1 : query.trim().length < 2);
    if (needsInput) {
      return (
        <View style={styles.center}>
          <Text style={styles.muted}>Search for the original song to find its tempo.</Text>
        </View>
      );
    }
    if (isLoading && tracks.length === 0 && artists.length === 0) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={PIXEL.accent2} />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      );
    }
    if (mode === 'artist' && !openArtist) {
      return artists.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.muted}>No artists found.</Text>
        </View>
      ) : (
        <FlatList
          data={artists}
          keyExtractor={(a) => String(a.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={renderArtist}
        />
      );
    }
    return tracks.length === 0 ? (
      <View style={styles.center}>
        <Text style={styles.muted}>Not found — try a different spelling.</Text>
      </View>
    ) : (
      <FlatList
        data={tracks}
        keyExtractor={(t) => String(t.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        renderItem={renderTrack}
      />
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View
        style={[
          styles.root,
          { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>FIND BPM</Text>
            <PressableScale scaleTo={0.85} style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
              <PixelIcon name="close" size={14} color={PIXEL.text} />
            </PressableScale>
          </View>

          <View style={styles.modeRow}>
            {MODES.map(({ key, label, icon }) => {
              const active = mode === key;
              return (
                <PressableScale
                  key={key}
                  scaleTo={0.94}
                  style={[styles.modeBtn, active && styles.modeBtnActive]}
                  onPress={() => handleModeChange(key)}
                >
                  <PixelIcon name={icon} size={14} color={active ? PIXEL.accent2 : PIXEL.textDim} />
                  <Text style={[styles.modeText, active && styles.modeTextActive]} numberOfLines={1}>
                    {label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          {openArtist ? (
            <View style={styles.artistHeader}>
              <PressableScale scaleTo={0.9} style={styles.backBtn} onPress={() => setOpenArtist(null)}>
                <PixelIcon name="chevronLeft" size={14} color={C.textSoft} />
                <Text style={styles.backText}>Artists</Text>
              </PressableScale>
              <Text style={styles.artistName} numberOfLines={1}>
                {openArtist.name}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.searchBox}>
                <PixelIcon name="discover" size={14} color={C.textMuted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={mode === 'song' ? 'Song title…' : 'Artist name…'}
                  placeholderTextColor={C.textMuted}
                  style={styles.searchInput}
                  returnKeyType="search"
                  autoCorrect={false}
                />
                {isLoading ? <ActivityIndicator size="small" color={PIXEL.accent2} /> : null}
              </View>
              {mode === 'songByArtist' && (
                <View style={styles.searchBox}>
                  <PixelIcon name="note" size={14} color={C.textMuted} />
                  <TextInput
                    value={songQuery}
                    onChangeText={setSongQuery}
                    placeholder="Song title…"
                    placeholderTextColor={C.textMuted}
                    style={styles.searchInput}
                    returnKeyType="search"
                    autoCorrect={false}
                  />
                </View>
              )}
            </>
          )}
        </View>

        <View style={styles.body}>{renderBody()}</View>
        <Text style={styles.attribution}>Search: Deezer · Tempo: Deezer, MusicBrainz & AcousticBrainz</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PIXEL.bg },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 13 },
  closeBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PIXEL.panelLight,
    borderWidth: 2,
    borderColor: C.outline,
  },
  modeRow: { flexDirection: 'row', gap: 4, padding: 3, backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: PIXEL.panelLight },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7 },
  modeBtnActive: { backgroundColor: alpha(C.blue, 0.16) },
  modeText: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 17 },
  modeTextActive: { color: PIXEL.accent2 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PIXEL.panel,
    borderWidth: 2,
    borderColor: C.line,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, color: C.textStrong, fontFamily: FONTS.body, fontSize: 20, paddingVertical: 9 },
  artistHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingRight: 6 },
  backText: { color: C.textSoft, fontFamily: FONTS.body, fontSize: 19 },
  artistName: { flex: 1, color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 10, textAlign: 'right' },
  body: { flex: 1 },
  list: { padding: 16, paddingTop: 6, gap: 8 },
  card: { backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: PIXEL.panelLight, padding: 10 },
  cardExpanded: { borderColor: PIXEL.accent },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cover: { width: 38, height: 38, backgroundColor: PIXEL.panelLight, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1 },
  cardTitle: { color: C.textStrong, fontFamily: FONTS.body, fontSize: 20 },
  cardMeta: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 16 },
  panel: { marginTop: 10, paddingTop: 10, borderTopWidth: 2, borderTopColor: PIXEL.panelLight },
  panelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statRow: { flexDirection: 'row', gap: 8 },
  statBox: {
    flex: 1,
    backgroundColor: C.bgDeep,
    borderWidth: 2,
    borderColor: PIXEL.panelLight,
    paddingVertical: 8,
    alignItems: 'center',
  },
  statLabel: { color: C.textMuted, fontFamily: FONTS.body, fontSize: 14, letterSpacing: 1 },
  statValue: { color: PIXEL.accent2, fontFamily: FONTS.pixel, fontSize: 13, marginTop: 4 },
  statMissing: { color: C.textMuted, fontFamily: FONTS.body, fontSize: 18 },
  sourceText: { color: C.textFaint, fontFamily: FONTS.body, fontSize: 15, marginTop: 6, textAlign: 'center' },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 9,
    backgroundColor: PIXEL.accent2,
    borderWidth: 2,
    borderColor: C.outline,
  },
  applyText: { color: C.onAccent, fontFamily: FONTS.body, fontSize: 19 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  muted: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 18, textAlign: 'center' },
  errorText: { color: PIXEL.accent, fontFamily: FONTS.body, fontSize: 18, textAlign: 'center' },
  attribution: { color: C.textFaint, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center', paddingVertical: 6 },
});
