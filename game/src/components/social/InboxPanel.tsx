/**
 * Social tab → Inbox: friend requests (accept / decline right here), warnings
 * from moderators with the reason, levels verified or removed, comments
 * removed, new badges. Opening it marks everything as read.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import { PixelIcon, type PixelIconName } from '../../components/ui/PixelIcon';
import { PressableScale } from '../../components/ui/PressableScale';
import { ProfileSheet } from '../../components/ui/ProfileSheet';
import { FONTS, PIXEL } from '../../theme/pixel';
import { API_BASE, ApiUnavailableError } from '../../services/communityApi';
import { ApiError, getSession, onSessionChange, type Session } from '../../services/account';
import { acceptFriend, removeFriend } from '../../services/friends';
import { markAnnouncementsSeen, refreshAnnouncements, useAnnouncements, type Announcement } from '../../services/announcements';
import {
  deleteNotification,
  getNotifications,
  markAllRead,
  type AppNotification,
  type NotificationKind,
} from '../../services/notifications';

import { C, alpha, themedStyles, themed } from '../../theme/palette';
import { playerErrorMessage } from '../../services/playerError';
// Player-friendly: never shows the server address or technical details
const errorText = (err: unknown) => playerErrorMessage(err);

const LOOK: Record<NotificationKind, { icon: PixelIconName; color: string }> = themed(() => ({
  friend_request: { icon: 'userPlus', color: PIXEL.accent2 },
  friend_accepted: { icon: 'friends', color: C.success },
  warning: { icon: 'warning', color: C.warning },
  level_verified: { icon: 'check', color: C.blue },
  level_unverified: { icon: 'close', color: PIXEL.textDim },
  level_removed: { icon: 'trash', color: C.dangerSoft },
  comment_removed: { icon: 'comment', color: C.dangerSoft },
  badge_granted: { icon: 'crown', color: C.yellow },
  unbanned: { icon: 'check', color: C.success },
}));

function timeAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ms).toLocaleDateString();
}

/** A message from the TilePulse team (admin console): shown to everyone, signed in or not. */
function AnnouncementItem({ a, isNew }: { a: Announcement; isNew: boolean }) {
  return (
    <View style={[styles.item, styles.itemAnnouncement]}>
      <View style={[styles.iconBox, styles.iconAnnouncement]}>
        <PixelIcon name="bell" size={14} color={C.onAccent} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.kicker}>FROM THE TILEPULSE TEAM</Text>
        <View style={styles.itemHead}>
          <Text style={styles.itemTitle} numberOfLines={3}>
            {a.title}
          </Text>
          {isNew ? <View style={styles.newDot} /> : null}
        </View>
        <Text style={styles.itemBody}>{a.body}</Text>
        <Text style={styles.time}>{timeAgo(a.createdAt)}</Text>
        {a.link ? (
          <View style={styles.actions}>
            <PressableScale scaleTo={0.94} style={styles.announceBtn} onPress={() => Linking.openURL(a.link!.url).catch(() => {})} accessibilityRole="link">
              <Text style={styles.acceptText}>{a.link.label.toUpperCase()}</Text>
            </PressableScale>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function InboxPanel() {
  const announcements = useAnnouncements();
  // Which announcements were new when the inbox opened (they keep the "new" dot until you leave)
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void refreshAnnouncements().then((list) => {
        if (cancelled) return;
        setNewIds(new Set(list.filter((x) => announcements.isNew(x.id)).map((x) => x.id)));
        void markAnnouncementsSeen(list.map((x) => x.id)); // seen now: the badge clears
      });
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  useEffect(() => {
    void getSession().then(setSession);
    return onSessionChange((s) => {
      setSession(s);
      if (!s) setItems([]);
    });
  }, []);

  const load = useCallback(async () => {
    if (!(await getSession())) return;
    setLoading(true);
    setError(null);
    try {
      const r = await getNotifications();
      setItems(r.notifications);
      setNextBefore(r.nextBefore);
      // Seen now: the tab badge clears (items keep their "new" look until you leave)
      if (r.unread > 0) void markAllRead().catch(() => {});
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const token = session?.token;
  useFocusEffect(
    useCallback(() => {
      if (token) void load();
    }, [token, load])
  );

  const more = async () => {
    if (!nextBefore) return;
    try {
      const r = await getNotifications(nextBefore);
      setItems((prev) => [...prev, ...r.notifications]);
      setNextBefore(r.nextBefore);
    } catch (err) {
      setError(errorText(err));
    }
  };

  const drop = async (n: AppNotification) => {
    setItems((prev) => prev.filter((x) => x.id !== n.id));
    try {
      await deleteNotification(n.id);
    } catch {
      /* already gone */
    }
  };

  // Accept / decline a friend request; the server removes the request notice itself
  const answer = async (n: AppNotification, accept: boolean) => {
    const userId = n.data?.userId;
    if (!userId) return;
    setBusyId(n.id);
    setError(null);
    try {
      if (accept) await acceptFriend(userId); // (updates the FRIENDS badge from the reply)
      else await removeFriend(userId);
      setItems((prev) => prev.filter((x) => x.id !== n.id));
    } catch (err) {
      // The request was cancelled meanwhile: just clear the notice
      if (err instanceof ApiError && err.status === 404) setItems((prev) => prev.filter((x) => x.id !== n.id));
      else setError(errorText(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={session ? <RefreshControl refreshing={loading} onRefresh={load} tintColor={PIXEL.accent2} /> : undefined}
      >
        {announcements.list.length > 0 ? (
          <View style={styles.list}>
            {announcements.list.map((a) => (
              <AnnouncementItem key={`a${a.id}`} a={a} isNew={newIds.has(a.id)} />
            ))}
          </View>
        ) : null}

        {session === undefined ? (
          <ActivityIndicator color={PIXEL.accent2} style={styles.loader} />
        ) : !session ? (
          <View style={styles.center}>
            <Text style={styles.mutedCenter}>Sign in to get friend requests and other messages.</Text>
            <PressableScale scaleTo={0.95} style={styles.primaryBtn} onPress={() => router.push('/(tabs)/profile')}>
              <PixelIcon name="person" size={14} color={C.onAccent} />
              <Text style={styles.primaryText}>SIGN IN</Text>
            </PressableScale>
          </View>
        ) : (
          <Animated.View entering={FadeIn.duration(200)} style={styles.list}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {items.length === 0 && !loading ? (
              <View style={styles.empty}>
                <PixelIcon name="bell" size={28} color={C.lineStrong} />
                <Text style={styles.mutedCenter}>Nothing here yet. Friend requests and news show up here.</Text>
              </View>
            ) : null}

            {items.map((n) => {
              const look = LOOK[n.kind] ?? { icon: 'bell' as PixelIconName, color: PIXEL.textDim };
              const isWarning = n.kind === 'warning';
              return (
                <View key={n.id} style={[styles.item, !n.read && styles.itemNew, isWarning && styles.itemWarning]}>
                  <View style={[styles.iconBox, { borderColor: look.color }]}>
                    <PixelIcon name={look.icon} size={14} color={look.color} />
                  </View>
                  <View style={styles.flex}>
                    <View style={styles.itemHead}>
                      <Text style={[styles.itemTitle, isWarning && { color: C.warning }]} numberOfLines={2}>
                        {n.title}
                      </Text>
                      {!n.read ? <View style={styles.newDot} /> : null}
                    </View>
                    {n.body ? (
                      isWarning ? (
                        <Text style={styles.itemBody}>
                          <Text style={styles.reasonLabel}>Reason: </Text>
                          {n.body}
                        </Text>
                      ) : (
                        <Text style={styles.itemBody}>{n.body}</Text>
                      )
                    ) : null}
                    <Text style={styles.time}>{timeAgo(n.createdAt)}</Text>

                    {n.kind === 'friend_request' && n.data?.userId ? (
                      <View style={styles.actions}>
                        {busyId === n.id ? (
                          <ActivityIndicator color={PIXEL.accent2} />
                        ) : (
                          <>
                            <PressableScale scaleTo={0.94} style={styles.acceptBtn} onPress={() => answer(n, true)}>
                              <PixelIcon name="check" size={12} color={C.onAccent} />
                              <Text style={styles.acceptText}>ACCEPT</Text>
                            </PressableScale>
                            <PressableScale scaleTo={0.94} style={styles.declineBtn} onPress={() => answer(n, false)}>
                              <Text style={styles.declineText}>DECLINE</Text>
                            </PressableScale>
                            {n.data.username ? (
                              <PressableScale scaleTo={0.94} style={styles.linkBtn} onPress={() => setViewing(n.data!.username!)}>
                                <Text style={styles.linkText}>PROFILE</Text>
                              </PressableScale>
                            ) : null}
                          </>
                        )}
                      </View>
                    ) : null}
                    {n.kind === 'friend_accepted' && n.data?.username ? (
                      <View style={styles.actions}>
                        <PressableScale scaleTo={0.94} style={styles.linkBtn} onPress={() => setViewing(n.data!.username!)}>
                          <Text style={styles.linkText}>VIEW PROFILE</Text>
                        </PressableScale>
                      </View>
                    ) : null}
                  </View>
                  {n.kind !== 'friend_request' ? (
                    <PressableScale scaleTo={0.85} onPress={() => drop(n)} style={styles.dismiss} accessibilityLabel="Dismiss">
                      <PixelIcon name="close" size={10} color={C.textFaint} />
                    </PressableScale>
                  ) : null}
                </View>
              );
            })}

            {nextBefore ? (
              <PressableScale scaleTo={0.96} onPress={more} style={styles.moreBtn}>
                <Text style={styles.linkText}>LOAD MORE</Text>
              </PressableScale>
            ) : null}
          </Animated.View>
        )}
      </ScrollView>
      <ProfileSheet username={viewing} onClose={() => setViewing(null)} />
    </View>
  );
}

const styles = themedStyles(() => ({
  root: { flex: 1, backgroundColor: 'transparent' },
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 30, gap: 14 },
  flex: { flex: 1 },
  loader: { marginTop: 40 },
  center: { alignItems: 'center', gap: 14, marginTop: 40 },
  mutedCenter: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 18, textAlign: 'center' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: PIXEL.accent, borderWidth: 2, borderColor: C.outline },
  primaryText: { color: C.onAccent, fontFamily: FONTS.pixel, fontSize: 9 },
  error: { color: PIXEL.accent, fontFamily: FONTS.body, fontSize: 17 },
  list: { gap: 8 },
  empty: { alignItems: 'center', gap: 10, marginTop: 40 },
  item: { flexDirection: 'row', gap: 10, backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: PIXEL.panelLight, padding: 10 },
  itemAnnouncement: { borderColor: C.accent, backgroundColor: alpha(C.accent, 0.08) },
  iconAnnouncement: { backgroundColor: C.accent, borderColor: C.accent },
  kicker: { color: C.blue, fontFamily: FONTS.pixel, fontSize: 6, marginBottom: 4 },
  announceBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: C.accent, borderWidth: 2, borderColor: C.outline },
  itemNew: { borderColor: C.tint2 },
  itemWarning: { borderColor: alpha(C.warning, 0.5), backgroundColor: alpha(C.warning, 0.06) },
  iconBox: { width: 32, height: 32, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgDeep },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemTitle: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 8, lineHeight: 13, flexShrink: 1 },
  newDot: { width: 7, height: 7, backgroundColor: PIXEL.accent },
  itemBody: { color: PIXEL.text, fontFamily: FONTS.body, fontSize: 18, marginTop: 4 },
  reasonLabel: { color: C.warning },
  time: { color: C.textSubtle, fontFamily: FONTS.body, fontSize: 15, marginTop: 3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  acceptBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: C.success, borderWidth: 2, borderColor: C.outline },
  acceptText: { color: C.onAccent, fontFamily: FONTS.pixel, fontSize: 7 },
  declineBtn: { paddingHorizontal: 10, paddingVertical: 7, borderWidth: 2, borderColor: C.danger },
  declineText: { color: C.dangerSoft, fontFamily: FONTS.pixel, fontSize: 7 },
  linkBtn: { paddingHorizontal: 10, paddingVertical: 7, borderWidth: 2, borderColor: PIXEL.panelLight },
  linkText: { color: PIXEL.accent2, fontFamily: FONTS.pixel, fontSize: 7 },
  dismiss: { padding: 4, alignSelf: 'flex-start' },
  moreBtn: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8, borderWidth: 2, borderColor: PIXEL.panelLight },
}));
