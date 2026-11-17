/**
 * Someone's public profile (opened from comments, friends, the leaderboard):
 * banner, picture, stats, what they're playing (friends only), history and
 * uploads when they're public, and an add-friend button.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PixelIcon, type PixelIconName } from './PixelIcon';
import { PressableScale } from './PressableScale';
import { useScreenInsets } from './useScreenInsets';
import { DIFFICULTY_COLOR } from './LevelCardParts';
import { FONTS, PIXEL } from '../../theme/pixel';
import { API_BASE, ApiUnavailableError } from '../../services/communityApi';
import { getSession } from '../../services/account';
import {
  DEFAULT_BANNER_COLOR,
  avatarUrl,
  bannerUrl,
  getProfile,
  levelCoverUrl,
  type ProfileLevel,
  type PublicProfile,
} from '../../services/profile';
import { acceptFriend, addFriend, presenceText, removeFriend } from '../../services/friends';

const errorText = (err: unknown) =>
  err instanceof ApiUnavailableError
    ? `Can’t reach the community server (${API_BASE}).`
    : err instanceof Error
      ? err.message
      : 'Something went wrong.';

function Thumb({ level }: { level: ProfileLevel }) {
  const uri = levelCoverUrl(level.id, level.cover);
  return (
    <View style={styles.thumb}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} /> : <PixelIcon name="note" size={14} color={PIXEL.textDim} />}
    </View>
  );
}

function LevelLine({ level, right, sub }: { level: ProfileLevel; right: string; sub?: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Thumb level={level} />
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {level.name}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          <Text style={{ color: DIFFICULTY_COLOR[level.difficulty] }}>
            {level.difficulty.toUpperCase()} {level.level}
          </Text>
          {'  '}
          {level.song.title}
        </Text>
        {sub}
      </View>
      <Text style={styles.rowRight}>{right}</Text>
    </View>
  );
}

export function ProfileSheet({ username, onClose }: { username: string | null; onClose: () => void }) {
  const insets = useScreenInsets();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [tab, setTab] = useState<'history' | 'uploads'>('history');

  const load = useCallback(async () => {
    if (!username) return;
    setError(null);
    try {
      setProfile(await getProfile(username));
    } catch (err) {
      setError(errorText(err));
    }
  }, [username]);

  useEffect(() => {
    setProfile(null);
    setTab('history');
    if (username) {
      void load();
      void getSession().then((s) => setSignedIn(Boolean(s)));
    }
  }, [username, load]);

  const friendAction = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const p = profile;
  const banner = p ? bannerUrl(p.id, p.banner) : null;
  const avatar = p ? avatarUrl(p.id, p.avatar) : null;
  const color = p?.bannerColor ?? DEFAULT_BANNER_COLOR;

  let friendBtn: { label: string; icon: PixelIconName; onPress: () => void; kind: 'primary' | 'plain' | 'danger' } | null = null;
  if (p && signedIn && !p.self && p.friend) {
    if (p.friend === 'none') friendBtn = { label: 'ADD FRIEND', icon: 'userPlus', kind: 'primary', onPress: () => friendAction(() => addFriend(p.username)) };
    if (p.friend === 'incoming') friendBtn = { label: 'ACCEPT REQUEST', icon: 'check', kind: 'primary', onPress: () => friendAction(() => acceptFriend(p.id)) };
    if (p.friend === 'outgoing') friendBtn = { label: 'CANCEL REQUEST', icon: 'close', kind: 'plain', onPress: () => friendAction(() => removeFriend(p.id)) };
    if (p.friend === 'friends') friendBtn = { label: 'REMOVE FRIEND', icon: 'close', kind: 'danger', onPress: () => friendAction(() => removeFriend(p.id)) };
  }

  return (
    <Modal visible={!!username} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>PLAYER</Text>
          <PressableScale scaleTo={0.88} style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
            <PixelIcon name="close" size={14} color="#cdd6ea" />
          </PressableScale>
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          {!p ? (
            error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={PIXEL.accent2} style={styles.loader} />
          ) : (
            <>
              <View style={styles.card}>
                <View style={[styles.banner, { backgroundColor: color }]}>
                  {banner ? <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                </View>
                <View style={styles.cardBody}>
                  <View style={[styles.avatar, { backgroundColor: color }]}>
                    {avatar ? (
                      <Image source={{ uri: avatar }} style={StyleSheet.absoluteFill} />
                    ) : (
                      <Text style={styles.avatarText}>{(p.displayName[0] ?? '?').toUpperCase()}</Text>
                    )}
                  </View>
                  <Text style={styles.name}>{p.displayName}</Text>
                  <Text style={styles.username}>@{p.username}</Text>
                  {p.presence ? (
                    <View style={styles.presenceRow}>
                      <View style={[styles.dot, p.presence.online && styles.dotOn, p.presence.activity === 'playing' && styles.dotPlaying]} />
                      <Text style={styles.muted}>{presenceText(p.presence)}</Text>
                    </View>
                  ) : null}
                  {p.stats ? (
                    <View style={styles.stats}>
                      <View style={styles.stat}>
                        <Text style={styles.statValue}>{p.stats.plays}</Text>
                        <Text style={styles.statLabel}>PLAYS</Text>
                      </View>
                      <View style={styles.stat}>
                        <Text style={styles.statValue}>{p.stats.uploads}</Text>
                        <Text style={styles.statLabel}>LEVELS</Text>
                      </View>
                    </View>
                  ) : null}
                  {friendBtn ? (
                    <PressableScale
                      scaleTo={0.96}
                      disabled={busy}
                      onPress={friendBtn.onPress}
                      style={[styles.friendBtn, friendBtn.kind === 'primary' && styles.friendPrimary, friendBtn.kind === 'danger' && styles.friendDanger]}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color={friendBtn.kind === 'primary' ? '#000000' : PIXEL.accent2} />
                      ) : (
                        <PixelIcon name={friendBtn.icon} size={14} color={friendBtn.kind === 'primary' ? '#000000' : friendBtn.kind === 'danger' ? '#ff7a73' : PIXEL.accent2} />
                      )}
                      <Text style={[styles.friendText, friendBtn.kind === 'primary' && styles.friendTextPrimary, friendBtn.kind === 'danger' && styles.friendTextDanger]}>
                        {friendBtn.label}
                      </Text>
                    </PressableScale>
                  ) : null}
                </View>
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              {p.private ? (
                <View style={styles.section}>
                  <PixelIcon name="lock" size={14} color={PIXEL.textDim} />
                  <Text style={styles.muted}>This profile is private.</Text>
                </View>
              ) : (
                <>
                  <View style={styles.tabs}>
                    {(['history', 'uploads'] as const).map((t) => (
                      <PressableScale key={t} scaleTo={0.94} onPress={() => setTab(t)} style={[styles.chip, tab === t && styles.chipActive]}>
                        <Text style={[styles.chipText, tab === t && styles.chipTextActive]}>{t === 'history' ? 'History' : 'Levels'}</Text>
                      </PressableScale>
                    ))}
                  </View>
                  <View style={styles.section}>
                    {tab === 'history' ? (
                      p.history === null ? (
                        <Text style={styles.muted}>Play history is private.</Text>
                      ) : p.history.length === 0 ? (
                        <Text style={styles.muted}>No plays yet.</Text>
                      ) : (
                        p.history.map((h, i) => (
                          <LevelLine
                            key={`${h.level.id}-${h.playedAt}-${i}`}
                            level={h.level}
                            right={h.score.toLocaleString()}
                            sub={h.hardcore ? <Text style={styles.hc}>HARDCORE</Text> : null}
                          />
                        ))
                      )
                    ) : p.uploads === null ? (
                      <Text style={styles.muted}>Uploaded levels are private.</Text>
                    ) : p.uploads.length === 0 ? (
                      <Text style={styles.muted}>No levels uploaded yet.</Text>
                    ) : (
                      p.uploads.map((u) => <LevelLine key={u.id} level={u} right={`${u.plays} plays`} />)
                    )}
                  </View>
                </>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PIXEL.bg },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  headerTitle: { color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 11 },
  closeBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: PIXEL.panelLight, borderWidth: 2, borderColor: '#000000' },
  scroll: { paddingHorizontal: 16, paddingBottom: 30, gap: 12 },
  loader: { marginTop: 40 },
  error: { color: PIXEL.accent, fontFamily: FONTS.body, fontSize: 17 },
  muted: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 16 },

  card: { backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: '#000000' },
  banner: { height: 100, overflow: 'hidden' },
  cardBody: { paddingHorizontal: 14, paddingBottom: 14 },
  avatar: { width: 76, height: 76, marginTop: -40, marginBottom: 8, borderWidth: 4, borderColor: PIXEL.panel, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 26 },
  name: { color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 13 },
  username: { color: PIXEL.accent2, fontFamily: FONTS.body, fontSize: 19, marginTop: 4 },
  presenceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  dot: { width: 8, height: 8, backgroundColor: '#3a4a70' },
  dotOn: { backgroundColor: '#22c46e' },
  dotPlaying: { backgroundColor: PIXEL.accent },
  stats: { flexDirection: 'row', gap: 8, marginTop: 10 },
  stat: { flex: 1, backgroundColor: '#070b14', borderWidth: 2, borderColor: PIXEL.panelLight, paddingVertical: 8, alignItems: 'center', gap: 4 },
  statValue: { color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 12 },
  statLabel: { color: '#6b7a99', fontFamily: FONTS.pixel, fontSize: 6 },
  friendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 10, borderWidth: 2, borderColor: PIXEL.accent2 },
  friendPrimary: { backgroundColor: PIXEL.accent, borderColor: '#000000' },
  friendDanger: { borderColor: '#d8342f', backgroundColor: 'rgba(216, 52, 47, 0.08)' },
  friendText: { color: PIXEL.accent2, fontFamily: FONTS.pixel, fontSize: 8 },
  friendTextPrimary: { color: '#000000' },
  friendTextDanger: { color: '#ff7a73' },

  tabs: { flexDirection: 'row', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 2, borderColor: PIXEL.panelLight, backgroundColor: '#070b14' },
  chipActive: { borderColor: PIXEL.accent, backgroundColor: 'rgba(255, 107, 74, 0.12)' },
  chipText: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 18 },
  chipTextActive: { color: PIXEL.accent },
  section: { backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: PIXEL.panelLight, padding: 12, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  thumb: { width: 42, height: 42, backgroundColor: '#070b14', borderWidth: 2, borderColor: PIXEL.panelLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rowTitle: { color: '#ffffff', fontFamily: FONTS.body, fontSize: 18 },
  rowRight: { color: PIXEL.accent2, fontFamily: FONTS.pixel, fontSize: 8 },
  hc: { color: '#ff7a73', fontFamily: FONTS.pixel, fontSize: 6, marginTop: 2 },
});
