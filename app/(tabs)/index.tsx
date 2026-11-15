import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Alert,
  Platform,
} from 'react-native';
import { ScreenView } from '../../src/components/ui/ScreenView';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { PressableScale } from '../../src/components/ui/PressableScale';
import {
  backdropIn,
  backdropOut,
  cardIn,
  cardOut,
  listItemIn,
  listItemOut,
  listLayout,
} from '../../src/components/ui/motion';
import { useFocusEffect, useRouter } from 'expo-router';
import { Song } from '../../types/song';
import { storageService } from '../../services/storage';
import { PRESET_IDS } from '../../src/game/presets';
import {
  pickAudioDocument,
  supportsDeviceAudioLibrary,
  supportsFolderScan,
  type DeviceAudioFile,
  type PickedAudioResult,
} from '../../services/documentPicker';
import { AudioLibrarySheet } from '../../src/components/ui/AudioLibrarySheet';
import { PixelIcon } from '../../src/components/ui/PixelIcon';
import { SongSettingsSheet, ThemeSettingsSheet } from '../../src/components/ui/SongSettingsSheet';
import { AnimatedBackground } from '../../src/components/backgrounds/AnimatedBackground';
import { setDefaultBackground, useDefaultBackground } from '../../src/services/settings';
import { ACTIVE_THEME } from '../../constants/theme';
import { FONTS } from '../../src/theme/pixel';

const supportsStorageScan = supportsDeviceAudioLibrary || supportsFolderScan;

