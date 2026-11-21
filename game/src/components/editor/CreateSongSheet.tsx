import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { PixelIcon, type PixelIconName } from '../ui/PixelIcon';
import { PressableScale } from '../ui/PressableScale';
import { useScreenInsets } from '../ui/useScreenInsets';
import { AudioLibrarySheet } from '../ui/AudioLibrarySheet';
import {
  pickAudioDocument,
  supportsDeviceAudioLibrary,
  supportsFolderScan,
  type DeviceAudioFile,
} from '../../services/documentPicker';
import { storageService } from '../../services/storage';
import { formatAudioTime } from '../../game/engine';
import type { Song } from '../../types/song';
import { FONTS, PIXEL } from '../../theme/pixel';

import { C, alpha, themedStyles } from '../../theme/palette';
const MIN_BPM = 40;
const MAX_BPM = 300;
const TIME_SIGNATURES = ['4/4', '3/4', '6/8'] as const;

type PickedAudio = { name: string; uri: string; durationSeconds?: number; file?: Blob };

function Section({ title, icon, children }: { title: string; icon: PixelIconName; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <PixelIcon name={icon} size={14} color={PIXEL.accent} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

interface CreateSongSheetProps {
  visible: boolean;
  /** Device files already in the library (marked "Added" in the scanner). */
  importedUris: Set<string>;
  onCreated: (song: Song) => void;
  onClose: () => void;
}

/** Editor → "Create song": name, audio, tempo and an optional cover picture. */
export function CreateSongSheet({ visible, importedUris, onCreated, onClose }: CreateSongSheetProps) {
  const insets = useScreenInsets();
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [audio, setAudio] = useState<PickedAudio | null>(null);
  const [bpmText, setBpmText] = useState('120');
  const [timeSig, setTimeSig] = useState<(typeof TIME_SIGNATURES)[number]>('4/4');
  const [cover, setCover] = useState<{ uri: string; name?: string } | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [taps, setTaps] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle('');
    setArtist('');
    setAudio(null);
    setBpmText('120');
    setTimeSig('4/4');
    setCover(null);
    setTaps([]);
    setError(null);
  };

  const applyAudio = (picked: PickedAudio) => {
    setAudio(picked);
    setError(null);
    // Name the song after the file unless a name was typed already
    if (!title.trim()) setTitle(picked.name.replace(/\.[^/.]+$/, '').slice(0, 60));
  };

  /** System file picker (single file; the only option in the browser preview). */
  const browseFiles = async () => {
    setScannerOpen(false);
    try {
      const r = await pickAudioDocument();
      if (!r.canceled && r.uri) applyAudio({ name: r.name || 'Song', uri: r.uri, file: r.file });
    } catch {
      setError('Couldn’t open the file picker.');
    }
  };

  const chooseAudio = () => {
    if (supportsDeviceAudioLibrary || supportsFolderScan) setScannerOpen(true);
    else void browseFiles();
  };

  const pickCover = async () => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.7,
      });
      if (!r.canceled && r.assets?.[0]) setCover({ uri: r.assets[0].uri, name: r.assets[0].fileName ?? undefined });
    } catch {
      setError('Couldn’t open your pictures.');
    }
  };

  /** Tap along with the beat: BPM from the average gap between recent taps. */
  const tapTempo = () => {
    const now = Date.now();
    const recent = [...taps.filter((t) => now - t < 3000), now].slice(-8);
    setTaps(recent);
    if (recent.length < 2) return;
    const avg = (recent[recent.length - 1] - recent[0]) / (recent.length - 1);
    const bpm = Math.round(60000 / avg);
    if (bpm >= MIN_BPM && bpm <= MAX_BPM) setBpmText(String(bpm));
  };

  const handleCreate = async () => {
    const name = title.trim();
    const bpm = parseInt(bpmText, 10);
    if (!name) return setError('Give your song a name.');
    if (!audio) return setError('Choose the audio for your song.');
    if (!Number.isFinite(bpm) || bpm < MIN_BPM || bpm > MAX_BPM) return setError(`BPM must be ${MIN_BPM}–${MAX_BPM}.`);
    setSaving(true);
    setError(null);
    try {
      const [beatsPerMeasure, beatUnit] = timeSig.split('/').map(Number);
      const song = await storageService.createSong({
        title: name,
        artist: artist.trim() || undefined,
        audio,
        bpm,
        timeSignature: { beatsPerMeasure, beatUnit },
        cover: cover ?? undefined,
      });
      reset();
      onCreated(song);
    } catch (err) {
      setError(`Couldn’t create the song: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <PixelIcon name="plus" size={14} color={PIXEL.accent} />
            <Text style={styles.title}>CREATE SONG</Text>
          </View>
          <PressableScale scaleTo={0.85} style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
            <PixelIcon name="close" size={14} color={PIXEL.text} />
          </PressableScale>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Card preview with the optional cover */}
          <PressableScale scaleTo={0.98} style={styles.cover} onPress={pickCover} accessibilityLabel="Choose a cover picture">
            {cover ? (
              <Image source={{ uri: cover.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <View style={styles.coverEmpty}>
                <PixelIcon name="image" size={28} color={C.textFaint} />
                <Text style={styles.muted}>Tap to add a cover picture (optional)</Text>
              </View>
            )}
            <LinearGradient
              colors={[alpha(C.panel, 0), alpha(C.panel, 0.55), PIXEL.panel]}
              locations={[0.35, 0.7, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.coverText} pointerEvents="none">
              <Text style={styles.coverTitle} numberOfLines={1}>
                {title.trim() || 'New song'}
              </Text>
              <Text style={styles.coverSub} numberOfLines={1}>
                {[artist.trim(), `${bpmText || '?'} BPM`, timeSig].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </PressableScale>
          {cover ? (
            <PressableScale scaleTo={0.94} style={styles.linkBtn} onPress={() => setCover(null)}>
              <Text style={[styles.linkText, { color: PIXEL.accent }]}>Remove cover</Text>
            </PressableScale>
          ) : null}

          <Section title="AUDIO" icon="note">
            {audio ? (
              <View style={styles.audioRow}>
                <PixelIcon name="check" size={14} color={PIXEL.accent2} />
                <Text style={styles.audioName} numberOfLines={1}>
                  {audio.name}
                </Text>
                {audio.durationSeconds ? <Text style={styles.muted}>{formatAudioTime(audio.durationSeconds)}</Text> : null}
              </View>
            ) : (
              <Text style={styles.muted}>The music your level plays to (mp3, wav, m4a…).</Text>
            )}
            <PressableScale scaleTo={0.95} style={styles.secondaryBtn} onPress={chooseAudio}>
              <PixelIcon name="storage" size={14} color={PIXEL.accent2} />
              <Text style={styles.secondaryText}>{audio ? 'CHANGE AUDIO' : 'CHOOSE FROM STORAGE'}</Text>
            </PressableScale>
          </Section>

          <Section title="DETAILS" icon="pencil">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Song name"
              placeholderTextColor={C.textSubtle}
              maxLength={60}
              style={styles.input}
            />
            <TextInput
              value={artist}
              onChangeText={setArtist}
              placeholder="Artist (optional)"
              placeholderTextColor={C.textSubtle}
              maxLength={60}
              style={styles.input}
            />
          </Section>

          <Section title="TEMPO" icon="clock">
            <View style={styles.bpmRow}>
              <TextInput
                value={bpmText}
                onChangeText={(t) => setBpmText(t.replace(/[^0-9]/g, '').slice(0, 3))}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={3}
                style={[styles.input, styles.bpmInput]}
                accessibilityLabel="BPM"
              />
              <Text style={styles.muted}>BPM</Text>
              <View style={styles.flex} />
              <PressableScale scaleTo={0.92} style={styles.tapBtn} onPress={tapTempo}>
                <Text style={styles.tapText}>TAP TEMPO</Text>
              </PressableScale>
            </View>
            <Text style={styles.note}>Not sure? Keep 120 — you can look it up later with the BPM? button in the editor.</Text>
            <Text style={styles.label}>TIME SIGNATURE</Text>
            <View style={styles.row}>
              {TIME_SIGNATURES.map((sig) => (
                <PressableScale
                  key={sig}
                  scaleTo={0.92}
                  onPress={() => setTimeSig(sig)}
                  style={[styles.chip, timeSig === sig && styles.chipActive]}
                >
                  <Text style={[styles.chipText, timeSig === sig && styles.chipTextActive]}>{sig}</Text>
                </PressableScale>
              ))}
            </View>
          </Section>
        </ScrollView>

        <View style={styles.footer}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PressableScale
            scaleTo={0.96}
            style={[styles.primaryBtn, saving && styles.btnDisabled]}
            disabled={saving}
            onPress={handleCreate}
          >
            {saving ? <ActivityIndicator size="small" color={C.onAccent} /> : <PixelIcon name="check" size={14} color={C.onAccent} />}
            <Text style={styles.primaryText}>{saving ? 'CREATING…' : 'CREATE & EDIT NOTES'}</Text>
          </PressableScale>
        </View>

        {scannerOpen && (
          <AudioLibrarySheet
            single
            importedUris={importedUris}
            onImportFile={async (file: DeviceAudioFile) =>
              applyAudio({ name: file.name, uri: file.uri, durationSeconds: file.durationSeconds })
            }
            onImported={() => setScannerOpen(false)}
            onBrowseFiles={browseFiles}
            onClose={() => setScannerOpen(false)}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  root: { flex: 1, backgroundColor: PIXEL.bg },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 12 },
  closeBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PIXEL.panelLight,
    borderWidth: 2,
    borderColor: C.outline,
  },
  scroll: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },

  cover: { height: 160, backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: PIXEL.panelLight, overflow: 'hidden' },
  coverEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 40 },
  coverText: { position: 'absolute', left: 12, right: 12, bottom: 10 },
  coverTitle: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 12 },
  coverSub: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 17, marginTop: 4 },

  section: { backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: PIXEL.panelLight, padding: 12, gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 9 },
  label: { color: C.textSubtle, fontFamily: FONTS.pixel, fontSize: 7, marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  input: {
    color: C.textStrong,
    fontFamily: FONTS.body,
    fontSize: 20,
    backgroundColor: C.bgDeep,
    borderWidth: 2,
    borderColor: C.line,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  audioName: { flex: 1, color: PIXEL.text, fontFamily: FONTS.body, fontSize: 18 },
  bpmRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bpmInput: { width: 76, textAlign: 'center', color: PIXEL.accent2 },
  tapBtn: { paddingHorizontal: 10, paddingVertical: 8, borderWidth: 2, borderColor: PIXEL.accent, backgroundColor: alpha(C.accent, 0.12) },
  tapText: { color: PIXEL.accent, fontFamily: FONTS.pixel, fontSize: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 5, borderWidth: 2, borderColor: PIXEL.panelLight, backgroundColor: C.bgDeep },
  chipActive: { borderColor: PIXEL.accent2, backgroundColor: alpha(C.blue, 0.15) },
  chipText: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 18 },
  chipTextActive: { color: PIXEL.accent2 },

  muted: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 16 },
  note: { color: C.textSubtle, fontFamily: FONTS.body, fontSize: 15 },
  error: { color: PIXEL.accent, fontFamily: FONTS.body, fontSize: 17 },
  linkBtn: { alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 4, marginTop: -6 },
  linkText: { color: PIXEL.accent2, fontFamily: FONTS.body, fontSize: 17 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 9,
    borderWidth: 2,
    borderColor: PIXEL.accent2,
    backgroundColor: alpha(C.blue, 0.1),
  },
  secondaryText: { color: PIXEL.accent2, fontFamily: FONTS.pixel, fontSize: 9 },

  footer: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderTopWidth: 2, borderTopColor: PIXEL.panelLight, backgroundColor: PIXEL.panel },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
    backgroundColor: PIXEL.accent,
    borderWidth: 2,
    borderColor: C.outline,
  },
  btnDisabled: { opacity: 0.5 },
  primaryText: { color: C.onAccent, fontFamily: FONTS.pixel, fontSize: 10 },
}));
