import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, Platform, Modal, TextInput, ActivityIndicator } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenView } from '../../src/components/ui/ScreenView';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { listItemIn } from '../../src/components/ui/motion';
import { Song } from '../../src/types/song';
import { storageService } from '../../src/services/storage';
import { PRESET_IDS } from '../../src/game/presets';
import { formatAudioTime } from '../../src/game/engine';
import { PlayRow } from '../../src/components/ui/PlayRow';
import { PixelIcon } from '../../src/components/ui/PixelIcon';
import { ThemeSettingsSheet } from '../../src/components/ui/SongSettingsSheet';
import { SettingsSheet } from '../../src/components/ui/SettingsSheet';
import { LevelSocialSheet } from '../../src/components/ui/LevelSocialSheet';
import { checkCopy } from '../../src/services/social';
import { ApiUnavailableError } from '../../src/services/communityApi';
import { CoverBanner, IconBadge, LevelBadge, cardPartStyles } from '../../src/components/ui/LevelCardParts';
import { setDefaultBackground, useDefaultBackground } from '../../src/services/settings';
import { FONTS, PIXEL } from '../../src/theme/pixel';

/**
 * Songs tab: your library, shown as level cards like Discover — downloaded
 * community levels, songs you created in the Editor, and the built-in samples.
 * New songs are created in the Editor tab.
 */
