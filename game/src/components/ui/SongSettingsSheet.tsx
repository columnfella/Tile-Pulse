import React, { useState } from 'react';
import {
  Image,
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

import { C, alpha, themedStyles } from '../../theme/palette';
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
                  <PixelIcon name="check" size={14} color={C.textStrong} />
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

export function Sheet({
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
              <PixelIcon name="close" size={21} color={C.textDim} />
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
  /** Cover picture controls (shown when given). */
  cover?: { uri: string | null; onPick: () => Promise<void>; onRemove: () => Promise<void> };
}

/** Rename a song and choose its gameplay background. */
export function SongSettingsSheet({ song, defaultBackground, onSave, onClose, cover }: SongSettingsSheetProps) {
  const [coverBusy, setCoverBusy] = useState(false);
  const coverAction = async (fn: () => Promise<void>) => {
    setCoverBusy(true);
    try {
      await fn();
    } finally {
      setCoverBusy(false);
    }
  };
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
      icon={<PixelIcon name="pencil" size={14} color={C.blue} />}
      onClose={onClose}
      footer={
        <PressableScale style={[styles.saveBtn, saving && styles.saveBtnBusy]} disabled={saving} onPress={handleSave}>
          <PixelIcon name="check" size={14} color={C.textStrong} />
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
        placeholderTextColor={C.textSubtle}
        style={styles.input}
        returnKeyType="done"
      />
      <View style={styles.inputMetaRow}>
        {error ? <Text style={styles.errorText}>{error}</Text> : <View />}
        <Text style={styles.counter}>
          {title.length}/{MAX_TITLE_LENGTH}
        </Text>
      </View>

      {cover ? (
        <>
          <Text style={styles.sectionLabel}>COVER PICTURE</Text>
          <View style={styles.coverBox}>
            {cover.uri ? (
              <Image source={{ uri: cover.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <PixelIcon name="image" size={21} color={C.textFaint} />
            )}
          </View>
          <View style={styles.coverRow}>
            <PressableScale
              scaleTo={0.94}
              style={[styles.coverBtn, coverBusy && styles.saveBtnBusy]}
              disabled={coverBusy}
              onPress={() => void coverAction(cover.onPick)}
            >
              <PixelIcon name="image" size={14} color={C.blue} />
              <Text style={styles.coverBtnText}>{cover.uri ? 'Change cover' : 'Add cover'}</Text>
            </PressableScale>
            {cover.uri ? (
              <PressableScale
                scaleTo={0.94}
                style={[styles.coverBtn, coverBusy && styles.saveBtnBusy]}
                disabled={coverBusy}
                onPress={() => void coverAction(cover.onRemove)}
              >
                <PixelIcon name="close" size={14} color={C.textDim} />
                <Text style={styles.coverBtnText}>Remove</Text>
              </PressableScale>
            ) : null}
          </View>
        </>
      ) : null}

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

const styles = themedStyles(() => ({
  flex: { flex: 1 },
  coverBox: {
    height: 120,
    backgroundColor: C.bgDeep,
    borderWidth: 2,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverRow: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 4 },
  coverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: C.line,
    backgroundColor: C.bgDeep,
  },
  coverBtnText: { color: C.text, fontFamily: FONTS.body, fontSize: 17 },
  backdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 300,
    elevation: 300,
    backgroundColor: alpha(C.black, 0.75),
  },
  sheet: {
    flex: 1,
    marginTop: 24,
    backgroundColor: C.panel,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 2,
    borderColor: C.panelLight,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 11, },
  scrollContent: { paddingBottom: 16 },
  sectionLabel: { color: C.textSubtle, fontFamily: FONTS.body, fontSize: 15, letterSpacing: 1.5, marginTop: 8, marginBottom: 6 },
  sectionHint: { color: C.textDim, fontFamily: FONTS.body, fontSize: 16, marginBottom: 10, lineHeight: 16 },
  input: {
    backgroundColor: C.bgDeep,
    borderWidth: 2,
    borderColor: C.line,
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: C.textStrong,
    fontFamily: FONTS.body,
    fontSize: 20,
  },
  inputMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginBottom: 8 },
  errorText: { color: C.accent, fontFamily: FONTS.body, fontSize: 16 },
  counter: { color: C.textFaint, fontFamily: FONTS.body, fontSize: 15, },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  option: {
    padding: 4,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: C.panelLight,
    backgroundColor: C.bgDeep,
    alignItems: 'center',
  },
  optionSelected: { borderColor: C.blue },
  preview: { borderRadius: 0, overflow: 'hidden', backgroundColor: C.bg },
  previewLanes: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
  },
  previewLaneLine: { width: StyleSheet.hairlineWidth, backgroundColor: alpha(C.white, 0.08) },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 0,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: { color: C.textDim, fontFamily: FONTS.body, fontSize: 16, marginTop: 5, marginBottom: 2 },
  optionLabelSelected: { color: C.blue, fontWeight: 'bold' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: 0,
    paddingVertical: 14,
    marginTop: 8,
  },
  saveBtnBusy: { opacity: 0.6 },
  saveText: { color: C.textStrong, fontFamily: FONTS.body, fontSize: 20, },
}));
