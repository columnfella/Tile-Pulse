import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, Platform } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ScreenView } from '../../src/components/ui/ScreenView';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { listItemIn } from '../../src/components/ui/motion';
import { Song } from '../../types/song';
import { storageService } from '../../services/storage';
import { PRESET_IDS } from '../../src/game/presets';
import { formatAudioTime } from '../../game/engine';
import { PixelIcon } from '../../src/components/ui/PixelIcon';
import { SongSettingsSheet, ThemeSettingsSheet } from '../../src/components/ui/SongSettingsSheet';
import { AnimatedBackground } from '../../src/components/backgrounds/AnimatedBackground';
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
  const [settingsSongId, setSettingsSongId] = useState<string | null>(null);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
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
        setSettingsSongId(null);
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

  const settingsSong = settingsSongId ? songs.find((s) => s.id === settingsSongId) : undefined;

  /** Saves a rename and/or background change from the song settings sheet. */
  const handleSaveSongSettings = async (changes: { title: string; background: string }) => {
    if (!settingsSong) return;
    await storageService.saveSong({
      ...settingsSong,
      title: changes.title,
      background: changes.background === 'default' ? undefined : changes.background,
    });
    setSettingsSongId(null);
    await loadSongs();
    showBanner(`Saved “${changes.title}”`);
  };

  const handleChangeCover = async (song: Song) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      await storageService.setSongCover(song, { uri: asset.uri, name: asset.fileName ?? undefined });
      await loadSongs();
      showBanner('Cover updated');
    } catch (err) {
      console.warn('Cover change failed:', err);
      showBanner('Couldn’t set that picture');
    }
  };

  const handleRemoveCover = async (song: Song) => {
    await storageService.setSongCover(song, null);
    await loadSongs();
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

  const handleEditSong = (song: Song) => {
    router.push({ pathname: '/(tabs)/editor', params: { songId: song.id, t: String(Date.now()) } });
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
              <PressableScale scaleTo={0.96} style={styles.playBtn} onPress={() => router.push(`/play/${song.id}`)}>
                <PixelIcon name="play" size={14} color="#000000" />
                <Text style={styles.playText}>PLAY</Text>
              </PressableScale>
              <View style={styles.actionsRow}>
                <PressableScale scaleTo={0.92} style={styles.actionBtn} onPress={() => handleEditSong(song)}>
                  <PixelIcon name="editor" size={14} color={PIXEL.text} />
                  <Text style={styles.actionText}>Edit notes</Text>
                </PressableScale>
                <PressableScale scaleTo={0.92} style={styles.actionBtn} onPress={() => setSettingsSongId(song.id)}>
                  <PixelIcon name="palette" size={14} color={PIXEL.text} />
                  <Text style={styles.actionText}>Customize</Text>
                </PressableScale>
              </View>
              <View style={styles.actionsRow}>
                <PressableScale scaleTo={0.92} style={styles.actionBtn} onPress={() => handleChangeCover(song)}>
                  <PixelIcon name="image" size={14} color={PIXEL.text} />
                  <Text style={styles.actionText}>{song.coverUri ? 'Change cover' : 'Add cover'}</Text>
                </PressableScale>
                {song.coverUri ? (
                  <PressableScale scaleTo={0.92} style={styles.actionBtn} onPress={() => handleRemoveCover(song)}>
                    <PixelIcon name="close" size={14} color={PIXEL.textDim} />
                    <Text style={styles.actionText}>Remove cover</Text>
                  </PressableScale>
                ) : null}
                <PressableScale
                  scaleTo={0.92}
                  style={[styles.actionBtn, styles.deleteBtn]}
                  onPress={() => handleDeleteSong(song)}
                  accessibilityLabel={`Delete ${song.title}`}
                >
                  <PixelIcon name="trash" size={14} color={PIXEL.accent} />
                </PressableScale>
              </View>
            </Animated.View>
          )}
        </PressableScale>
      </Animated.View>
    );
  };

  return (
    <ScreenView style={styles.safeArea}>
      {/* Theme background (faint, behind the song list) */}
      <AnimatedBackground id={defaultBackground} opacity={0.28} />

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
        <PressableScale
          scaleTo={0.88}
          style={styles.themeButton}
          onPress={() => setIsThemeOpen(true)}
          accessibilityLabel="Choose app theme"
        >
          <PixelIcon name="palette" size={18} color="#cdd6ea" />
        </PressableScale>
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

      {settingsSong && (
        <SongSettingsSheet
          song={settingsSong}
          defaultBackground={defaultBackground}
          onSave={handleSaveSongSettings}
          onClose={() => setSettingsSongId(null)}
        />
      )}

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
  safeArea: { flex: 1, backgroundColor: PIXEL.bg },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: PIXEL.panelLight,
    backgroundColor: '#05070d',
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

  card: { backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: PIXEL.panelLight, padding: 10, overflow: 'hidden' },
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
  deleteBtn: { flexGrow: 0, backgroundColor: 'rgba(255, 107, 74, 0.12)', borderColor: 'rgba(255, 107, 74, 0.5)' },
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
