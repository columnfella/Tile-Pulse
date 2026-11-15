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
import {
  pickAudioDocument,
  supportsDeviceAudioLibrary,
  supportsFolderScan,
  type DeviceAudioFile,
  type PickedAudioResult,
} from '../../services/documentPicker';
import { AudioLibrarySheet } from '../../src/components/ui/AudioLibrarySheet';
import { ACTIVE_THEME } from '../../constants/theme';
import {
  HardDrive,
  Play,
  Edit3,
  Trash2,
  Clock,
  Layers,
  Sparkles,
  X,
  FileAudio,
  Check,
} from 'lucide-react-native';

const supportsStorageScan = supportsDeviceAudioLibrary || supportsFolderScan;

export default function HomeScreen() {
  const router = useRouter();
  const [songs, setSongs] = useState<Song[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
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

  // Reload on focus so note counts reflect beatmaps saved in the Editor tab
  useFocusEffect(
    useCallback(() => {
      loadSongs().catch((err) => console.warn('Failed to load songs:', err));
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
      {/* Header */}
      <Animated.View entering={FadeInDown.duration(350)} style={[styles.header, { borderBottomColor: ACTIVE_THEME.ui.cardBorder }]}>
        <View>
          <View style={styles.titleRow}>
            <Text style={styles.appName}>TilePulse</Text>
            <Sparkles size={16} color="#38bdf8" />
          </View>
          <Text style={styles.appSub}>4-Lane Rhythm Studio</Text>
        </View>

        <PressableScale
          style={styles.uploadButton}
          onPress={handleGetFromStorage}
          accessibilityLabel="Get song from storage"
        >
          <HardDrive size={14} color="#ffffff" strokeWidth={2.5} />
          <Text style={styles.uploadButtonText}>From Storage</Text>
        </PressableScale>
      </Animated.View>

      {/* Import result banner */}
      {banner && (
        <Animated.View entering={FadeInDown.duration(250)} exiting={FadeOut.duration(250)} style={styles.banner}>
          <Check size={13} color="#4ade80" />
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
          const isStarter = song.id === 'starter_fur_elise';
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

                <PressableScale
                  onPress={() => handleDeleteSong(song.id, song.title)}
                  style={styles.deleteIconButton}
                  accessibilityLabel={`Delete ${song.title}`}
                >
                  <Trash2 size={15} color="#64748b" />
                </PressableScale>
              </View>

              {/* Metadata Pills */}
              <View style={styles.pillsRow}>
                <View style={styles.pillBadge}>
                  <Clock size={11} color="#38bdf8" />
                  <Text style={styles.pillText}>{song.bpm} BPM</Text>
                </View>

                <View style={styles.pillBadge}>
                  <Text style={styles.pillText}>
                    {song.timeSignature.beatsPerMeasure}/{song.timeSignature.beatUnit}
                  </Text>
                </View>

                <View style={styles.pillBadge}>
                  <Layers size={11} color="#34d399" />
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
                  <Play size={14} color="#ffffff" fill="#ffffff" />
                  <Text style={styles.playButtonText}>Play</Text>
                </PressableScale>

                <PressableScale
                  style={styles.editButton}
                  onPress={() => handleEditSong(song)}
                  accessibilityLabel={`Edit ${song.title}`}
                >
                  <Edit3 size={13} color="#cbd5e1" />
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
                <FileAudio size={18} color="#38bdf8" />
                <Text style={styles.modalTitle}>Upload Audio Track</Text>
              </View>
              <PressableScale
                onPress={() => setIsUploadModalOpen(false)}
                accessibilityLabel="Close modal"
              >
                <X size={18} color="#94a3b8" />
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
                placeholderTextColor="#64748b"
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
                <Check size={14} color="#ffffff" />
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  appName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  appSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  uploadButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
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
    fontSize: 11,
    fontWeight: 'bold',
    color: '#94a3b8',
    letterSpacing: 1,
  },
  sectionHeaderSub: {
    fontSize: 11,
    color: '#38bdf8',
    fontWeight: '600',
  },
  songCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
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
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
    maxWidth: 200,
  },
  sampleBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: 'rgba(56, 189, 248, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  sampleBadgeText: {
    color: '#7dd3fc',
    fontSize: 9,
    fontWeight: 'bold',
  },
  artistText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
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
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pillText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(51, 65, 85, 0.6)',
  },
  playButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    borderRadius: 12,
  },
  playButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  editButtonText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#052e16',
    borderWidth: 1,
    borderColor: '#22c55e',
  },
  bannerText: {
    flex: 1,
    color: '#4ade80',
    fontSize: 11,
    fontWeight: 'bold',
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
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingBottom: 12,
    marginBottom: 16,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  formField: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#cbd5e1',
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
    borderWidth: 1,
    borderColor: '#334155',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  filePickerText: {
    color: '#94a3b8',
    fontSize: 12,
    maxWidth: 200,
  },
  browseButtonText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: 'bold',
  },
  textInput: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 13,
  },
  fontMono: {
    fontFamily: 'monospace',
  },
  tapTempoButton: {
    backgroundColor: '#082f49',
    borderColor: '#0369a1',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tapTempoText: {
    color: '#7dd3fc',
    fontSize: 10,
    fontWeight: 'bold',
  },
  timeSigGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  timeSigBtn: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  timeSigBtnActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38bdf8',
  },
  timeSigText: {
    color: '#94a3b8',
    fontFamily: 'monospace',
    fontWeight: 'bold',
    fontSize: 12,
  },
  timeSigTextActive: {
    color: '#38bdf8',
  },
  errorText: {
    color: '#f87171',
    fontSize: 11,
    backgroundColor: 'rgba(127, 29, 29, 0.3)',
    borderColor: 'rgba(153, 27, 27, 0.5)',
    borderWidth: 1,
    padding: 8,
    borderRadius: 10,
    marginBottom: 12,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  createButton: {
    flex: 1,
    backgroundColor: '#0284c7',
    borderRadius: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
