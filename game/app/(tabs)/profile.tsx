/**
 * Profile tab: sign in / create an account, then see your profile the way
 * others see it (banner, picture, stats, play history, uploaded levels) and
 * manage the account: pictures, banner colour, display name, a one-time
 * username change, password, and what others can see.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ScreenView } from '../../src/components/ui/ScreenView';
import { publishMyProfile } from '../../src/services/myAvatar';
import { PixelIcon, type PixelIconName } from '../../src/components/ui/PixelIcon';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { DIFFICULTY_COLOR } from '../../src/components/ui/LevelCardParts';
import { BadgeIcon, BadgeList } from '../../src/components/ui/Badges';
import { FONTS, PIXEL } from '../../src/theme/pixel';
import { API_BASE, ApiUnavailableError } from '../../src/services/communityApi';
import { deleteAccount, getSession, onSessionChange, register, signIn, signOut, type Session } from '../../src/services/account';
import { deleteUploadedLevel } from '../../src/services/levelUpload';
import {
  DEFAULT_BANNER_COLOR,
  avatarUrl,
  bannerUrl,
  changePassword,
  changeUsername,
  getMyProfile,
  getProfile,
  levelCoverUrl,
  removeProfileImage,
  setProfileImage,
  updateMyProfile,
  type HistoryEntry,
  type MyProfile,
  type Privacy,
  type ProfileLevel,
  type ProfileUpload,
  type PublicProfile,
} from '../../src/services/profile';

import { C, alpha, themedStyles } from '../../src/theme/palette';
// Banner colours a player can pick: saved on the server as their choice, so fixed (not theme colours)
const BANNER_COLORS = ['#2f6bff', '#FF6B4A', '#22c46e', '#8b5cf6', '#f5b83d', '#e64980', '#14b8a6', '#15203a'];
const PASSWORD_MIN = 10;

type Tab = 'history' | 'uploads' | 'settings';

const errorText = (err: unknown) =>
  err instanceof ApiUnavailableError
    ? `Can’t reach the community server (${API_BASE}).`
    : err instanceof Error
      ? err.message
      : 'Something went wrong.';

function timeAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ms).toLocaleDateString();
}

/* --------------------------------- pieces --------------------------------- */

function Section({ title, icon, children }: { title: string; icon: PixelIconName; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <PixelIcon name={icon} size={14} color={PIXEL.accent2} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <PressableScale scaleTo={0.94} onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </PressableScale>
  );
}

function Button({
  label,
  onPress,
  busy,
  disabled,
  kind = 'secondary',
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  kind?: 'primary' | 'secondary' | 'danger';
}) {
  const off = disabled || busy;
  return (
    <PressableScale
      scaleTo={0.96}
      disabled={off}
      onPress={onPress}
      style={[styles.btn, kind === 'primary' && styles.btnPrimary, kind === 'danger' && styles.btnDanger, off && styles.btnDisabled]}
    >
      {busy ? <ActivityIndicator size="small" color={kind === 'primary' ? C.onAccent : PIXEL.accent2} /> : null}
      <Text style={[styles.btnText, kind === 'primary' && styles.btnTextPrimary, kind === 'danger' && styles.btnTextDanger]}>
        {label}
      </Text>
    </PressableScale>
  );
}

function Field(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor={C.textSubtle} autoCapitalize="none" autoCorrect={false} {...props} style={styles.input} />;
}

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <PressableScale scaleTo={0.98} onPress={() => onChange(!value)} style={styles.toggleRow} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <View style={styles.flex}>
        <Text style={styles.body}>{label}</Text>
        <Text style={styles.muted}>{hint}</Text>
      </View>
      <View style={[styles.switch, value && styles.switchOn]}>
        <View style={[styles.switchKnob, value && styles.switchKnobOn]} />
      </View>
      <Text style={[styles.switchLabel, value && styles.switchLabelOn]}>{value ? 'PUBLIC' : 'PRIVATE'}</Text>
    </PressableScale>
  );
}