export default function HomeScreen() {
  const router = useRouter();
  const [songs, setSongs] = useState<Song[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [settingsSongId, setSettingsSongId] = useState<string | null>(null);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const defaultBackground = useDefaultBackground();
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedFile, setSelectedFile] = useState<PickedAudioResult | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [songTitle, setSongTitle] = useState('');
  const [bpmInput, setBpmInput] = useState('120');
  const [timeSignature, setTimeSignature] = useState<'4/4' | '3/4' | '6/8'>('4/4');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [tapTimestamps, setTapTimestamps] = useState<number[]>([]);

  const loadSongs = useCallback(async () => {
    const list = await storageService.getSongs();
    setSongs(list);
  }, []);

  // Reload on focus so note counts reflect beatmaps saved in the Editor tab.
  // On leaving the tab, close any open sheet so coming back shows the normal
  // song list (tabs stay mounted, so state would otherwise persist).
  useFocusEffect(
    useCallback(() => {
      loadSongs().catch((err) => console.warn('Failed to load songs:', err));
      return () => {
        setIsLibraryOpen(false);
        setIsUploadModalOpen(false);
        setSettingsSongId(null);
        setIsThemeOpen(false);
      };
    }, [loadSongs])
  );

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

  const applyPickedFile = (picked: PickedAudioResult) => {
    setSelectedFile(picked);
    const name = picked.name || 'Custom Song';
    setSelectedFileName(name);
    setSongTitle(name.replace(/\.[^/.]+$/, ''));
    setErrorMsg('');
  };

  const resetUploadForm = () => {
    setSelectedFile(null);
    setSelectedFileName('');
    setSongTitle('');
    setBpmInput('120');
    setTimeSignature('4/4');
    setErrorMsg('');
  };

  /** System picker for a single file (fallback, and the only option on web). */
  const handleBrowseFiles = async () => {
    setIsLibraryOpen(false);
    try {
      const result = await pickAudioDocument();
      if (!result.canceled && result.uri) {
        applyPickedFile(result);
        setIsUploadModalOpen(true);
      }
    } catch {
      setErrorMsg('Failed to pick document.');
    }
  };

  /** Opens the storage scanner (permission prompt first) on phones. */
  const handlePickDocument = () => {
    if (supportsStorageScan) {
      setIsLibraryOpen(true);
    } else {
      void handleBrowseFiles();
    }
  };

  /** Header "From Storage" button: scan storage, then fill in the song details. */
  const handleGetFromStorage = () => {
    resetUploadForm();
    handlePickDocument();
  };


  // Device files already imported, so the scanner can mark them "Added"
  const importedUris = useMemo(
    () => new Set(songs.map((s) => s.sourceUri).filter((u): u is string => !!u)),
    [songs]
  );

  const showBanner = (message: string) => {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setBanner(message);
    bannerTimerRef.current = setTimeout(() => setBanner(null), 3500);
  };

  const handleImportFile = async (file: DeviceAudioFile) => {
    await storageService.importDeviceSong(file);
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

  const handleImported = (added: number, failed: number) => {
    setIsLibraryOpen(false);
    loadSongs().catch((err) => console.warn('Failed to reload songs:', err));
    if (added > 0) {
      showBanner(
        `Added ${added} song${added === 1 ? '' : 's'}${failed ? ` · ${failed} failed` : ''} — set BPM & notes in the Editor`
      );
    } else if (failed > 0) {
      showBanner(`Couldn't add ${failed} song${failed === 1 ? '' : 's'}`);
    }
  };

  const handleSaveUpload = async () => {
    if (!selectedFile) {
      setErrorMsg('Please select an audio file.');
      return;
    }
    const cleanTitle = songTitle.trim();
    if (!cleanTitle) {
      setErrorMsg('Song title is required.');
      return;
    }
    const bpmNum = parseInt(bpmInput, 10);
    if (isNaN(bpmNum) || bpmNum < 40 || bpmNum > 300) {
      setErrorMsg('BPM must be between 40 and 300.');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');

    try {
      const songId = `song_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const [beatsPerMeasure, beatUnit] = timeSignature.split('/').map(Number);

      // Copy the picked file into permanent app storage (the picker's copy
      // lives in a cache folder the OS may clear at any time).
      const audioUri = await storageService.importAudio(songId, selectedFile);

      const newSong: Song = {
        id: songId,
        title: cleanTitle,
        audioUri,
        bpm: bpmNum,
        timeSignature: {
          beatsPerMeasure,
          beatUnit,
        },
        tiles: [],
        createdAt: Date.now(),
      };

      await storageService.saveSong(newSong);
      await loadSongs();
      setIsUploadModalOpen(false);

      // Navigate to Editor for the new song
      router.push({
        pathname: '/(tabs)/editor',
        params: { songId: newSong.id, t: String(Date.now()) },
      });
    } catch (err) {
      console.error('Failed to save song:', err);
      const reason = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Couldn't save this song: ${reason}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSong = (songId: string, title: string) => {
    const confirmDelete = () => {
      storageService
        .deleteSong(songId)
        .then(loadSongs)
        .catch((err) => console.warn('Failed to delete song:', err));
    };

    if (Platform.OS === 'web') {
      // Alert.alert is a no-op on web, so use the browser dialog there
      if (globalThis.confirm?.(`Delete "${title}"?`)) {
        confirmDelete();
      }
    } else {
      Alert.alert('Delete Song', `Are you sure you want to delete "${title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete },
      ]);
    }
  };

  const handlePlaySong = (song: Song) => {
    router.push(`/play/${song.id}`);
  };

  const handleEditSong = (song: Song) => {
    router.push({
      pathname: '/(tabs)/editor',
      params: { songId: song.id, t: String(Date.now()) },
    });
  };

  return (
    <ScreenView style={[styles.safeArea, { backgroundColor: ACTIVE_THEME.ui.appBackground }]}>
      {/* Theme background (faint, behind the song list) */}
      <AnimatedBackground id={defaultBackground} opacity={0.28} />

      {/* Header */}
      <Animated.View entering={FadeInDown.duration(350)} style={[styles.header, { borderBottomColor: ACTIVE_THEME.ui.cardBorder }]}>
        {/* Logo: pixel mark + two-tone wordmark */}
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
            style={styles.uploadButton}
            onPress={handleGetFromStorage}
            accessibilityLabel="Get song from storage"
          >
            <PixelIcon name="storage" size={14} color="#ffffff" />
            <Text style={styles.uploadButtonText}>From Storage</Text>
        </PressableScale>
        </View>
      </Animated.View>

      {/* Import result banner */}
      {banner && (
        <Animated.View entering={FadeInDown.duration(250)} exiting={FadeOut.duration(250)} style={styles.banner}>
          <PixelIcon name="check" size={14} color="#4d8dff" />
          <Text style={styles.bannerText}>{banner}</Text>
        </Animated.View>
      )}

      {/* Song List */}
      <ScrollView contentContainerStyle={styles.scrollList}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeaderTitle}>SONG LIBRARY ({songs.length})</Text>
          <Text style={styles.sectionHeaderSub}>Ready to play</Text>
        </View>

        {songs.map((song, index) => {
          const isStarter = PRESET_IDS.has(song.id);
          const holdCount = song.tiles.filter((t) => t.durationBeats > 0).length;

          return (
            <Animated.View
              key={song.id}
              entering={listItemIn(index)}
              exiting={listItemOut}
              layout={listLayout}
              style={[
                styles.songCard,
                {
                  backgroundColor: ACTIVE_THEME.ui.cardBackground,
                  borderColor: ACTIVE_THEME.ui.cardBorder,
                },
              ]}
            >
              <View style={styles.cardTopRow}>
                <View style={styles.cardTitleCol}>
                  <View style={styles.cardTitleWithBadge}>
                    <Text style={styles.songCardTitle} numberOfLines={1}>
                      {song.title}
                    </Text>
                    {isStarter && (
                      <View style={styles.sampleBadge}>
                        <Text style={styles.sampleBadgeText}>SAMPLE</Text>
                      </View>
                    )}
                  </View>
                  {song.artist && <Text style={styles.artistText}>{song.artist}</Text>}
                </View>

                <View style={styles.cardIconButtons}>
                  <PressableScale
                    onPress={() => setSettingsSongId(song.id)}
                    style={styles.deleteIconButton}
                    accessibilityLabel={`Rename or customize ${song.title}`}
                  >
                    <PixelIcon name="pencil" size={14} color="#6b7a99" />
                  </PressableScale>
                  <PressableScale
                    onPress={() => handleDeleteSong(song.id, song.title)}
                    style={styles.deleteIconButton}
                    accessibilityLabel={`Delete ${song.title}`}
                  >
                    <PixelIcon name="trash" size={14} color="#6b7a99" />
                  </PressableScale>
                </View>
              </View>

              {/* Metadata Pills */}
              <View style={styles.pillsRow}>
                <View style={styles.pillBadge}>
                  <PixelIcon name="clock" size={14} color="#4d8dff" />
                  <Text style={styles.pillText}>{song.bpm} BPM</Text>
                </View>

                <View style={styles.pillBadge}>
                  <Text style={styles.pillText}>
                    {song.timeSignature.beatsPerMeasure}/{song.timeSignature.beatUnit}
                  </Text>
                </View>

                <View style={styles.pillBadge}>
                  <PixelIcon name="note" size={14} color="#4d8dff" />
                  <Text style={styles.pillText}>
                    {song.tiles.length} notes {holdCount > 0 ? `(${holdCount} hold)` : ''}
                  </Text>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.cardActionsRow}>
                <PressableScale
                  style={styles.playButton}
                  onPress={() => handlePlaySong(song)}
                  accessibilityLabel={`Play ${song.title}`}
                >
                  <PixelIcon name="play" size={14} color="#ffffff" />
                  <Text style={styles.playButtonText}>Play</Text>
                </PressableScale>

                <PressableScale
                  style={styles.editButton}
                  onPress={() => handleEditSong(song)}
                  accessibilityLabel={`Edit ${song.title}`}
                >
                  <PixelIcon name="pencil" size={14} color="#cdd6ea" />
                  <Text style={styles.editButtonText}>Edit</Text>
                </PressableScale>
              </View>
            </Animated.View>
          );
        })}
      </ScrollView>

      {/* Upload Form Overlay (in-screen instead of <Modal>, which re-shows the Android system bars) */}
      {isUploadModalOpen && (
        <Animated.View entering={backdropIn} exiting={backdropOut} style={styles.modalBackdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalCenter}
        >
          <Animated.View
            entering={cardIn}
            exiting={cardOut}
            style={[
              styles.modalCard,
              {
                backgroundColor: ACTIVE_THEME.ui.surfaceBackground,
                borderColor: ACTIVE_THEME.ui.cardBorder,
              },
            ]}
          >
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalHeaderLeft}>
                <PixelIcon name="note" size={21} color="#4d8dff" />
                <Text style={styles.modalTitle}>Upload Audio Track</Text>
              </View>
              <PressableScale
                onPress={() => setIsUploadModalOpen(false)}
                accessibilityLabel="Close modal"
              >
                <PixelIcon name="close" size={14} color="#9aa7c2" />
              </PressableScale>
            </View>

            {/* Document Picker Trigger */}
            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>Audio File (.mp3, .wav, .m4a)</Text>
              <PressableScale style={styles.filePickerBox} onPress={handlePickDocument}>
                <Text style={styles.filePickerText} numberOfLines={1}>
                  {selectedFileName || 'Tap to choose from storage...'}
                </Text>
                <Text style={styles.browseButtonText}>Browse</Text>
              </PressableScale>
            </View>

            {/* Title Input */}
            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>Song Title</Text>
              <TextInput
                style={styles.textInput}
                value={songTitle}
                onChangeText={setSongTitle}
                placeholder="e.g. Moonlight Sonata"
                placeholderTextColor="#6b7a99"
              />
            </View>

            {/* BPM & Tap Tempo */}
            <View style={styles.formField}>
              <View style={styles.labelWithActionRow}>
                <Text style={styles.fieldLabel}>BPM (Beats Per Minute)</Text>
                <PressableScale style={styles.tapTempoButton} onPress={handleTapTempo}>
                  <Text style={styles.tapTempoText}>Tap Tempo</Text>
                </PressableScale>
              </View>
              <TextInput
                style={[styles.textInput, styles.fontMono]}
                value={bpmInput}
                onChangeText={(text) => setBpmInput(text.replace(/[^0-9]/g, "").slice(0, 3))}
                maxLength={3}
                keyboardType="numeric"
              />
            </View>

            {/* Time Signature */}
            <View style={styles.formField}>
              <Text style={styles.fieldLabel}>Time Signature</Text>
              <View style={styles.timeSigGrid}>
                {(['4/4', '3/4', '6/8'] as const).map((sig) => (
                  <PressableScale
                    key={sig}
                    onPress={() => setTimeSignature(sig)}
                    style={[
                      styles.timeSigBtn,
                      timeSignature === sig && styles.timeSigBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.timeSigText,
                        timeSignature === sig && styles.timeSigTextActive,
                      ]}
                    >
                      {sig}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            </View>

            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

            {/* Submit & Cancel */}
            <View style={styles.modalActionsRow}>
              <PressableScale
                style={styles.cancelButton}
                onPress={() => setIsUploadModalOpen(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </PressableScale>

              <PressableScale
                style={[styles.createButton, isSaving && { opacity: 0.6 }]}
                onPress={handleSaveUpload}
                disabled={isSaving}
              >
                <PixelIcon name="check" size={14} color="#ffffff" />
                <Text style={styles.createButtonText}>
                  {isSaving ? 'Saving...' : 'Create Song'}
                </Text>
              </PressableScale>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
        </Animated.View>
      )}

      {/* Phone audio library (Android) — shown above the upload form */}
      {/* Song settings: rename + background */}
      {settingsSong && (
        <SongSettingsSheet
          song={settingsSong}
          defaultBackground={defaultBackground}
          onSave={handleSaveSongSettings}
          onClose={() => setSettingsSongId(null)}
        />
      )}

      {/* App theme */}
      {isThemeOpen && (
        <ThemeSettingsSheet
          value={defaultBackground}
          onChange={(bg) => void setDefaultBackground(bg)}
          onClose={() => setIsThemeOpen(false)}
        />
      )}

      {isLibraryOpen && (
        <AudioLibrarySheet
          importedUris={importedUris}
          onImportFile={handleImportFile}
          onImported={handleImported}
          onBrowseFiles={handleBrowseFiles}
          onClose={() => setIsLibraryOpen(false)}
        />
      )}
    </ScreenView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 2,
    backgroundColor: '#05070d',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoMark: {
    width: 24,
    height: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  logoPixel: {
    width: 11,
    height: 11,
  },
  appName: {
    fontFamily: FONTS.pixel,
    fontSize: 13,
    lineHeight: 18,
    color: '#ffffff',
    includeFontPadding: false,
  },
  appNameAccent: {
    color: '#FF6B4A',
  },
  appSub: {
    fontFamily: FONTS.body,
    fontSize: 15,
    lineHeight: 16,
    color: '#6b7a99',
    includeFontPadding: false,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF6B4A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 0,
  },
  uploadButtonText: {
    color: '#ffffff',
    fontFamily: FONTS.body,
    fontSize: 17,
  },
  scrollList: {
    padding: 16,
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionHeaderTitle: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: '#9aa7c2',
    letterSpacing: 1,
  },
  sectionHeaderSub: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: '#4d8dff',
  },
  songCard: {
    padding: 16,
    borderRadius: 0,
    borderWidth: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitleCol: {
    flex: 1,
    marginRight: 8,
  },
  cardTitleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  songCardTitle: {
    fontFamily: FONTS.body,
    fontSize: 20,
    color: '#ffffff',
    maxWidth: 200,
  },
  sampleBadge: {
    backgroundColor: 'rgba(77, 141, 255, 0.2)',
    borderColor: 'rgba(77, 141, 255, 0.4)',
    borderWidth: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 0,
  },
  sampleBadgeText: {
    color: '#8fb8ff',
    fontFamily: FONTS.body,
    fontSize: 13,
  },
  artistText: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: '#9aa7c2',
    marginTop: 2,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  themeButton: {
    width: 36,
    height: 36,
    borderRadius: 0,
    backgroundColor: '#15203a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  deleteIconButton: {
    padding: 4,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  pillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(21, 32, 58, 0.8)',
    borderWidth: 2,
    borderColor: 'rgba(31, 46, 82, 0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 0,
  },
  pillText: {
    color: '#cdd6ea',
    fontFamily: FONTS.body,
    fontSize: 16,
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: 'rgba(31, 46, 82, 0.6)',
  },
  playButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FF6B4A',
    paddingVertical: 10,
    borderRadius: 0,
  },
  playButtonText: {
    color: '#ffffff',
    fontFamily: FONTS.body,
    fontSize: 17,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#15203a',
    borderWidth: 2,
    borderColor: '#1f2e52',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 0,
  },
  editButtonText: {
    color: '#e6ecf7',
    fontFamily: FONTS.body,
    fontSize: 17,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 0,
    backgroundColor: '#0b1a33',
    borderWidth: 2,
    borderColor: '#4d8dff',
  },
  bannerText: {
    flex: 1,
    color: '#4d8dff',
    fontFamily: FONTS.body,
    fontSize: 16,
  },
  modalCenter: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    elevation: 100,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 0,
    borderWidth: 2,
    padding: 20,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#15203a',
    paddingBottom: 12,
    marginBottom: 16,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontFamily: FONTS.pixel,
    fontSize: 11,
    color: '#ffffff',
  },
  formField: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontFamily: FONTS.body,
    fontSize: 16,
    color: '#cdd6ea',
    marginBottom: 6,
  },
  labelWithActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  filePickerBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1f2e52',
    borderStyle: 'dashed',
    borderRadius: 0,
    padding: 12,
    backgroundColor: 'rgba(11, 18, 32, 0.6)',
  },
  filePickerText: {
    color: '#9aa7c2',
    fontFamily: FONTS.body,
    fontSize: 17,
    maxWidth: 200,
  },
  browseButtonText: {
    color: '#4d8dff',
    fontFamily: FONTS.body,
    fontSize: 16,
  },
  textInput: {
    backgroundColor: '#0b1220',
    borderWidth: 2,
    borderColor: '#1f2e52',
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ffffff',
    fontFamily: FONTS.body,
    fontSize: 19,
  },
  fontMono: {
    fontFamily: 'monospace',
  },
  tapTempoButton: {
    backgroundColor: '#3a1a12',
    borderColor: '#d9502f',
    borderWidth: 2,
    borderRadius: 0,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tapTempoText: {
    color: '#8fb8ff',
    fontFamily: FONTS.body,
    fontSize: 15,
  },
  timeSigGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  timeSigBtn: {
    flex: 1,
    backgroundColor: '#0b1220',
    borderWidth: 2,
    borderColor: '#1f2e52',
    borderRadius: 0,
    paddingVertical: 8,
    alignItems: 'center',
  },
  timeSigBtnActive: {
    backgroundColor: 'rgba(77, 141, 255, 0.15)',
    borderColor: '#4d8dff',
  },
  timeSigText: {
    color: '#9aa7c2',
    fontFamily: FONTS.body,
    fontSize: 17,
  },
  timeSigTextActive: {
    color: '#4d8dff',
  },
  errorText: {
    color: '#FF6B4A',
    fontFamily: FONTS.body,
    fontSize: 16,
    backgroundColor: 'rgba(92, 36, 20, 0.3)',
    borderColor: 'rgba(140, 50, 30, 0.5)',
    borderWidth: 2,
    padding: 8,
    borderRadius: 0,
    marginBottom: 12,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#15203a',
    borderRadius: 0,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#9aa7c2',
    fontFamily: FONTS.body,
    fontSize: 17,
  },
  createButton: {
    flex: 1,
    backgroundColor: '#FF6B4A',
    borderRadius: 0,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  createButtonText: {
    color: '#ffffff',
    fontFamily: FONTS.body,
    fontSize: 17,
  },
});
