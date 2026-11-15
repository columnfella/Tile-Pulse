import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { PixelIcon } from './PixelIcon';
import { backdropIn, backdropOut, cardIn, cardOut } from './motion';
import {
  AnimatedBackground,
  BACKGROUNDS,
  isBackgroundId,
  type BackgroundId,
} from '../backgrounds/AnimatedBackground';
import type { Song } from '../../types/song';
import { FONTS } from '../../theme/pixel';

const MAX_TITLE_LENGTH = 60;

/* --------------------------- Background picker -------------------------- */

interface BackgroundPickerProps {
  value: BackgroundId | 'default';
  onChange: (value: BackgroundId | 'default') => void;
  /** Show a "Default (theme)" option first, previewing this background. */
  defaultBackground?: BackgroundId;
  bpm?: number;
}

/** Grid of live, animated background previews. */
export function BackgroundPicker({ value, onChange, defaultBackground, bpm }: BackgroundPickerProps) {
  const { width } = useWindowDimensions();
  const cardW = Math.floor((Math.min(width, 520) - 32 - 16 - 20) / 3);
  const cardH = Math.round(cardW * 1.35);

  const options: { key: BackgroundId | 'default'; preview: BackgroundId; label: string }[] = [
    ...(defaultBackground
      ? [{ key: 'default' as const, preview: defaultBackground, label: 'Theme default' }]
      : []),
    ...BACKGROUNDS.map((b) => ({ key: b.id, preview: b.id, label: b.name })),
  ];

  return (
    <View style={styles.grid}>
      {options.map((opt) => {
        const selected = value === opt.key;
        return (
          <PressableScale
            key={opt.key}
            scaleTo={0.95}
            onPress={() => onChange(opt.key)}
            style={[styles.option, { width: cardW }, selected && styles.optionSelected]}
            accessibilityLabel={`Background: ${opt.label}`}
          >
            <View style={[styles.preview, { width: cardW - 8, height: cardH }]}>
              <AnimatedBackground
                id={opt.preview}
                opacity={0.9}
                bpm={bpm ?? 100}
                width={cardW - 8}
                height={cardH}
              />
              {/* Hint of lanes so the preview reads like the game board */}
              <View style={styles.previewLanes} pointerEvents="none">
                {[0, 1, 2].map((i) => (
                  <View key={i} style={styles.previewLaneLine} />
                ))}
              </View>
              {selected && (
                <View style={styles.checkBadge}>
                  <PixelIcon name="check" size={14} color="#ffffff" />
                </View>
              )}
            </View>
            <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]} numberOfLines={1}>
              {opt.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/* --------------------------- Shared sheet shell ------------------------- */

function Sheet({
  title,
  icon,
  onClose,
  children,
  footer,
}: {
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Animated.View entering={backdropIn} exiting={backdropOut} style={styles.backdrop}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <Animated.View entering={cardIn} exiting={cardOut} style={styles.sheet}>
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              {icon}
              <Text style={styles.title}>{title}</Text>
            </View>
            <PressableScale scaleTo={0.85} onPress={onClose} accessibilityLabel="Close">
              <PixelIcon name="close" size={21} color="#9aa7c2" />
            </PressableScale>
          </View>
          <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer}
        </Animated.View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

/* ---------------------------- Song settings ----------------------------- */

interface SongSettingsSheetProps {
  song: Song;
  defaultBackground: BackgroundId;
  onSave: (changes: { title: string; background: BackgroundId | 'default' }) => Promise<void>;
  onClose: () => void;
}

/** Rename a song and choose its gameplay background. */
export function SongSettingsSheet({ song, defaultBackground, onSave, onClose }: SongSettingsSheetProps) {
  const [title, setTitle] = useState(song.title);
  const [background, setBackground] = useState<BackgroundId | 'default'>(
    isBackgroundId(song.background) ? song.background : 'default'
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    // Collapse whitespace; reject empty names
    const clean = title.replace(/\s+/g, ' ').trim();
    if (!clean) {
      setError('The song needs a name.');
      return;
    }
    setSaving(true);
    try {
      await onSave({ title: clean.slice(0, MAX_TITLE_LENGTH), background });
    } catch {
      setError('Could not save changes.');
      setSaving(false);
    }
  };

  return (
    <Sheet
      title="Song settings"
      icon={<PixelIcon name="pencil" size={14} color="#4d8dff" />}
      onClose={onClose}
      footer={
        <PressableScale style={[styles.saveBtn, saving && styles.saveBtnBusy]} disabled={saving} onPress={handleSave}>
          <PixelIcon name="check" size={14} color="#ffffff" />
          <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
        </PressableScale>
      }
    >
      <Text style={styles.sectionLabel}>NAME</Text>
      <TextInput
        value={title}
        onChangeText={(t) => {
          setTitle(t);
          setError(null);
        }}
        maxLength={MAX_TITLE_LENGTH}
        placeholder="Song name"
        placeholderTextColor="#6b7a99"
        style={styles.input}
        returnKeyType="done"
      />
      <View style={styles.inputMetaRow}>
        {error ? <Text style={styles.errorText}>{error}</Text> : <View />}
        <Text style={styles.counter}>
          {title.length}/{MAX_TITLE_LENGTH}
        </Text>
      </View>

      <Text style={styles.sectionLabel}>BACKGROUND</Text>
      <Text style={styles.sectionHint}>Plays softly behind the tiles while you play this song.</Text>
      <BackgroundPicker
        value={background}
        onChange={setBackground}
        defaultBackground={defaultBackground}
        bpm={song.bpm}
      />
    </Sheet>
  );
}

/* ----------------------------- Theme settings --------------------------- */

interface ThemeSettingsSheetProps {
  value: BackgroundId;
  onChange: (bg: BackgroundId) => void;
  onClose: () => void;
}

/** App-wide theme: the default background for menus and songs set to "Theme default". */
export function ThemeSettingsSheet({ value, onChange, onClose }: ThemeSettingsSheetProps) {
  return (
    <Sheet title="App theme" icon={<PixelIcon name="palette" size={18} color="#4d8dff" />} onClose={onClose}>
      <Text style={styles.sectionLabel}>THEME BACKGROUND</Text>
      <Text style={styles.sectionHint}>
        Shown behind the song list, and during any song whose background is set to “Theme default”.
      </Text>
      <BackgroundPicker value={value} onChange={(v) => v !== 'default' && onChange(v)} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 300,
    elevation: 300,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  sheet: {
    flex: 1,
    marginTop: 24,
    backgroundColor: '#0b1220',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 2,
    borderColor: '#15203a',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 11, },
  scrollContent: { paddingBottom: 16 },
  sectionLabel: { color: '#6b7a99', fontFamily: FONTS.body, fontSize: 15, letterSpacing: 1.5, marginTop: 8, marginBottom: 6 },
  sectionHint: { color: '#9aa7c2', fontFamily: FONTS.body, fontSize: 16, marginBottom: 10, lineHeight: 16 },
  input: {
    backgroundColor: '#070b14',
    borderWidth: 2,
    borderColor: '#1f2e52',
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#ffffff',
    fontFamily: FONTS.body,
    fontSize: 20,
  },
  inputMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginBottom: 8 },
  errorText: { color: '#FF6B4A', fontFamily: FONTS.body, fontSize: 16 },
  counter: { color: '#3a4a70', fontFamily: FONTS.body, fontSize: 15, },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  option: {
    padding: 4,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: '#15203a',
    backgroundColor: '#070b14',
    alignItems: 'center',
  },
  optionSelected: { borderColor: '#4d8dff' },
  preview: { borderRadius: 0, overflow: 'hidden', backgroundColor: '#05070d' },
  previewLanes: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
  },
  previewLaneLine: { width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)' },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 0,
    backgroundColor: '#FF6B4A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: { color: '#9aa7c2', fontFamily: FONTS.body, fontSize: 16, marginTop: 5, marginBottom: 2 },
  optionLabelSelected: { color: '#4d8dff', fontWeight: 'bold' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF6B4A',
    borderRadius: 0,
    paddingVertical: 14,
    marginTop: 8,
  },
  saveBtnBusy: { opacity: 0.6 },
  saveText: { color: '#ffffff', fontFamily: FONTS.body, fontSize: 20, },
});