export default function HomeScreen() {
  const router = useRouter();
  const [songs, setSongs] = useState<Song[]>([]);
  const [covers, setCovers] = useState<Record<string, string | null>>({});
  const [loaded, setLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  // Community level whose comments / rating page is open
  const [socialSong, setSocialSong] = useState<Song | null>(null);
  // Copying a community level into the editor: waiting for the creator's copy password
  const [copyPrompt, setCopyPrompt] = useState<{ song: Song; password: string; error: string | null; busy: boolean } | null>(null);
  const [copying, setCopying] = useState<string | null>(null);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const defaultBackground = useDefaultBackground();
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSongs = useCallback(async () => {
    const list = await storageService.getSongs();
    setSongs(list);
    setLoaded(true);
    const entries = await Promise.all(list.map(async (s) => [s.id, await storageService.getCoverUri(s)] as const));
    setCovers(Object.fromEntries(entries));
  }, []);

  // Reload on focus (songs change in the Editor / Discover). On leaving, close
  // sheets so coming back shows the normal list.
  useFocusEffect(
    useCallback(() => {
      loadSongs().catch((err) => console.warn('Failed to load songs:', err));
      return () => {
        setIsThemeOpen(false);
        setExpandedId(null);
      };
    }, [loadSongs])
  );

  const showBanner = (message: string) => {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setBanner(message);
    bannerTimerRef.current = setTimeout(() => setBanner(null), 3000);
  };

  const handleDeleteSong = (song: Song) => {
    const confirmDelete = () => {
      storageService
        .deleteSong(song.id)
        .then(loadSongs)
        .catch((err) => console.warn('Failed to delete song:', err));
    };
    if (Platform.OS === 'web') {
      // Alert.alert is a no-op on web, so use the browser dialog there
      if (globalThis.confirm?.(`Delete "${song.title}"?`)) confirmDelete();
    } else {
      Alert.alert('Delete song', `Delete “${song.title}” from this device?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete },
      ]);
    }
  };

  const openInEditor = (songId: string) =>
    router.push({ pathname: '/(tabs)/editor', params: { songId, t: String(Date.now()) } });

  /** Copies a downloaded community level into your own songs and opens it in the editor. */
  const copyToEditor = async (song: Song) => {
    const copy = await storageService.duplicateSong(song, song.community?.name ?? song.title);
    await loadSongs();
    showBanner('Copied to your songs. Customize it in the Editor.');
    openInEditor(copy.id);
  };

  /**
   * Customize: your own songs open straight in the Editor (notes, cover, name,
   * background, upload). Community levels are copied first, if the creator
   * allows it (free, or with their copy password).
   */
  const handleCustomize = async (song: Song) => {
    if (!song.community) return openInEditor(song.id);
    setCopying(song.id);
    try {
      const check = await checkCopy(song.community.levelId);
      if (check.ok) await copyToEditor(song);
      else if (check.needsPassword) setCopyPrompt({ song, password: '', error: null, busy: false });
      else showBanner(check.message);
    } catch (err) {
      showBanner(err instanceof ApiUnavailableError ? 'Can’t reach the server to check if copying is allowed.' : 'Couldn’t copy this level.');
    } finally {
      setCopying(null);
    }
  };

  const submitCopyPassword = async () => {
    if (!copyPrompt || !copyPrompt.song.community) return;
    setCopyPrompt({ ...copyPrompt, busy: true, error: null });
    try {
      const check = await checkCopy(copyPrompt.song.community.levelId, copyPrompt.password);
      if (!check.ok) return setCopyPrompt((p) => (p ? { ...p, busy: false, error: check.message } : p));
      const target = copyPrompt.song;
      setCopyPrompt(null);
      await copyToEditor(target);
    } catch (err) {
      setCopyPrompt((p) =>
        p ? { ...p, busy: false, error: err instanceof ApiUnavailableError ? 'Can’t reach the server.' : 'Couldn’t copy this level.' } : p
      );
    }
  };

  const renderSong = ({ item: song, index }: { item: Song; index: number }) => {
    const expanded = expandedId === song.id;
    const cover = covers[song.id];
    const isSample = PRESET_IDS.has(song.id);
    const community = song.community;
    const holds = song.tiles.filter((t) => t.durationBeats > 0).length;

    const title = community ? community.name : song.title;
    const subtitle = community ? [song.title, song.artist].filter(Boolean).join(' · ') : song.artist;
    const origin = community ? `by ${community.author}` : isSample ? 'Built-in sample' : 'Your song';

    return (
      <Animated.View entering={listItemIn(index)}>
        <PressableScale
          scaleTo={0.98}
          style={[styles.card, expanded && styles.cardExpanded]}
          onPress={() => setExpandedId(expanded ? null : song.id)}
          accessibilityLabel={`${title}, tap for options`}
        >
          {cover ? <CoverBanner uri={cover} tall={expanded} /> : null}
          <View style={[styles.cardTop, cover ? cardPartStyles.overCover : null]}>
            {community ? (
              <LevelBadge level={community.level} difficulty={community.difficulty} />
            ) : isSample ? (
              <IconBadge label="SMP" icon="star" color={PIXEL.accent} />
            ) : (
              <IconBadge label="MY" icon="note" />
            )}
            <View style={styles.cardInfo}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={styles.cardSong} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
              <Text style={styles.cardOrigin} numberOfLines={1}>
                {origin}
              </Text>
            </View>
            {community ? (
              <View style={styles.downloadedTag}>
                <PixelIcon name="download" size={7} color={PIXEL.accent2} />
              </View>
            ) : null}
          </View>

          <View style={styles.statsRow}>
            <Text style={styles.stat}>{Math.round(song.bpm)} BPM</Text>
            <Text style={styles.statDot}>■</Text>
            <Text style={styles.stat}>{song.durationSeconds ? formatAudioTime(song.durationSeconds) : '--:--'}</Text>
            <Text style={styles.statDot}>■</Text>
            <Text style={styles.stat}>{song.tiles.length} notes</Text>
            {holds > 0 ? (
              <>
                <Text style={styles.statDot}>■</Text>
                <Text style={styles.stat}>{holds} holds</Text>
              </>
            ) : null}
          </View>

          {expanded && (
            <Animated.View entering={FadeIn.duration(160)} style={styles.panel}>
              <PlayRow songId={song.id} />
              <View style={styles.actionsRow}>
                <PressableScale
                  scaleTo={0.94}
                  style={[styles.actionBtn, styles.customizeBtn]}
                  disabled={copying === song.id}
                  onPress={() => void handleCustomize(song)}
                  accessibilityLabel={community ? `Copy ${title} to the editor` : `Customize ${title} in the editor`}
                >
                  {copying === song.id ? (
                    <ActivityIndicator size="small" color={PIXEL.accent2} />
                  ) : (
                    <PixelIcon name={community ? 'copy' : 'editor'} size={14} color={PIXEL.accent2} />
                  )}
                  <Text style={styles.customizeText}>{community ? 'Customize (copy)' : 'Customize'}</Text>
                </PressableScale>
                <PressableScale
                  scaleTo={0.92}
                  style={[styles.actionBtn, styles.deleteBtn]}
                  onPress={() => handleDeleteSong(song)}
                  accessibilityLabel={`Delete ${song.title}`}
                >
                  <PixelIcon name="trash" size={14} color={PIXEL.accent} />
                </PressableScale>
              </View>
              {community ? (
                <View style={styles.actionsRow}>
                  <PressableScale scaleTo={0.94} style={[styles.actionBtn, styles.halfBtn]} onPress={() => setSocialSong(song)}>
                    <PixelIcon name="comment" size={14} color={PIXEL.accent2} />
                    <Text style={[styles.actionText, { color: PIXEL.accent2 }]}>Comments</Text>
                  </PressableScale>
                  <PressableScale scaleTo={0.94} style={[styles.actionBtn, styles.halfBtn, styles.rateBtn]} onPress={() => setSocialSong(song)}>
                    <PixelIcon name="star" size={14} color="#f5b83d" />
                    <Text style={[styles.actionText, { color: '#f5b83d' }]}>Rate</Text>
                  </PressableScale>
                </View>
              ) : null}
            </Animated.View>
          )}
        </PressableScale>
      </Animated.View>
    );
  };

  return (
    <ScreenView style={styles.safeArea}>

      {/* Header */}
      <Animated.View entering={FadeInDown.duration(350)} style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.logoMark}>
            <View style={[styles.logoPixel, { backgroundColor: '#2f6bff' }]} />
            <View style={[styles.logoPixel, { backgroundColor: '#FF6B4A' }]} />
            <View style={[styles.logoPixel, { backgroundColor: '#1a3d99' }]} />
            <View style={[styles.logoPixel, { backgroundColor: '#2f6bff' }]} />
          </View>
          <View>
            <Text style={styles.appName}>
              TILE<Text style={styles.appNameAccent}>PULSE</Text>
            </Text>
            <Text style={styles.appSub}>4-lane rhythm studio</Text>
          </View>
        </View>
        <View style={styles.headerButtons}>
          <PressableScale
            scaleTo={0.88}
            style={styles.themeButton}
            onPress={() => setIsThemeOpen(true)}
            accessibilityLabel="Choose app theme"
          >
            <PixelIcon name="palette" size={18} color="#cdd6ea" />
          </PressableScale>
          <PressableScale
            scaleTo={0.88}
            style={styles.themeButton}
            onPress={() => setIsSettingsOpen(true)}
            accessibilityLabel="Settings"
          >
            <PixelIcon name="gear" size={18} color="#cdd6ea" />
          </PressableScale>
        </View>
      </Animated.View>

      {banner && (
        <Animated.View entering={FadeInDown.duration(250)} exiting={FadeOut.duration(250)} style={styles.banner}>
          <PixelIcon name="check" size={14} color="#4d8dff" />
          <Text style={styles.bannerText}>{banner}</Text>
        </Animated.View>
      )}

      <FlatList
        data={songs}
        keyExtractor={(s) => s.id}
        renderItem={renderSong}
        contentContainerStyle={[styles.list, loaded && songs.length === 0 && styles.listEmpty]}
        ListHeaderComponent={
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeaderTitle}>MY SONGS ({songs.length})</Text>
            <Text style={styles.sectionHeaderSub}>Tap a card to play</Text>
          </View>
        }
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <View style={styles.bigIcon}>
                <PixelIcon name="note" size={28} color={PIXEL.accent2} />
              </View>
              <Text style={styles.emptyTitle}>NO SONGS YET</Text>
              <Text style={styles.emptyText}>Create one in the Editor, or get community levels in Discover.</Text>
              <View style={styles.actionsRow}>
                <PressableScale scaleTo={0.94} style={styles.actionBtn} onPress={() => router.push('/(tabs)/editor')}>
                  <PixelIcon name="editor" size={14} color={PIXEL.text} />
                  <Text style={styles.actionText}>Editor</Text>
                </PressableScale>
                <PressableScale scaleTo={0.94} style={styles.actionBtn} onPress={() => router.push('/(tabs)/discover')}>
                  <PixelIcon name="discover" size={14} color={PIXEL.text} />
                  <Text style={styles.actionText}>Discover</Text>
                </PressableScale>
              </View>
            </View>
          ) : undefined
        }
      />

      {socialSong?.community && (
        <LevelSocialSheet
          visible
          levelId={socialSong.community.levelId}
          name={socialSong.community.name}
          onClose={() => setSocialSong(null)}
        />
      )}

      {/* Copy password for a community level */}
      <Modal visible={!!copyPrompt} transparent animationType="fade" onRequestClose={() => setCopyPrompt(null)}>
        <View style={styles.promptBackdrop}>
          <View style={styles.promptCard}>
            <View style={styles.promptHead}>
              <PixelIcon name="lock" size={14} color={PIXEL.accent} />
              <Text style={styles.promptTitle}>COPY PASSWORD</Text>
            </View>
            <Text style={styles.promptBody}>
              The creator of “{copyPrompt?.song.community?.name}” protected copying with a password.
            </Text>
            <TextInput
              value={copyPrompt?.password ?? ''}
              onChangeText={(t) => setCopyPrompt((p) => (p ? { ...p, password: t, error: null } : p))}
              placeholder="Password"
              placeholderTextColor="#6b7a99"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={64}
              onSubmitEditing={submitCopyPassword}
              style={styles.promptInput}
            />
            {copyPrompt?.error ? <Text style={styles.promptError}>{copyPrompt.error}</Text> : null}
            <View style={styles.promptRow}>
              <PressableScale scaleTo={0.94} style={styles.promptCancel} onPress={() => setCopyPrompt(null)}>
                <Text style={styles.promptCancelText}>CANCEL</Text>
              </PressableScale>
              <PressableScale
                scaleTo={0.94}
                style={[styles.promptOk, (!copyPrompt?.password || copyPrompt?.busy) && styles.promptDisabled]}
                disabled={!copyPrompt?.password || copyPrompt?.busy}
                onPress={submitCopyPassword}
              >
                {copyPrompt?.busy ? <ActivityIndicator size="small" color="#000000" /> : null}
                <Text style={styles.promptOkText}>UNLOCK & COPY</Text>
              </PressableScale>
            </View>
          </View>
        </View>
      </Modal>

      <SettingsSheet visible={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      {isThemeOpen && (
        <ThemeSettingsSheet
          value={defaultBackground}
          onChange={(bg) => void setDefaultBackground(bg)}
          onClose={() => setIsThemeOpen(false)}
        />
      )}
    </ScreenView>
  );
}

const styles = StyleSheet.create({
  headerButtons: { flexDirection: 'row', gap: 8 },
  customizeBtn: { flex: 1, paddingVertical: 9, borderColor: PIXEL.accent2, backgroundColor: 'rgba(77, 141, 255, 0.08)' },
  customizeText: { color: PIXEL.accent2, fontFamily: FONTS.body, fontSize: 19, letterSpacing: 1 },
  halfBtn: { flex: 1, paddingVertical: 8 },
  rateBtn: { borderColor: '#f5b83d', backgroundColor: 'rgba(245, 184, 61, 0.08)' },
  promptBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  promptCard: { width: '100%', maxWidth: 340, backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: '#000000', padding: 16, gap: 10 },
  promptHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  promptTitle: { color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 10 },
  promptBody: { color: PIXEL.text, fontFamily: FONTS.body, fontSize: 18 },
  promptInput: {
    color: '#ffffff',
    fontFamily: FONTS.body,
    fontSize: 20,
    backgroundColor: '#070b14',
    borderWidth: 2,
    borderColor: '#1f2e52',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  promptError: { color: PIXEL.accent, fontFamily: FONTS.body, fontSize: 17 },
  promptRow: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  promptCancel: { paddingHorizontal: 12, paddingVertical: 9, borderWidth: 2, borderColor: PIXEL.panelLight },
  promptCancelText: { color: PIXEL.textDim, fontFamily: FONTS.pixel, fontSize: 8 },
  promptOk: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: PIXEL.accent, borderWidth: 2, borderColor: '#000000' },
  promptOkText: { color: '#000000', fontFamily: FONTS.pixel, fontSize: 8 },
  promptDisabled: { opacity: 0.45 },
  safeArea: { flex: 1, backgroundColor: 'transparent' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: PIXEL.panelLight,
    // Slightly see-through so the theme background shows behind the header
    backgroundColor: 'rgba(5, 7, 13, 0.78)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: { width: 24, height: 24, flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  logoPixel: { width: 11, height: 11 },
  appName: { fontFamily: FONTS.pixel, fontSize: 13, lineHeight: 18, color: '#ffffff', includeFontPadding: false },
  appNameAccent: { color: '#FF6B4A' },
  appSub: { fontFamily: FONTS.body, fontSize: 15, lineHeight: 16, color: '#6b7a99', includeFontPadding: false },
  themeButton: { width: 36, height: 36, backgroundColor: '#15203a', alignItems: 'center', justifyContent: 'center' },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0b1a33',
    borderWidth: 2,
    borderColor: '#4d8dff',
  },
  bannerText: { flex: 1, color: '#4d8dff', fontFamily: FONTS.body, fontSize: 16 },

  list: { padding: 16, gap: 8 },
  listEmpty: { flexGrow: 1 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  sectionHeaderTitle: { fontFamily: FONTS.body, fontSize: 16, color: '#9aa7c2', letterSpacing: 1 },
  sectionHeaderSub: { fontFamily: FONTS.body, fontSize: 16, color: '#4d8dff' },

  // See-through cards: the animated theme background shows between and behind them
  card: { backgroundColor: 'rgba(11, 18, 32, 0.6)', borderWidth: 2, borderColor: 'rgba(77, 141, 255, 0.22)', padding: 10, overflow: 'hidden' },
  cardExpanded: { borderColor: PIXEL.accent },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardInfo: { flex: 1 },
  cardTitle: { color: '#ffffff', fontFamily: FONTS.body, fontSize: 21 },
  cardSong: { color: PIXEL.text, fontFamily: FONTS.body, fontSize: 17 },
  cardOrigin: { color: '#6b7a99', fontFamily: FONTS.body, fontSize: 15 },
  downloadedTag: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: PIXEL.accent2,
    alignSelf: 'flex-start',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 2,
    borderTopColor: PIXEL.panelLight,
  },
  stat: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 16 },
  statDot: { color: '#3a4a70', fontSize: 6 },

  panel: { marginTop: 8, gap: 6 },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    backgroundColor: PIXEL.accent2,
    borderWidth: 2,
    borderColor: '#000000',
  },
  playText: { color: '#000000', fontFamily: FONTS.pixel, fontSize: 10 },
  actionsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  actionBtn: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: PIXEL.panelLight,
    borderWidth: 2,
    borderColor: '#000000',
  },
  deleteBtn: { flexGrow: 0, width: 46, paddingHorizontal: 0, backgroundColor: 'rgba(255, 107, 74, 0.12)', borderColor: 'rgba(255, 107, 74, 0.5)' },
  actionText: { color: PIXEL.text, fontFamily: FONTS.body, fontSize: 17 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24 },
  bigIcon: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PIXEL.panel,
    borderWidth: 2,
    borderColor: PIXEL.panelLight,
  },
  emptyTitle: { color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 11 },
  emptyText: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 18, textAlign: 'center' },
});
