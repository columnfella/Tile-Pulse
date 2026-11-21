import React, { useEffect, useRef, useState } from 'react';
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
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { PixelIcon, type PixelIconName } from '../ui/PixelIcon';
import { PressableScale } from '../ui/PressableScale';
import { useScreenInsets } from '../ui/useScreenInsets';
import { BackgroundPicker } from '../ui/SongSettingsSheet';
import { AnimatedBackground, BACKGROUNDS, isBackgroundId, type BackgroundId } from '../backgrounds/AnimatedBackground';
import { getSession, register, signIn, signOut, type Session } from '../../services/account';
import { API_BASE, ApiUnavailableError, type Difficulty, type CopyMode } from '../../services/communityApi';
import {
  getUploadRecord,
  listShaders,
  uploadLevel,
  type CommunityShader,
  type UploadRecord,
  type UploadStep,
} from '../../services/levelUpload';
import type { Song } from '../../types/song';
import { storageService } from '../../services/storage';
import { FONTS, PIXEL } from '../../theme/pixel';

import { C, alpha, themedStyles, themed } from '../../theme/palette';
import { playerErrorMessage } from '../../services/playerError';
import { hasHardcoreClear } from '../../services/uploadGate';
import { useRouter } from 'expo-router';
const MAX_COVER_BYTES = 2 * 1024 * 1024;

const DIFFICULTIES: { key: Difficulty; label: string; color: string }[] = themed(() => ([
  { key: 'easy', label: 'Easy', color: C.blueSky },
  { key: 'normal', label: 'Normal', color: C.blue },
  { key: 'hard', label: 'Hard', color: C.blueStrong },
  { key: 'expert', label: 'Expert', color: PIXEL.accent },
]));

const STEP_TEXT: Record<UploadStep, string> = {
  song: 'Sending song info…',
  audio: 'Uploading audio…',
  level: 'Saving level…',
  cover: 'Uploading cover…',
  done: 'Done!',
};

// Player-friendly: never shows the server address or technical details
const errorText = (err: unknown) => playerErrorMessage(err);

/* --------------------------------- pieces --------------------------------- */

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

function Chip({ label, active, onPress, color = PIXEL.accent2 }: { label: string; active: boolean; onPress: () => void; color?: string }) {
  return (
    <PressableScale
      scaleTo={0.92}
      onPress={onPress}
      style={[styles.chip, active && { borderColor: color, backgroundColor: `${color}22` }]}
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && { color }]}>{label}</Text>
    </PressableScale>
  );
}

