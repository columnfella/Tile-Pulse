/**
 * Someone's public profile (opened from comments, friends, the leaderboard):
 * banner, picture, stats, what they're playing (friends only), history and
 * uploads when they're public, and an add-friend button. Badges are listed
 * under the name. Moderators see warnings and can warn / ban / unban.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PixelIcon, type PixelIconName } from './PixelIcon';
import { PressableScale } from './PressableScale';
import { useScreenInsets } from './useScreenInsets';
import { DIFFICULTY_COLOR } from './LevelCardParts';
import { BadgeIcon, BadgeList } from './Badges';
import { ReasonModal } from './ReasonModal';
import { FONTS, PIXEL } from '../../theme/pixel';
import { API_BASE, ApiUnavailableError } from '../../services/communityApi';
import { getSession, isStaff } from '../../services/account';
import { banUser, getModUser, unbanUser, warnUser, type ModUserSummary } from '../../services/moderation';
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

import { C, alpha, themedStyles } from '../../theme/palette';
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
  const [staff, setStaff] = useState(false);
  const [mod, setMod] = useState<ModUserSummary | null>(null);
  const [asking, setAsking] = useState<'warn' | 'ban' | null>(null);

  const loadMod = useCallback(async () => {
    if (!username) return;
    try {
      setMod(await getModUser(username));
    } catch {
      setMod(null);
    }
  }, [username]);

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
    setMod(null);
    setTab('history');
    if (username) {
      void load();
      void getSession().then((s) => {
        setSignedIn(Boolean(s));
        const isMod = isStaff(s?.user);
        setStaff(isMod);
        if (isMod && s?.user.username.toLowerCase() !== username.toLowerCase()) void loadMod();
      });
    }
  }, [username, load, loadMod]);

  const unban = async () => {
    if (!mod) return;
    setBusy(true);
    setError(null);
    try {
      await unbanUser(mod.username);
      await loadMod();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

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
            <PixelIcon name="close" size={14} color={C.textSoft} />
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
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{p.displayName}</Text>
                    <BadgeIcon id={p.badges?.[0]?.id} size={14} />
                  </View>
                  <Text style={styles.username}>@{p.username}</Text>
                  {p.badges?.length ? (
                    <View style={styles.badges}>
                      <BadgeList badges={p.badges} />
                    </View>
                  ) : null}
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
                        <ActivityIndicator size="small" color={friendBtn.kind === 'primary' ? C.onAccent : PIXEL.accent2} />
                      ) : (
                        <PixelIcon name={friendBtn.icon} size={14} color={friendBtn.kind === 'primary' ? C.onAccent : friendBtn.kind === 'danger' ? C.dangerSoft : PIXEL.accent2} />
                      )}
                      <Text style={[styles.friendText, friendBtn.kind === 'primary' && styles.friendTextPrimary, friendBtn.kind === 'danger' && styles.friendTextDanger]}>
                        {friendBtn.label}
                      </Text>
                    </PressableScale>
                  ) : null}
                </View>
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              {staff && mod ? (
                <View style={[styles.section, styles.modSection]}>
                  <View style={styles.modHead}>
                    <PixelIcon name="shield" size={12} color={C.successBright} />
                    <Text style={styles.modTitle}>MODERATOR</Text>
                  </View>
                  {mod.bannedAt ? (
                    <Text style={styles.banned}>BANNED{mod.banReason ? ` — ${mod.banReason}` : ''}</Text>
                  ) : null}
                  <Text style={styles.muted}>
                    {mod.warningCount} warning{mod.warningCount === 1 ? '' : 's'} · {mod.levels} level{mod.levels === 1 ? '' : 's'}
                  </Text>
                  {mod.warnings.slice(0, 3).map((w, i) => (
                    <Text key={i} style={styles.warnLine} numberOfLines={2}>
                      • {w.reason} <Text style={styles.warnMeta}>({new Date(w.at).toLocaleDateString()}{w.by ? `, @${w.by}` : ''})</Text>
                    </Text>
                  ))}
                  {mod.protected ? (
                    <Text style={styles.muted}>Staff account: can’t be warned or banned.</Text>
                  ) : (
                    <View style={styles.modRow}>
                      <PressableScale scaleTo={0.95} onPress={() => setAsking('warn')} style={[styles.modBtn, styles.modWarn]}>
                        <PixelIcon name="warning" size={11} color={C.onAccent} />
                        <Text style={styles.modBtnText}>WARN</Text>
                      </PressableScale>
                      {mod.bannedAt ? (
                        <PressableScale scaleTo={0.95} disabled={busy} onPress={unban} style={[styles.modBtn, styles.modUnban]}>
                          <PixelIcon name="check" size={11} color={C.onAccent} />
                          <Text style={styles.modBtnText}>UNBAN</Text>
                        </PressableScale>
                      ) : (
                        <PressableScale scaleTo={0.95} onPress={() => setAsking('ban')} style={[styles.modBtn, styles.modBan]}>
                          <PixelIcon name="close" size={11} color={C.textStrong} />
                          <Text style={[styles.modBtnText, styles.modBtnTextLight]}>BAN</Text>
                        </PressableScale>
                      )}
                    </View>
                  )}
                </View>
              ) : null}

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
        <ReasonModal
          visible={asking !== null}
          title={asking === 'ban' ? `BAN @${username ?? ''}` : `WARN @${username ?? ''}`}
          message={
            asking === 'ban'
              ? 'Their account is suspended and signed out, and their devices are banned. You can unban later.'
              : 'They get a warning with this reason in their inbox.'
          }
          confirmLabel={asking === 'ban' ? 'BAN' : 'SEND WARNING'}
          destructive={asking === 'ban'}
          presets={asking === 'ban' ? ['Repeated spam', 'Harassment', 'Cheating', 'Stolen levels'] : ['Be respectful in comments', 'No spam', 'Don’t upload stolen charts', 'Keep it appropriate']}
          onClose={() => setAsking(null)}
          onConfirm={async (reason) => {
            if (!username) return;
            if (asking === 'ban') await banUser(username, reason);
            else await warnUser(username, reason);
            await loadMod();
          }}
        />
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  root: { flex: 1, backgroundColor: PIXEL.bg },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  headerTitle: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 11 },
  closeBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: PIXEL.panelLight, borderWidth: 2, borderColor: C.outline },
  scroll: { paddingHorizontal: 16, paddingBottom: 30, gap: 12 },
  loader: { marginTop: 40 },
  error: { color: PIXEL.accent, fontFamily: FONTS.body, fontSize: 17 },
  muted: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 16 },

  card: { backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: C.outline },
  banner: { height: 100, overflow: 'hidden' },
  cardBody: { paddingHorizontal: 14, paddingBottom: 14 },
  avatar: { width: 76, height: 76, marginTop: -40, marginBottom: 8, borderWidth: 4, borderColor: PIXEL.panel, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 26 },
  name: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 13, flexShrink: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  badges: { marginTop: 8 },
  modSection: { borderColor: C.successDeep, backgroundColor: alpha(C.successBright, 0.05) },
  modHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modTitle: { color: C.successBright, fontFamily: FONTS.pixel, fontSize: 8 },
  banned: { color: C.dangerSoft, fontFamily: FONTS.pixel, fontSize: 7 },
  warnLine: { color: PIXEL.text, fontFamily: FONTS.body, fontSize: 16 },
  warnMeta: { color: C.textSubtle },
  modRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  modBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 2, borderColor: C.outline },
  modWarn: { backgroundColor: C.warning },
  modBan: { backgroundColor: C.danger },
  modUnban: { backgroundColor: C.successBright },
  modBtnText: { color: C.onAccent, fontFamily: FONTS.pixel, fontSize: 7 },
  modBtnTextLight: { color: C.textStrong },
  username: { color: PIXEL.accent2, fontFamily: FONTS.body, fontSize: 19, marginTop: 4 },
  presenceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  dot: { width: 8, height: 8, backgroundColor: C.textFaint },
  dotOn: { backgroundColor: C.success },
  dotPlaying: { backgroundColor: PIXEL.accent },
  stats: { flexDirection: 'row', gap: 8, marginTop: 10 },
  stat: { flex: 1, backgroundColor: C.bgDeep, borderWidth: 2, borderColor: PIXEL.panelLight, paddingVertical: 8, alignItems: 'center', gap: 4 },
  statValue: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 12 },
  statLabel: { color: C.textSubtle, fontFamily: FONTS.pixel, fontSize: 6 },
  friendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 10, borderWidth: 2, borderColor: PIXEL.accent2 },
  friendPrimary: { backgroundColor: PIXEL.accent, borderColor: C.outline },
  friendDanger: { borderColor: C.danger, backgroundColor: alpha(C.danger, 0.08) },
  friendText: { color: PIXEL.accent2, fontFamily: FONTS.pixel, fontSize: 8 },
  friendTextPrimary: { color: C.onAccent },
  friendTextDanger: { color: C.dangerSoft },

  tabs: { flexDirection: 'row', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 2, borderColor: PIXEL.panelLight, backgroundColor: C.bgDeep },
  chipActive: { borderColor: PIXEL.accent, backgroundColor: alpha(C.accent, 0.12) },
  chipText: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 18 },
  chipTextActive: { color: PIXEL.accent },
  section: { backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: PIXEL.panelLight, padding: 12, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  thumb: { width: 42, height: 42, backgroundColor: C.bgDeep, borderWidth: 2, borderColor: PIXEL.panelLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  rowTitle: { color: C.textStrong, fontFamily: FONTS.body, fontSize: 18 },
  rowRight: { color: PIXEL.accent2, fontFamily: FONTS.pixel, fontSize: 8 },
  hc: { color: C.dangerSoft, fontFamily: FONTS.pixel, fontSize: 6, marginTop: 2 },
}));
