import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { ScreenView } from '../../src/components/ui/ScreenView';
import { PixelIcon, type PixelIconName } from '../../src/components/ui/PixelIcon';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { listItemIn } from '../../src/components/ui/motion';
import { ACTIVE_THEME } from '../../constants/theme';
import { storageService } from '../../services/storage';
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
} from '../../src/services/songInfo';
import type { Song } from '../../types/song';
import { FONTS } from '../../src/theme/pixel';

const SEARCH_DEBOUNCE_MS = 500;

type Mode = 'song' | 'artist' | 'songByArtist';

const MODES: { key: Mode; label: string; icon: PixelIconName }[] = [
  { key: 'song', label: 'Song', icon: 'note' },
  { key: 'artist', label: 'Artist', icon: 'person' },
  { key: 'songByArtist', label: 'Song by artist', icon: 'mic' },
];

type TempoState =
  | { status: 'loading' }
  | { status: 'done'; info: SongTempoInfo }
  | { status: 'error'; message: string };

const formatFans = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M fans` : n >= 1_000 ? `${Math.round(n / 1_000)}K fans` : `${n} fans`;

export default function DiscoverScreen() {
  const [mode, setMode] = useState<Mode>('song');
  const [query, setQuery] = useState(''); // song title (song mode) or artist name
  const [songQuery, setSongQuery] = useState(''); // song title in "song by artist" mode
  const [tracks, setTracks] = useState<OnlineTrack[]>([]);
  const [artists, setArtists] = useState<OnlineArtist[]>([]);
  const [openArtist, setOpenArtist] = useState<OnlineArtist | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [tempo, setTempo] = useState<Record<number, TempoState>>({});
  const [librarySongs, setLibrarySongs] = useState<Song[]>([]);
  const [applyFor, setApplyFor] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      storageService.getSongs().then(setLibrarySongs).catch(() => {});
    }, [])
  );

  /** Runs a request with loading / error handling; ignores results of stale requests. */
  const run = useCallback(
    (controller: AbortController, task: () => Promise<void>) => {
      setIsLoading(true);
      setError(null);
      task()
        .catch((err) => {
          if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Search failed.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    },
    []
  );

  // Debounced search whenever the inputs or mode change
  useEffect(() => {
    if (openArtist) return; // browsing an artist's songs
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
            mode === 'song'
              ? await searchTracks(q, controller.signal)
              : await searchTrackByArtist(q, s, controller.signal);
          if (!controller.signal.aborted) setTracks(r);
        }
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mode, query, songQuery, openArtist, run]);

  // Load the selected artist's songs
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

  const showBanner = (msg: string) => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner(msg);
    bannerTimer.current = setTimeout(() => setBanner(null), 3000);
  };

  const handleToggleTrack = (track: OnlineTrack) => {
    Keyboard.dismiss();
    setApplyFor(null);
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

  /** Writes the looked-up BPM onto a song in the user's library. */
  const handleApply = async (target: Song, bpm: number) => {
    try {
      await storageService.saveSong({ ...target, bpm });
      setLibrarySongs((list) => list.map((s) => (s.id === target.id ? { ...s, bpm } : s)));
      setApplyFor(null);
      showBanner(`Set “${target.title}” to ${bpm} BPM`);
    } catch {
      showBanner('Could not update that song.');
    }
  };

  /* ------------------------------ rendering ------------------------------ */

  const renderTempoPanel = (track: OnlineTrack) => {
    const state = tempo[track.id];
    if (!state || state.status === 'loading') {
      return (
        <View style={styles.panelRow}>
          <ActivityIndicator size="small" color="#4d8dff" />
          <Text style={styles.panelMuted}>Looking up tempo…</Text>
        </View>
      );
    }
    if (state.status === 'error') return <Text style={styles.panelError}>{state.message}</Text>;

    const { bpm, timeSignature, source } = state.info;
    return (
      <Animated.View entering={FadeIn.duration(200)}>
        <View style={styles.statRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>BPM</Text>
            <Text style={[styles.statValue, bpm === null && styles.statMissing]}>{bpm ?? 'Not found'}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>TIME SIGNATURE</Text>
            <Text style={[styles.statValue, timeSignature === null && styles.statMissing]}>
              {timeSignature ?? 'Not found'}
            </Text>
          </View>
        </View>
        {source && <Text style={styles.sourceText}>BPM source: {source}</Text>}

        {bpm !== null && librarySongs.length > 0 && (
          <>
            <PressableScale
              scaleTo={0.96}
              style={styles.applyBtn}
              onPress={() => setApplyFor(applyFor === track.id ? null : track.id)}
            >
              <PixelIcon name="note" size={14} color="#4d8dff" />
              <Text style={styles.applyText}>Use {bpm} BPM for a song in my library</Text>
              {applyFor === track.id ? <PixelIcon name="chevronUp" size={14} color="#4d8dff" /> : <PixelIcon name="chevronDown" size={14} color="#4d8dff" />}
            </PressableScale>
            {applyFor === track.id && (
              <Animated.View entering={FadeInDown.duration(180)} style={styles.applyList}>
                {librarySongs.map((s) => (
                  <PressableScale key={s.id} scaleTo={0.97} style={styles.applyRow} onPress={() => handleApply(s, bpm)}>
                    <Text style={styles.applyRowTitle} numberOfLines={1}>
                      {s.title}
                    </Text>
                    <Text style={styles.applyRowBpm}>
                      {s.bpm} → {bpm}
                    </Text>
                  </PressableScale>
                ))}
              </Animated.View>
            )}
          </>
        )}
      </Animated.View>
    );
  };

  const renderTrack = ({ item, index }: { item: OnlineTrack; index: number }) => {
    const expanded = expandedId === item.id;
    return (
      <Animated.View entering={listItemIn(index)}>
        <PressableScale
          scaleTo={0.98}
          style={[styles.card, expanded && styles.cardExpanded]}
          onPress={() => handleToggleTrack(item)}
        >
          <View style={styles.cardTop}>
            {item.coverUrl ? (
              <Image source={{ uri: item.coverUrl }} style={styles.cover} />
            ) : (
              <View style={styles.cardIcon}>
                <PixelIcon name="note" size={14} color="#4d8dff" />
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
            {item.durationSeconds ? (
              <Text style={styles.cardLength}>{formatAudioTime(item.durationSeconds)}</Text>
            ) : null}
          </View>
          {expanded && <View style={styles.panel}>{renderTempoPanel(item)}</View>}
        </PressableScale>
      </Animated.View>
    );
  };

  const renderArtist = ({ item, index }: { item: OnlineArtist; index: number }) => (
    <Animated.View entering={listItemIn(index)}>
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
            <Image source={{ uri: item.pictureUrl }} style={[styles.cover, styles.avatar]} />
          ) : (
            <View style={[styles.cardIcon, styles.avatar]}>
              <PixelIcon name="person" size={14} color="#4d8dff" />
            </View>
          )}
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.cardMeta}>{formatFans(item.fans)}</Text>
          </View>
          <PixelIcon name="chevronRight" size={21} color="#3a4a70" />
        </View>
      </PressableScale>
    </Animated.View>
  );

  const renderBody = () => {
    const needsInput =
      !openArtist &&
      (mode === 'songByArtist' ? query.trim().length < 2 || songQuery.trim().length < 1 : query.trim().length < 2);

    if (needsInput) {
      return (
        <View style={styles.centerBox}>
          <View style={styles.bigIcon}>
            <PixelIcon name="globe" size={28} color="#4d8dff" />
          </View>
          <Text style={styles.infoTitle}>
            {mode === 'artist' ? 'Find an artist' : mode === 'song' ? 'Find a song' : 'Find a song by an artist'}
          </Text>
          <Text style={styles.infoText}>
            {mode === 'artist'
              ? 'Pick an artist to see their songs, then tap a song to look up its tempo.'
              : 'Tap a song to look up its BPM and apply it to a song in your library.'}
          </Text>
        </View>
      );
    }
    if (isLoading && tracks.length === 0 && artists.length === 0) {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator color="#4d8dff" />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.centerBox}>
          <Text style={styles.panelError}>{error}</Text>
        </View>
      );
    }

    if (mode === 'artist' && !openArtist) {
      if (artists.length === 0) {
        return (
          <View style={styles.centerBox}>
            <Text style={styles.infoText}>No artists found.</Text>
          </View>
        );
      }
      return (
        <FlatList
          data={artists}
          keyExtractor={(a) => String(a.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={renderArtist}
        />
      );
    }

    if (tracks.length === 0) {
      return (
        <View style={styles.centerBox}>
          <Text style={styles.infoText}>Not found — try a different spelling.</Text>
        </View>
      );
    }
    return (
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
    <ScreenView style={[styles.root, { backgroundColor: ACTIVE_THEME.ui.appBackground }]}>
      <Animated.View entering={FadeInDown.duration(350)} style={styles.header}>
        <Text style={styles.title}>Discover</Text>
        <Text style={styles.subtitle}>Look up any song’s tempo</Text>

        {/* Search category */}
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
                <PixelIcon name={icon} size={14} color={active ? '#4d8dff' : '#9aa7c2'} />
                <Text style={[styles.modeText, active && styles.modeTextActive]} numberOfLines={1}>
                  {label}
                </Text>
              </PressableScale>
            );
          })}
        </View>

        {openArtist ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.artistHeader}>
            <PressableScale scaleTo={0.9} style={styles.backBtn} onPress={() => setOpenArtist(null)}>
              <PixelIcon name="chevronLeft" size={14} color="#cdd6ea" />
              <Text style={styles.backText}>Artists</Text>
            </PressableScale>
            <Text style={styles.artistName} numberOfLines={1}>
              {openArtist.name}
            </Text>
          </Animated.View>
        ) : (
          <>
            <View style={styles.searchBox}>
              <PixelIcon name="discover" size={18} color="#6b7a99" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={mode === 'song' ? 'Song title…' : 'Artist name…'}
                placeholderTextColor="#6b7a99"
                style={styles.searchInput}
                returnKeyType="search"
                autoCorrect={false}
              />
              {isLoading ? (
                <ActivityIndicator size="small" color="#4d8dff" />
              ) : query.length > 0 ? (
                <PressableScale scaleTo={0.85} onPress={() => setQuery('')} accessibilityLabel="Clear">
                  <PixelIcon name="close" size={14} color="#6b7a99" />
                </PressableScale>
              ) : null}
            </View>
            {mode === 'songByArtist' && (
              <View style={[styles.searchBox, styles.searchBoxSecond]}>
                <PixelIcon name="note" size={14} color="#6b7a99" />
                <TextInput
                  value={songQuery}
                  onChangeText={setSongQuery}
                  placeholder="Song title…"
                  placeholderTextColor="#6b7a99"
                  style={styles.searchInput}
                  returnKeyType="search"
                  autoCorrect={false}
                />
                {songQuery.length > 0 && (
                  <PressableScale scaleTo={0.85} onPress={() => setSongQuery('')} accessibilityLabel="Clear song">
                    <PixelIcon name="close" size={14} color="#6b7a99" />
                  </PressableScale>
                )}
              </View>
            )}
          </>
        )}
      </Animated.View>

      {banner && (
        <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(220)} style={styles.banner}>
          <PixelIcon name="check" size={14} color="#4d8dff" />
          <Text style={styles.bannerText}>{banner}</Text>
        </Animated.View>
      )}

      <View style={styles.body}>{renderBody()}</View>

      <Text style={styles.attribution}>Search: Deezer · Tempo: Deezer, MusicBrainz & AcousticBrainz</Text>
    </ScreenView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 14, letterSpacing: 0 },
  subtitle: { color: '#9aa7c2', fontFamily: FONTS.body, fontSize: 17, marginTop: 2 },
  modeRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 12,
    padding: 3,
    backgroundColor: '#0b1220',
    borderWidth: 2,
    borderColor: '#15203a',
    borderRadius: 0,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 0,
  },
  modeBtnActive: { backgroundColor: 'rgba(77, 141, 255, 0.16)' },
  modeText: { color: '#9aa7c2', fontFamily: FONTS.body, fontSize: 17, },
  modeTextActive: { color: '#4d8dff', fontWeight: 'bold' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    backgroundColor: '#0b1220',
    borderWidth: 2,
    borderColor: '#1f2e52',
    borderRadius: 0,
    paddingHorizontal: 12,
  },
  searchBoxSecond: { marginTop: 8 },
  searchInput: { flex: 1, color: '#ffffff', fontFamily: FONTS.body, fontSize: 20, paddingVertical: 11 },
  artistHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, minHeight: 44 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, paddingRight: 6 },
  backText: { color: '#cdd6ea', fontFamily: FONTS.body, fontSize: 19, },
  artistName: { flex: 1, color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 11, textAlign: 'right' },
  body: { flex: 1 },
  list: { padding: 16, paddingTop: 8, gap: 8 },
  card: {
    backgroundColor: '#0b1220',
    borderWidth: 2,
    borderColor: '#15203a',
    borderRadius: 0,
    padding: 12,
  },
  cardExpanded: { borderColor: '#d9502f' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 0,
    backgroundColor: 'rgba(77, 141, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cover: { width: 40, height: 40, borderRadius: 0, backgroundColor: '#15203a' },
  avatar: { borderRadius: 0 },
  cardInfo: { flex: 1 },
  cardTitle: { color: '#ffffff', fontFamily: FONTS.body, fontSize: 20, },
  cardMeta: { color: '#9aa7c2', fontFamily: FONTS.body, fontSize: 16, marginTop: 1 },
  cardLength: { color: '#6b7a99', fontFamily: FONTS.body, fontSize: 16, },
  panel: { marginTop: 12, paddingTop: 12, borderTopWidth: 2, borderTopColor: '#15203a' },
  panelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelMuted: { color: '#9aa7c2', fontFamily: FONTS.body, fontSize: 17 },
  panelError: { color: '#FF6B4A', fontFamily: FONTS.body, fontSize: 17, textAlign: 'center' },
  statRow: { flexDirection: 'row', gap: 8 },
  statBox: {
    flex: 1,
    backgroundColor: '#070b14',
    borderWidth: 2,
    borderColor: '#15203a',
    borderRadius: 0,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statLabel: { color: '#6b7a99', fontFamily: FONTS.body, fontSize: 13, letterSpacing: 1 },
  statValue: { color: '#4d8dff', fontFamily: FONTS.pixel, fontSize: 14, marginTop: 2 },
  statMissing: { color: '#6b7a99', fontFamily: FONTS.body, fontSize: 19, marginTop: 6 },
  sourceText: { color: '#3a4a70', fontFamily: FONTS.body, fontSize: 15, marginTop: 6, textAlign: 'center' },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 0,
    backgroundColor: 'rgba(77, 141, 255, 0.1)',
  },
  applyText: { flex: 1, color: '#4d8dff', fontFamily: FONTS.body, fontSize: 17, },
  applyList: { marginTop: 6, gap: 4 },
  applyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 0,
    backgroundColor: '#070b14',
  },
  applyRowTitle: { flex: 1, color: '#e6ecf7', fontFamily: FONTS.body, fontSize: 17 },
  applyRowBpm: { color: '#9aa7c2', fontFamily: FONTS.body, fontSize: 16, },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  bigIcon: {
    width: 60,
    height: 60,
    borderRadius: 0,
    backgroundColor: 'rgba(77, 141, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: { color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 11, },
  infoText: { color: '#9aa7c2', fontFamily: FONTS.body, fontSize: 17, textAlign: 'center', lineHeight: 18 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 0,
    backgroundColor: '#0b1a33',
    borderWidth: 2,
    borderColor: '#4d8dff',
  },
  bannerText: { flex: 1, color: '#4d8dff', fontFamily: FONTS.body, fontSize: 16, },
  attribution: { color: '#3a4a70', fontFamily: FONTS.body, fontSize: 13, textAlign: 'center', paddingVertical: 6 },
});