/** Square pixel-framed profile picture (initial on a colour when there's none). */
function Avatar({ uri, name, color, size }: { uri: string | null; name: string; color: string; size: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, backgroundColor: color }]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} />
      ) : (
        <Text style={[styles.avatarInitial, { fontSize: size * 0.36 }]}>{(name[0] ?? '?').toUpperCase()}</Text>
      )}
    </View>
  );
}

function LevelThumb({ level }: { level: ProfileLevel }) {
  const uri = levelCoverUrl(level.id, level.cover);
  return (
    <View style={styles.thumb}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} /> : <PixelIcon name="note" size={14} color={PIXEL.textDim} />}
    </View>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  return (
    <View style={styles.listRow}>
      <LevelThumb level={entry.level} />
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {entry.level.name}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          {entry.level.song.title}
          {entry.level.song.artist ? ` · ${entry.level.song.artist}` : ''}
        </Text>
        <View style={styles.rowMeta}>
          <Text style={[styles.diffTag, { color: DIFFICULTY_COLOR[entry.level.difficulty] }]}>
            {entry.level.difficulty.toUpperCase()} {entry.level.level}
          </Text>
          {entry.hardcore ? <Text style={styles.hcTag}>HARDCORE</Text> : null}
          <Text style={styles.muted}>{timeAgo(entry.playedAt)}</Text>
        </View>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowScore}>{entry.score.toLocaleString()}</Text>
        <Text style={styles.muted}>{entry.accuracy.toFixed(1)}%</Text>
      </View>
    </View>
  );
}

function UploadRow({ level, onDelete }: { level: ProfileUpload; onDelete?: () => void }) {
  return (
    <View style={styles.listRow}>
      <LevelThumb level={level} />
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {level.name}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          {level.song.title}
          {level.song.artist ? ` · ${level.song.artist}` : ''}
        </Text>
        <View style={styles.rowMeta}>
          <Text style={[styles.diffTag, { color: DIFFICULTY_COLOR[level.difficulty] }]}>
            {level.difficulty.toUpperCase()} {level.level}
          </Text>
          {level.visibility && level.visibility !== 'public' ? (
            <Text style={styles.visTag}>{level.visibility.toUpperCase()}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowScore}>{level.plays}</Text>
        <Text style={styles.muted}>plays</Text>
      </View>
      {onDelete ? (
        <PressableScale scaleTo={0.85} onPress={onDelete} style={styles.rowDelete} accessibilityLabel={`Delete ${level.name} from the server`}>
          <PixelIcon name="trash" size={14} color={PIXEL.accent} />
        </PressableScale>
      ) : null}
    </View>
  );
}

/* --------------------------------- sign in -------------------------------- */

function AuthForm({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const s =
        mode === 'signin'
          ? await signIn(username.trim(), password)
          : await register(username.trim(), (displayName || username).trim(), password);
      setPassword('');
      onSignedIn(s);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.gap12}>
      <View style={styles.authHero}>
        <PixelIcon name="person" size={42} color={PIXEL.accent} />
        <Text style={styles.authTitle}>YOUR PROFILE</Text>
        <Text style={styles.mutedCenter}>
          Sign in to upload levels, keep a history of your plays and customise your profile.
        </Text>
      </View>
      <Section title="ACCOUNT" icon="shield">
        <View style={styles.row}>
          <Chip label="Sign in" active={mode === 'signin'} onPress={() => setMode('signin')} />
          <Chip label="Create account" active={mode === 'register'} onPress={() => setMode('register')} />
        </View>
        <Field value={username} onChangeText={setUsername} placeholder="Username" autoComplete="username" maxLength={32} />
        {mode === 'register' && (
          <Field value={displayName} onChangeText={setDisplayName} placeholder="Display name" autoCapitalize="words" maxLength={50} />
        )}
        <Field
          value={password}
          onChangeText={setPassword}
          placeholder={mode === 'register' ? `Password (${PASSWORD_MIN}+ characters)` : 'Password'}
          secureTextEntry
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          maxLength={128}
          onSubmitEditing={submit}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          kind="primary"
          label={mode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}
          onPress={submit}
          busy={busy}
          disabled={!username || !password}
        />
      </Section>
    </Animated.View>
  );
}