/** Cover preview: the picture fades in and fades out into the card at the bottom. */
function CoverPreview({ uri, title, subtitle }: { uri: string | null; title: string; subtitle: string }) {
  const opacity = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  useEffect(() => {
    opacity.value = 0;
  }, [uri, opacity]);
  return (
    <View style={styles.cover}>
      {uri ? (
        <Animated.View style={[StyleSheet.absoluteFill, style]}>
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onLoad={() => (opacity.value = withTiming(1, { duration: 450 }))}
          />
        </Animated.View>
      ) : (
        <View style={styles.coverEmpty}>
          <PixelIcon name="image" size={28} color={C.textFaint} />
          <Text style={styles.muted}>No cover picture</Text>
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
          {title || 'Untitled level'}
        </Text>
        <Text style={styles.coverSub} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

/* ---------------------------------- sheet ---------------------------------- */

interface UploadSheetProps {
  visible: boolean;
  /** The song as currently edited (latest notes and BPM). */
  song: Song;
  onClose: () => void;
}

export function UploadSheet({ visible, song, onClose }: UploadSheetProps) {
  const insets = useScreenInsets();

  // Account
  const [session, setSession] = useState<Session | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Level settings
  const [record, setRecord] = useState<UploadRecord | null>(null);
  const [name, setName] = useState(song.title);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [level, setLevel] = useState(5);
  const [visibility, setVisibility] = useState<'public' | 'unlisted'>('public');
  const [description, setDescription] = useState('');
  const [copyMode, setCopyMode] = useState<CopyMode>('free');
  const [copyPassword, setCopyPassword] = useState('');
  const [background, setBackground] = useState<BackgroundId>(isBackgroundId(song.background) ? song.background : 'swirl_ocean');
  const [pickingBackground, setPickingBackground] = useState(false);
  const [shaders, setShaders] = useState<CommunityShader[] | null>(null);
  const [shaderId, setShaderId] = useState<string | null>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null); // newly picked
  const [removeCover, setRemoveCover] = useState(false);

  // Upload rule: the chart must have been beaten in Hardcore first (null = checking)
  const [cleared, setCleared] = useState<boolean | null>(null);
  // Updating a posted level asks for a confirmation first
  const [confirmingUpdate, setConfirmingUpdate] = useState(false);
  const router = useRouter();

  // Upload
  const [step, setStep] = useState<UploadStep | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  // Load the session, the previous upload of this song and the shader catalog when opened
  useEffect(() => {
    if (!visible) return;
    setUploadError(null);
    setSuccess(null);
    setStep(null);
    setConfirmingUpdate(false);
    hasHardcoreClear(song).then(setCleared).catch(() => setCleared(false));
    getSession().then(setSession);
    listShaders().then(setShaders).catch(() => setShaders([]));
    if (loadedFor.current === song.id) return;
    loadedFor.current = song.id;
    getUploadRecord(song.id).then(async (r) => {
      setRecord(r);
      // Use the song's own cover picture unless the level already has one online
      if (!r?.hasCover && song.coverUri) {
        const local = await storageService.getCoverUri(song);
        if (local) setCoverUri(local);
      }
      if (!r) return;
      setName(r.name);
      setDifficulty(r.difficulty);
      setLevel(r.level);
      setVisibility(r.visibility);
      setDescription(r.description ?? '');
      setCopyMode(r.copyMode ?? 'free');
      if (isBackgroundId(r.background)) setBackground(r.background);
      setShaderId(r.shaderId);
    });
  }, [visible, song.id]);

  const handleAuth = async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      const s =
        authMode === 'signin'
          ? await signIn(username.trim(), password)
          : await register(username.trim(), (displayName || username).trim(), password);
      setSession(s);
      setPassword('');
    } catch (err) {
      setAuthError(errorText(err));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setSession(null);
  };

  const handlePickCover = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_COVER_BYTES) {
        setUploadError('That picture is over 2 MB — pick a smaller one or crop it.');
        return;
      }
      setCoverUri(asset.uri);
      setRemoveCover(false);
      setUploadError(null);
    } catch (err) {
      setUploadError(errorText(err));
    }
  };

  const busy = step !== null && step !== 'done';

  const handleUpload = async () => {
    if (busy) return;
    if (!name.trim()) {
      setUploadError('Give your level a name.');
      return;
    }
    if (!cleared) {
      setUploadError('Beat this level in Hardcore mode first.');
      return;
    }
    // Updating: everyone who downloaded it gets the new version, so confirm first
    if (record && !confirmingUpdate) {
      setConfirmingUpdate(true);
      return;
    }
    setConfirmingUpdate(false);
    setUploadError(null);
    setSuccess(null);
    try {
      const r = await uploadLevel(
        song,
        {
          name,
          difficulty,
          level,
          visibility,
          background,
          shaderId,
          cover: coverUri ?? (removeCover ? 'remove' : undefined),
          description,
          copyMode,
          copyPassword: copyPassword || undefined,
        },
        setStep
      );
      setRecord(r);
      setCopyPassword('');
      setCoverUri(null);
      setRemoveCover(false);
      setSuccess(visibility === 'public' ? 'Your level is live on Discover!' : 'Uploaded as unlisted (only people with the link).');
    } catch (err) {
      setStep(null);
      setUploadError(errorText(err));
      if (!(await getSession())) setSession(null); // session expired
    }
  };

  const isPreset = song.audioUri.startsWith('synthesized:');
  // A password is needed the first time "Password" is chosen
  const copyPasswordMissing =
    copyMode === 'password' && record?.copyMode !== 'password' && copyPassword.length < 4;
  const shownCover = coverUri ?? (record?.hasCover && !removeCover ? `${API_BASE}/api/v1/levels/${record.levelId}/cover?t=${record.uploadedAt}` : null);
  const bgName = BACKGROUNDS.find((b) => b.id === background)?.name ?? background;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <PixelIcon name="upload" size={14} color={PIXEL.accent} />
            <Text style={styles.title}>{record ? 'UPDATE LEVEL' : 'UPLOAD LEVEL'}</Text>
          </View>
          <PressableScale scaleTo={0.85} style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
            <PixelIcon name="close" size={14} color={PIXEL.text} />
          </PressableScale>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <CoverPreview
            uri={shownCover}
            title={name}
            subtitle={`${song.title} · ${DIFFICULTIES.find((d) => d.key === difficulty)!.label} ${level} · ${song.tiles.length} notes`}
          />

          {isPreset && (
            <Text style={styles.warn}>Built-in songs can’t be uploaded. Import your own audio from the Songs tab to share a level.</Text>
          )}

          {/* Account */}
          <Section title="ACCOUNT" icon="person">
            {session ? (
              <View style={styles.signedIn}>
                <Text style={styles.body}>
                  Signed in as <Text style={styles.strong}>{session.user.displayName}</Text> (@{session.user.username})
                </Text>
                <PressableScale scaleTo={0.92} style={styles.linkBtn} onPress={handleSignOut}>
                  <Text style={styles.linkText}>Sign out</Text>
                </PressableScale>
              </View>
            ) : (
              <View style={styles.gap}>
                <View style={styles.row}>
                  <Chip label="Sign in" active={authMode === 'signin'} onPress={() => setAuthMode('signin')} />
                  <Chip label="Create account" active={authMode === 'register'} onPress={() => setAuthMode('register')} />
                </View>
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Username"
                  placeholderTextColor={C.textSubtle}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  maxLength={32}
                  style={styles.input}
                />
                {authMode === 'register' && (
                  <TextInput
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Display name (shown on your levels)"
                    placeholderTextColor={C.textSubtle}
                    maxLength={50}
                    style={styles.input}
                  />
                )}
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder={authMode === 'register' ? 'Password (10+ characters)' : 'Password'}
                  placeholderTextColor={C.textSubtle}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                  maxLength={128}
                  style={styles.input}
                  onSubmitEditing={handleAuth}
                />
                {authError ? <Text style={styles.error}>{authError}</Text> : null}
                <PressableScale
                  scaleTo={0.96}
                  style={[styles.secondaryBtn, (authBusy || !username || !password) && styles.btnDisabled]}
                  disabled={authBusy || !username || !password}
                  onPress={handleAuth}
                >
                  {authBusy ? <ActivityIndicator size="small" color={PIXEL.accent2} /> : null}
                  <Text style={styles.secondaryText}>{authMode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}</Text>
                </PressableScale>
              </View>
            )}
          </Section>

          {/* Level details */}
          <Section title="LEVEL" icon="note">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Level name"
              placeholderTextColor={C.textSubtle}
              maxLength={60}
              style={styles.input}
            />
            <Text style={styles.label}>DIFFICULTY</Text>
            <View style={styles.row}>
              {DIFFICULTIES.map((d) => (
                <Chip key={d.key} label={d.label} color={d.color} active={difficulty === d.key} onPress={() => setDifficulty(d.key)} />
              ))}
            </View>
            <Text style={styles.label}>LEVEL (1–20)</Text>
            <View style={styles.stepper}>
              <PressableScale scaleTo={0.85} style={styles.stepBtn} disabled={level <= 1} onPress={() => setLevel((l) => Math.max(1, l - 1))}>
                <PixelIcon name="minus" size={7} color={level <= 1 ? C.textFaint : PIXEL.text} />
              </PressableScale>
              <Text style={styles.stepValue}>{level}</Text>
              <PressableScale scaleTo={0.85} style={styles.stepBtn} disabled={level >= 20} onPress={() => setLevel((l) => Math.min(20, l + 1))}>
                <PixelIcon name="plus" size={7} color={level >= 20 ? C.textFaint : PIXEL.text} />
              </PressableScale>
            </View>
            <Text style={styles.label}>WHO CAN FIND IT</Text>
            <View style={styles.row}>
              <Chip label="Public (Discover)" active={visibility === 'public'} onPress={() => setVisibility('public')} />
              <Chip label="Unlisted" active={visibility === 'unlisted'} onPress={() => setVisibility('unlisted')} />
            </View>
            <Text style={styles.label}>DESCRIPTION</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Tell players about your level (optional)"
              placeholderTextColor={C.textSubtle}
              maxLength={500}
              multiline
              style={[styles.input, styles.multiline]}
            />
            <Text style={styles.counter}>{description.length}/500</Text>
          </Section>

          {/* Copy permission */}
          <Section title="COPYING" icon="lock">
            <Text style={styles.muted}>Can other players copy this level into their own editor?</Text>
            <View style={styles.row}>
              <Chip label="Free to copy" active={copyMode === 'free'} onPress={() => setCopyMode('free')} />
              <Chip label="Password" active={copyMode === 'password'} onPress={() => setCopyMode('password')} />
              <Chip label="No copying" color={PIXEL.accent} active={copyMode === 'none'} onPress={() => setCopyMode('none')} />
            </View>
            {copyMode === 'password' ? (
              <>
                <TextInput
                  value={copyPassword}
                  onChangeText={setCopyPassword}
                  placeholder={record?.copyMode === 'password' ? 'New copy password (leave empty to keep it)' : 'Copy password (4+ characters)'}
                  placeholderTextColor={C.textSubtle}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={64}
                  style={styles.input}
                />
                <Text style={styles.note}>Share it with players you want to let copy your level. It’s stored encrypted.</Text>
              </>
            ) : null}
          </Section>

          {/* Cover */}
          <Section title="COVER PICTURE" icon="image">
            <Text style={styles.muted}>Shown on your level’s card in Discover. JPEG/PNG, cropped to 16:9, max 2 MB.</Text>
            <View style={styles.row}>
              <PressableScale scaleTo={0.94} style={styles.secondaryBtn} onPress={handlePickCover}>
                <PixelIcon name="image" size={14} color={PIXEL.accent2} />
                <Text style={styles.secondaryText}>{shownCover ? 'CHANGE' : 'CHOOSE PICTURE'}</Text>
              </PressableScale>
              {shownCover ? (
                <PressableScale
                  scaleTo={0.94}
                  style={styles.linkBtn}
                  onPress={() => {
                    setCoverUri(null);
                    setRemoveCover(Boolean(record?.hasCover));
                  }}
                >
                  <Text style={[styles.linkText, { color: PIXEL.accent }]}>Remove</Text>
                </PressableScale>
              ) : null}
            </View>
          </Section>

          {/* Background */}
          <Section title="BACKGROUND" icon="palette">
            <View style={styles.bgRow}>
              <View style={styles.bgPreview}>
                <AnimatedBackground id={background} opacity={0.9} bpm={song.bpm} width={72} height={96} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.body}>{bgName}</Text>
                <Text style={styles.muted}>Plays behind the lanes for everyone who downloads your level.</Text>
                <PressableScale scaleTo={0.94} style={[styles.linkBtn, styles.alignStart]} onPress={() => setPickingBackground((p) => !p)}>
                  <Text style={styles.linkText}>{pickingBackground ? 'Done' : 'Change background'}</Text>
                </PressableScale>
              </View>
            </View>
            {pickingBackground && (
              <Animated.View entering={FadeIn.duration(150)}>
                <BackgroundPicker
                  value={background}
                  onChange={(v) => v !== 'default' && setBackground(v)}
                  bpm={song.bpm}
                />
              </Animated.View>
            )}

            <Text style={styles.label}>PLAYER SHADERS</Text>
            {shaders === null ? (
              <ActivityIndicator size="small" color={PIXEL.accent2} style={styles.alignStart} />
            ) : shaders.length === 0 ? (
              <Text style={styles.muted}>No approved player shaders yet.</Text>
            ) : (
              <View style={styles.row}>
                <Chip label="None" active={shaderId === null} onPress={() => setShaderId(null)} />
                {shaders.map((sh) => (
                  <Chip key={sh.id} label={`✦ ${sh.name}`} active={shaderId === sh.id} onPress={() => setShaderId(sh.id)} />
                ))}
              </View>
            )}
            <Text style={styles.note}>
              Player shaders are reviewed before they appear. Uploading your own shader and playing them in-game are coming
              soon — for now a chosen shader is shown on your level’s card.
            </Text>
          </Section>
        </ScrollView>

        {/* Footer: upload */}
        <View style={styles.footer}>
          {/* Verification: the chart must be beaten in Hardcore before it can be posted.
              Any change to the notes or BPM needs a new verification. */}
          {cleared !== null ? (
            cleared ? (
              <View style={styles.verifiedRow} accessibilityLabel="Level verified">
                <View style={styles.verifiedCheck}>
                  <PixelIcon name="check" size={12} color={C.onAccent} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.verifiedTitle}>VERIFIED</Text>
                  <Text style={styles.gateText}>Beaten in Hardcore. Changing notes or BPM needs a new verification.</Text>
                </View>
              </View>
            ) : (
              <View style={styles.gateBox}>
                <View style={styles.gateHead}>
                  <PixelIcon name="skull" size={14} color={C.danger} />
                  <Text style={styles.gateTitle}>NOT VERIFIED</Text>
                </View>
                <Text style={styles.gateText}>
                  {record
                    ? 'The notes changed since your last verification. Beat it in Hardcore (one miss ends the run) to verify it again.'
                    : 'Every posted level must be beatable: beat it in Hardcore mode (one miss ends the run) to verify it.'}
                </Text>
                <PressableScale
                  scaleTo={0.95}
                  style={styles.gateBtn}
                  accessibilityLabel="Verify level"
                  onPress={() => {
                    onClose();
                    router.push(`/play/${song.id}?hardcore=1&verify=1`);
                  }}
                >
                  <PixelIcon name="check" size={12} color={C.onAccent} />
                  <Text style={styles.primaryText}>VERIFY · PLAY IN HARDCORE</Text>
                </PressableScale>
              </View>
            )
          ) : null}
          {confirmingUpdate ? (
            <View style={styles.gateBox}>
              <Text style={styles.gateTitle}>UPDATE “{name.trim()}”?</Text>
              <Text style={styles.gateText}>Everyone who downloaded it gets the new version automatically.</Text>
              <PressableScale scaleTo={0.95} style={styles.cancelUpdateBtn} onPress={() => setConfirmingUpdate(false)}>
                <Text style={styles.cancelUpdateText}>CANCEL</Text>
              </PressableScale>
            </View>
          ) : null}
          {uploadError ? <Text style={styles.error}>{uploadError}</Text> : null}
          {success ? (
            <Animated.View entering={FadeIn.duration(200)} style={styles.successRow}>
              <PixelIcon name="check" size={14} color={PIXEL.accent2} />
              <Text style={styles.successText}>{success}</Text>
            </Animated.View>
          ) : null}
          <PressableScale
            scaleTo={0.96}
            style={[styles.primaryBtn, (!session || busy || isPreset || copyPasswordMissing || !cleared) && styles.btnDisabled]}
            disabled={!session || busy || isPreset || copyPasswordMissing || !cleared}
            onPress={handleUpload}
          >
            {busy ? <ActivityIndicator size="small" color={C.onAccent} /> : <PixelIcon name="upload" size={14} color={C.onAccent} />}
            <Text style={styles.primaryText}>
              {busy
                ? STEP_TEXT[step!]
                : !session
                  ? 'SIGN IN TO UPLOAD'
                  : confirmingUpdate
                    ? 'CONFIRM UPDATE'
                    : record
                      ? 'UPDATE LEVEL'
                      : 'UPLOAD LEVEL'}
            </Text>
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  root: { flex: 1, backgroundColor: PIXEL.bg },
  flex: { flex: 1 },
  gap: { gap: 8 },
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

  cover: { height: 170, backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: PIXEL.panelLight, overflow: 'hidden' },
  coverEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 40 },
  coverText: { position: 'absolute', left: 12, right: 12, bottom: 10 },
  coverTitle: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 12 },
  coverSub: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 17, marginTop: 4 },

  section: { backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: PIXEL.panelLight, padding: 12, gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 9 },
  label: { color: C.textSubtle, fontFamily: FONTS.pixel, fontSize: 7, marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderWidth: 2, borderColor: PIXEL.panelLight, backgroundColor: C.bgDeep },
  chipText: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 17 },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  counter: { color: C.textSubtle, fontFamily: FONTS.body, fontSize: 14, alignSelf: 'flex-end' },
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
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PIXEL.panelLight,
    borderWidth: 2,
    borderColor: C.outline,
  },
  stepValue: { color: PIXEL.accent2, fontFamily: FONTS.pixel, fontSize: 12, minWidth: 30, textAlign: 'center' },

  signedIn: { gap: 4 },
  body: { color: PIXEL.text, fontFamily: FONTS.body, fontSize: 18 },
  strong: { color: PIXEL.accent2 },
  muted: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 16 },
  note: { color: C.textSubtle, fontFamily: FONTS.body, fontSize: 15, marginTop: 4 },
  warn: { color: PIXEL.accent, fontFamily: FONTS.body, fontSize: 17, textAlign: 'center' },
  error: { color: PIXEL.accent, fontFamily: FONTS.body, fontSize: 17 },

  bgRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  bgPreview: { width: 76, height: 100, borderWidth: 2, borderColor: PIXEL.panelLight, overflow: 'hidden', backgroundColor: C.black },
  alignStart: { alignSelf: 'flex-start' },

  linkBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  linkText: { color: PIXEL.accent2, fontFamily: FONTS.body, fontSize: 18 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: PIXEL.accent2,
    backgroundColor: alpha(C.blue, 0.1),
  },
  secondaryText: { color: PIXEL.accent2, fontFamily: FONTS.pixel, fontSize: 9 },
  btnDisabled: { opacity: 0.45 },

  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 2, borderColor: C.success, backgroundColor: alpha(C.success, 0.1) },
  verifiedCheck: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.success, borderWidth: 2, borderColor: C.outline },
  verifiedTitle: { color: C.success, fontFamily: FONTS.pixel, fontSize: 8, marginBottom: 2 },
  gateBox: { gap: 6, padding: 10, borderWidth: 2, borderColor: C.danger, backgroundColor: alpha(C.danger, 0.08) },
  gateHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gateTitle: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 8, lineHeight: 12 },
  gateText: { color: C.textDim, fontFamily: FONTS.body, fontSize: 16, lineHeight: 17 },
  gateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 9, backgroundColor: C.danger, borderWidth: 2, borderColor: C.outline },
  cancelUpdateBtn: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderWidth: 2, borderColor: C.panelLight },
  cancelUpdateText: { color: C.textDim, fontFamily: FONTS.pixel, fontSize: 7 },
  footer: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderTopWidth: 2, borderTopColor: PIXEL.panelLight, backgroundColor: PIXEL.panel },
  successRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  successText: { color: PIXEL.accent2, fontFamily: FONTS.body, fontSize: 18, flex: 1 },
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
  primaryText: { color: C.onAccent, fontFamily: FONTS.pixel, fontSize: 10 },
}));