/* --------------------------------- settings -------------------------------- */

/** A picture change waiting to be saved: a newly picked file, or removing the current one. */
type PendingImage = { uri: string } | 'remove' | null;

interface Draft {
  displayName: string;
  bannerColor: string;
  privacy: Privacy;
  avatar: PendingImage;
  banner: PendingImage;
}

const draftFrom = (me: MyProfile): Draft => ({
  displayName: me.displayName,
  bannerColor: me.bannerColor ?? DEFAULT_BANNER_COLOR,
  privacy: { ...me.privacy },
  avatar: null,
  banner: null,
});

/**
 * Account settings. Profile changes (pictures, banner colour, display name,
 * privacy) are collected locally and sent in one go when you press Save, so
 * tapping around doesn't send a request per change. Username, password and
 * account deletion are separate actions with their own buttons.
 */
function Settings({ me, onChange }: { me: MyProfile; onChange: (p: MyProfile) => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(me));
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ key: string; text: string; error?: boolean } | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [usernamePassword, setUsernamePassword] = useState('');
  const [confirmUsername, setConfirmUsername] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [deletePw, setDeletePw] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const patch = (changes: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...changes }));
    setMessage(null);
  };

  const cleanName = draft.displayName.replace(/\s+/g, ' ').trim();
  const nameChanged = cleanName !== me.displayName;
  const colorChanged = draft.bannerColor.toLowerCase() !== (me.bannerColor ?? DEFAULT_BANNER_COLOR).toLowerCase();
  const privacyChanged = (Object.keys(draft.privacy) as (keyof Privacy)[]).filter((k) => draft.privacy[k] !== me.privacy[k]);
  const dirty = nameChanged || colorChanged || privacyChanged.length > 0 || draft.avatar !== null || draft.banner !== null;

  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key);
    setMessage(null);
    try {
      const text = await fn();
      if (text) setMessage({ key, text });
    } catch (err) {
      setMessage({ key, text: errorText(err), error: true });
    } finally {
      setBusy(null);
    }
  };
  const note = (key: string) =>
    message?.key === key ? <Text style={message.error ? styles.error : styles.success}>{message.text}</Text> : null;

  const pickImage = async (kind: 'avatar' | 'banner') => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: kind === 'avatar' ? [1, 1] : [3, 1],
        quality: 0.6,
      });
      if (!r.canceled && r.assets?.[0]) patch({ [kind]: { uri: r.assets[0].uri } } as Partial<Draft>);
    } catch {
      setMessage({ key: 'save', text: 'Couldn’t open your pictures.', error: true });
    }
  };

  /** Sends everything that changed: one profile update, then any picture uploads. */
  const save = async () => {
    if (!dirty || saving) return;
    if (!cleanName) return setMessage({ key: 'save', text: 'Your display name can’t be empty.', error: true });
    setSaving(true);
    setMessage(null);
    try {
      let latest = me;
      const changes: Parameters<typeof updateMyProfile>[0] = {};
      if (nameChanged) changes.displayName = cleanName;
      if (colorChanged) changes.bannerColor = draft.bannerColor;
      if (privacyChanged.length) changes.privacy = Object.fromEntries(privacyChanged.map((k) => [k, draft.privacy[k]]));
      if (Object.keys(changes).length) latest = await updateMyProfile(changes);
      for (const kind of ['avatar', 'banner'] as const) {
        const pending = draft[kind];
        if (pending === 'remove') latest = await removeProfileImage(kind);
        else if (pending) latest = await setProfileImage(kind, pending.uri);
      }
      onChange(latest);
      setDraft(draftFrom(latest));
      setMessage({ key: 'save', text: 'Profile saved.' });
    } catch (err) {
      setMessage({ key: 'save', text: errorText(err), error: true });
    } finally {
      setSaving(false);
    }
  };

  // What the pictures will look like after saving
  const avatarPreview = draft.avatar === 'remove' ? null : draft.avatar ? draft.avatar.uri : avatarUrl(me.id, me.avatar);
  const bannerPreview = draft.banner === 'remove' ? null : draft.banner ? draft.banner.uri : bannerUrl(me.id, me.banner);

  return (
    <View style={styles.gap12}>
      {dirty ? (
        <View style={styles.unsaved}>
          <Text style={styles.unsavedText}>Unsaved changes — press SAVE CHANGES below.</Text>
        </View>
      ) : null}

      <Section title="PICTURES" icon="image">
        <View style={[styles.previewBanner, { backgroundColor: draft.bannerColor }]}>
          {bannerPreview ? <Image source={{ uri: bannerPreview }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          <View style={styles.previewAvatarWrap}>
            <Avatar uri={avatarPreview} name={cleanName || me.displayName} color={draft.bannerColor} size={56} />
          </View>
        </View>
        <Text style={styles.label}>PROFILE PICTURE</Text>
        <View style={styles.row}>
          <Button label={avatarPreview ? 'CHANGE' : 'ADD PICTURE'} onPress={() => pickImage('avatar')} />
          {avatarPreview ? <Button label="REMOVE" kind="danger" onPress={() => patch({ avatar: me.avatar ? 'remove' : null })} /> : null}
          {draft.avatar ? <Button label="UNDO" onPress={() => patch({ avatar: null })} /> : null}
        </View>
        <Text style={styles.label}>BANNER</Text>
        <View style={styles.row}>
          <Button label={bannerPreview ? 'CHANGE' : 'ADD BANNER'} onPress={() => pickImage('banner')} />
          {bannerPreview ? <Button label="REMOVE" kind="danger" onPress={() => patch({ banner: me.banner ? 'remove' : null })} /> : null}
          {draft.banner ? <Button label="UNDO" onPress={() => patch({ banner: null })} /> : null}
        </View>
        <Text style={styles.label}>BANNER COLOUR {bannerPreview ? '(shown without a banner picture)' : ''}</Text>
        <View style={styles.row}>
          {BANNER_COLORS.map((c) => (
            <PressableScale
              key={c}
              scaleTo={0.9}
              onPress={() => patch({ bannerColor: c })}
              style={[styles.swatch, { backgroundColor: c }, draft.bannerColor.toLowerCase() === c.toLowerCase() && styles.swatchActive]}
              accessibilityLabel={`Banner colour ${c}`}
            />
          ))}
        </View>
      </Section>

      <Section title="DISPLAY NAME" icon="person">
        <Field
          value={draft.displayName}
          onChangeText={(t) => patch({ displayName: t })}
          placeholder="Display name"
          autoCapitalize="words"
          maxLength={50}
        />
      </Section>

      <Section title="PRIVACY" icon="globe">
        <Toggle label="Profile" hint="Others can open your profile" value={draft.privacy.profile} onChange={(v) => patch({ privacy: { ...draft.privacy, profile: v } })} />
        <Toggle label="Play history" hint="Levels you played and your scores" value={draft.privacy.history} onChange={(v) => patch({ privacy: { ...draft.privacy, history: v } })} />
        <Toggle label="Uploaded levels" hint="Levels you shared" value={draft.privacy.uploads} onChange={(v) => patch({ privacy: { ...draft.privacy, uploads: v } })} />
      </Section>

      {/* One request for everything above */}
      <View style={styles.saveBar}>
        {note('save')}
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button kind="primary" label={saving ? 'SAVING…' : 'SAVE CHANGES'} onPress={save} busy={saving} disabled={!dirty} />
          </View>
          {dirty ? <Button label="DISCARD" onPress={() => (setDraft(draftFrom(me)), setMessage(null))} disabled={saving} /> : null}
        </View>
      </View>

      <Section title="USERNAME" icon="person">
        <Text style={styles.label}>@{me.username}</Text>
        {me.canChangeUsername ? (
          <>
            <Text style={styles.warn}>You can change your username only once. After that it’s permanent.</Text>
            <Field value={newUsername} onChangeText={(t) => (setNewUsername(t), setConfirmUsername(false))} placeholder="New username" maxLength={32} />
            <Field value={usernamePassword} onChangeText={setUsernamePassword} placeholder="Your password" secureTextEntry maxLength={128} />
            {confirmUsername ? (
              <View style={styles.row}>
                <Button
                  kind="danger"
                  label={`YES, BECOME @${newUsername.trim()}`}
                  busy={busy === 'username'}
                  onPress={() =>
                    run('username', async () => {
                      onChange(await changeUsername(newUsername.trim(), usernamePassword));
                      setUsernamePassword('');
                      setConfirmUsername(false);
                      return 'Username changed. This was your one change.';
                    })
                  }
                />
                <Button label="CANCEL" onPress={() => setConfirmUsername(false)} />
              </View>
            ) : (
              <Button
                label="CHANGE USERNAME (ONCE)"
                disabled={newUsername.trim().length < 3 || !usernamePassword}
                onPress={() => setConfirmUsername(true)}
              />
            )}
          </>
        ) : (
          <Text style={styles.muted}>You’ve already used your one username change.</Text>
        )}
        {note('username')}
      </Section>

      <Section title="PASSWORD" icon="shield">
        <Field value={currentPw} onChangeText={setCurrentPw} placeholder="Current password" secureTextEntry autoComplete="current-password" maxLength={128} />
        <Field value={newPw} onChangeText={setNewPw} placeholder={`New password (${PASSWORD_MIN}+ characters)`} secureTextEntry autoComplete="new-password" maxLength={128} />
        <Field value={confirmPw} onChangeText={setConfirmPw} placeholder="Repeat new password" secureTextEntry autoComplete="new-password" maxLength={128} />
        <Button
          label="CHANGE PASSWORD"
          busy={busy === 'password'}
          disabled={!currentPw || newPw.length < PASSWORD_MIN || !confirmPw}
          onPress={() =>
            run('password', async () => {
              if (newPw !== confirmPw) throw new Error('The new passwords don’t match.');
              await changePassword(currentPw, newPw);
              setCurrentPw('');
              setNewPw('');
              setConfirmPw('');
              return 'Password changed. Your other devices were signed out.';
            })
          }
        />
        {note('password')}
      </Section>

      <Button label="SIGN OUT" onPress={() => void signOut()} />

      <Section title="DELETE ACCOUNT" icon="trash">
        <Text style={styles.muted}>
          Permanently deletes your account, profile, play history, comments, likes and every level you uploaded. This can’t be undone.
        </Text>
        <Field value={deletePw} onChangeText={(t) => (setDeletePw(t), setConfirmDelete(false))} placeholder="Your password" secureTextEntry maxLength={128} />
        {confirmDelete ? (
          <>
            <Text style={styles.warn}>Are you sure? Everything above will be gone for good.</Text>
            <View style={styles.row}>
              <Button
                kind="danger"
                label="YES, DELETE MY ACCOUNT"
                busy={busy === 'delete'}
                onPress={() =>
                  run('delete', async () => {
                    await deleteAccount(deletePw);
                  })
                }
              />
              <Button label="CANCEL" onPress={() => setConfirmDelete(false)} />
            </View>
          </>
        ) : (
          <Button kind="danger" label="DELETE ACCOUNT" disabled={!deletePw} onPress={() => setConfirmDelete(true)} />
        )}
        {note('delete')}
      </Section>
    </View>
  );
}

/* --------------------------------- screen --------------------------------- */

export default function ProfileScreen() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [me, setMe] = useState<MyProfile | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [tab, setTab] = useState<Tab>('history');
  // Uploaded level waiting for the delete confirmation
  const [deleteLevel, setDeleteLevel] = useState<ProfileUpload | null>(null);
  const [deletingLevel, setDeletingLevel] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getSession().then(setSession);
    return onSessionChange((s) => {
      setSession(s);
      if (!s) {
        setMe(null);
        setProfile(null);
      }
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!(await getSession())) return;
    setLoading(true);
    setError(null);
    try {
      const mine = await getMyProfile();
      setMe(mine);
      publishMyProfile(mine);
      setProfile(await getProfile(mine.username));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Load when signing in and whenever you come back to the tab (new plays /
  // uploads). Only the token matters: a profile change updates the session
  // object too, and that must not trigger another round of requests.
  const token = session?.token;
  useFocusEffect(
    useCallback(() => {
      if (token) void refresh();
    }, [token, refresh])
  );

  const handleChange = (p: MyProfile) => {
    setMe(p);
    publishMyProfile(p);
    setProfile((prev) =>
      prev ? { ...prev, username: p.username, displayName: p.displayName, avatar: p.avatar, banner: p.banner, bannerColor: p.bannerColor } : prev
    );
  };

  const bannerColor = me?.bannerColor ?? DEFAULT_BANNER_COLOR;
  const banner = me ? bannerUrl(me.id, me.banner) : null;
  const avatar = me ? avatarUrl(me.id, me.avatar) : null;

  return (
    <ScreenView style={styles.root}>
      {/* Opened from the profile button on the Songs tab: a way back there */}
      <View style={styles.topBar}>
        <PressableScale
          scaleTo={0.9}
          style={styles.backBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.navigate('/(tabs)'))}
          accessibilityLabel="Back"
        >
          <PixelIcon name="chevronLeft" size={14} color={PIXEL.text} />
          <Text style={styles.backText}>BACK</Text>
        </PressableScale>
        <Text style={styles.topTitle}>PROFILE</Text>
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={session ? <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={PIXEL.accent2} /> : undefined}
        >
          {session === undefined ? (
            <ActivityIndicator color={PIXEL.accent2} style={styles.loader} />
          ) : !session ? (
            <AuthForm onSignedIn={setSession} />
          ) : !me ? (
            <View style={styles.center}>
              {error ? (
                <>
                  <Text style={styles.error}>{error}</Text>
                  <Button label="TRY AGAIN" onPress={refresh} />
                  <Button label="SIGN OUT" kind="danger" onPress={() => void signOut()} />
                </>
              ) : (
                <ActivityIndicator color={PIXEL.accent2} />
              )}
            </View>
          ) : (
            <Animated.View entering={FadeIn.duration(200)} style={styles.gap12}>
              {/* Header: banner, picture, names, stats — how others see you */}
              <View style={styles.card}>
                <View style={[styles.banner, { backgroundColor: bannerColor }]}>
                  {banner ? <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.avatarWrap}>
                    <Avatar uri={avatar} name={me.displayName} color={bannerColor} size={84} />
                  </View>
                  <View style={styles.nameRow}>
                    <Text style={[styles.displayName, styles.nameShrink]} numberOfLines={1}>
                      {me.displayName}
                    </Text>
                    <BadgeIcon id={me.badges?.[0]?.id} size={16} />
                  </View>
                  <Text style={styles.username}>
                    @{me.username}
                    {me.role === 'admin' ? '  · ADMIN' : ''}
                  </Text>
                  {me.badges?.length ? (
                    <View style={styles.badgeWrap}>
                      <BadgeList badges={me.badges} />
                    </View>
                  ) : null}
                  <Text style={styles.muted}>Joined {new Date(me.createdAt).toLocaleDateString()}</Text>
                  <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{me.stats.plays}</Text>
                      <Text style={styles.statLabel}>PLAYS</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{me.stats.uploads}</Text>
                      <Text style={styles.statLabel}>LEVELS</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={[styles.statValue, { color: me.privacy.profile ? PIXEL.accent2 : PIXEL.accent }]}>
                        {me.privacy.profile ? 'ON' : 'OFF'}
                      </Text>
                      <Text style={styles.statLabel}>PUBLIC</Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.row}>
                <Chip label="History" active={tab === 'history'} onPress={() => setTab('history')} />
                <Chip label="My levels" active={tab === 'uploads'} onPress={() => setTab('uploads')} />
                <Chip label="Settings" active={tab === 'settings'} onPress={() => setTab('settings')} />
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              {tab === 'history' && (
                <Section title={`HISTORY${me.privacy.history ? '' : ' · PRIVATE'}`} icon="clock">
                  {!profile?.history?.length ? (
                    <Text style={styles.muted}>No plays yet. Finish a community level from Discover and it shows up here.</Text>
                  ) : (
                    profile.history.map((h, i) => <HistoryRow key={`${h.level.id}-${h.playedAt}-${i}`} entry={h} />)
                  )}
                </Section>
              )}

              {tab === 'uploads' && (
                <Section title={`MY LEVELS${me.privacy.uploads ? '' : ' · PRIVATE'}`} icon="upload">
                  {!profile?.uploads?.length ? (
                    <Text style={styles.muted}>You haven’t uploaded a level yet. Use Upload in the Editor to share one.</Text>
                  ) : (
                    profile.uploads.map((u) => (
                      <UploadRow key={u.id} level={u} onDelete={() => (setDeleteError(null), setDeleteLevel(u))} />
                    ))
                  )}
                </Section>
              )}

              {tab === 'settings' && <Settings me={me} onChange={handleChange} />}
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal visible={!!deleteLevel} transparent animationType="fade" onRequestClose={() => setDeleteLevel(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.sectionHeader}>
              <PixelIcon name="trash" size={14} color={PIXEL.accent} />
              <Text style={styles.sectionTitle}>DELETE UPLOADED LEVEL?</Text>
            </View>
            <Text style={styles.body}>
              “{deleteLevel?.name}” will be removed from the server for everyone, with its plays, likes, comments and ratings.
              The copy on your device stays.
            </Text>
            {deleteError ? <Text style={styles.error}>{deleteError}</Text> : null}
            <View style={styles.modalRow}>
              <Button label="CANCEL" onPress={() => setDeleteLevel(null)} disabled={deletingLevel} />
              <Button
                kind="danger"
                label={deletingLevel ? 'DELETING…' : 'DELETE'}
                busy={deletingLevel}
                onPress={async () => {
                  if (!deleteLevel) return;
                  setDeletingLevel(true);
                  setDeleteError(null);
                  try {
                    await deleteUploadedLevel(deleteLevel.id);
                    setDeleteLevel(null);
                    await refresh();
                  } catch (err) {
                    setDeleteError(errorText(err));
                  } finally {
                    setDeletingLevel(false);
                  }
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScreenView>
  );
}

const styles = themedStyles(() => ({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: PIXEL.panelLight },
  backText: { color: PIXEL.text, fontFamily: FONTS.pixel, fontSize: 8 },
  topTitle: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  nameShrink: { flexShrink: 1 },
  badgeWrap: { marginTop: 8, marginBottom: 4 },
  root: { backgroundColor: 'transparent' },
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 40 },
  gap12: { gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  center: { alignItems: 'center', gap: 10, paddingTop: 60 },
  loader: { marginTop: 60 },

  authHero: { alignItems: 'center', gap: 10, paddingVertical: 20 },
  authTitle: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 14 },

  card: { backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: C.outline },
  banner: { height: 110, overflow: 'hidden' },
  cardBody: { paddingHorizontal: 14, paddingBottom: 14 },
  avatarWrap: { marginTop: -46, marginBottom: 8 },
  avatar: {
    borderWidth: 4,
    borderColor: PIXEL.panel,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarInitial: { color: C.textStrong, fontFamily: FONTS.pixel },
  displayName: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 14 },
  username: { color: PIXEL.accent2, fontFamily: FONTS.body, fontSize: 20, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  statBox: { flex: 1, backgroundColor: C.bgDeep, borderWidth: 2, borderColor: PIXEL.panelLight, paddingVertical: 8, alignItems: 'center', gap: 4 },
  statValue: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 12 },
  statLabel: { color: C.textSubtle, fontFamily: FONTS.pixel, fontSize: 6 },

  section: { backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: PIXEL.panelLight, padding: 12, gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 9 },
  label: { color: C.textSubtle, fontFamily: FONTS.pixel, fontSize: 7, marginTop: 6 },
  body: { color: PIXEL.text, fontFamily: FONTS.body, fontSize: 19 },
  muted: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 16 },
  mutedCenter: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 18, textAlign: 'center' },
  warn: { color: PIXEL.accent, fontFamily: FONTS.body, fontSize: 16 },
  error: { color: PIXEL.accent, fontFamily: FONTS.body, fontSize: 17 },
  success: { color: C.success, fontFamily: FONTS.body, fontSize: 17 },

  chip: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 2, borderColor: PIXEL.panelLight, backgroundColor: C.bgDeep },
  chipActive: { borderColor: PIXEL.accent, backgroundColor: alpha(C.accent, 0.12) },
  chipText: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 18 },
  chipTextActive: { color: PIXEL.accent },

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

  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: PIXEL.accent2,
    backgroundColor: alpha(C.blue, 0.1),
  },
  btnPrimary: { backgroundColor: PIXEL.accent, borderColor: C.outline, paddingVertical: 12 },
  btnDanger: { borderColor: C.danger, backgroundColor: alpha(C.danger, 0.1) },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: PIXEL.accent2, fontFamily: FONTS.pixel, fontSize: 8 },
  btnTextPrimary: { color: C.onAccent, fontSize: 10 },
  btnTextDanger: { color: C.dangerSoft },

  unsaved: { backgroundColor: alpha(C.gold, 0.12), borderWidth: 2, borderColor: C.gold, padding: 8 },
  unsavedText: { color: C.gold, fontFamily: FONTS.body, fontSize: 17 },
  previewBanner: { height: 80, overflow: 'hidden', justifyContent: 'flex-end', padding: 8, borderWidth: 2, borderColor: C.outline },
  previewAvatarWrap: { alignSelf: 'flex-start' },
  saveBar: { gap: 8, padding: 12, backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: PIXEL.accent },
  rowDelete: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: alpha(C.accent, 0.5) },
  modalBackdrop: { flex: 1, backgroundColor: alpha(C.black, 0.7), alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360, backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: C.outline, padding: 16, gap: 10 },
  modalRow: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  swatch: { width: 30, height: 30, borderWidth: 2, borderColor: C.outline },
  swatchActive: { borderColor: C.white, borderWidth: 3 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  switch: { width: 40, height: 22, borderWidth: 2, borderColor: PIXEL.panelLight, backgroundColor: C.bgDeep, padding: 2 },
  switchOn: { borderColor: PIXEL.accent2, backgroundColor: alpha(C.blue, 0.2) },
  switchKnob: { width: 14, height: 14, backgroundColor: PIXEL.textDim },
  switchKnobOn: { backgroundColor: PIXEL.accent2, transform: [{ translateX: 18 }] },
  switchLabel: { width: 54, color: PIXEL.textDim, fontFamily: FONTS.pixel, fontSize: 6 },
  switchLabelOn: { color: PIXEL.accent2 },

  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.lineSoft },
  thumb: {
    width: 46,
    height: 46,
    backgroundColor: C.bgDeep,
    borderWidth: 2,
    borderColor: PIXEL.panelLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rowTitle: { color: C.textStrong, fontFamily: FONTS.body, fontSize: 19 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  rowScore: { color: PIXEL.accent2, fontFamily: FONTS.pixel, fontSize: 9 },
  diffTag: { fontFamily: FONTS.pixel, fontSize: 6 },
  hcTag: { fontFamily: FONTS.pixel, fontSize: 6, color: C.onAccent, backgroundColor: C.danger, paddingHorizontal: 3, paddingVertical: 1 },
  visTag: { fontFamily: FONTS.pixel, fontSize: 6, color: PIXEL.textDim },
}));
