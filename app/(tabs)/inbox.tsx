/**
 * Inbox tab: friend requests (accept / decline right here), warnings from
 * moderators with the reason, levels verified or removed, comments removed,
 * new badges. Opening the tab marks everything as read.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenView } from '../../src/components/ui/ScreenView';
import { PixelIcon, type PixelIconName } from '../../src/components/ui/PixelIcon';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { ProfileSheet } from '../../src/components/ui/ProfileSheet';
import { FONTS, PIXEL } from '../../src/theme/pixel';
import { API_BASE, ApiUnavailableError } from '../../src/services/communityApi';
import { ApiError, getSession, onSessionChange, type Session } from '../../src/services/account';
import { acceptFriend, removeFriend } from '../../src/services/friends';
import {
  deleteNotification,
  getNotifications,
  markAllRead,
  type AppNotification,
  type NotificationKind,
} from '../../src/services/notifications';

const errorText = (err: unknown) =>
  err instanceof ApiUnavailableError
    ? `Can’t reach the community server (${API_BASE}).`
    : err instanceof Error
      ? err.message
      : 'Something went wrong.';

const LOOK: Record<NotificationKind, { icon: PixelIconName; color: string }> = {
  friend_request: { icon: 'userPlus', color: PIXEL.accent2 },
  friend_accepted: { icon: 'friends', color: '#22c46e' },
  warning: { icon: 'warning', color: '#ffb84d' },
  level_verified: { icon: 'check', color: '#4d8dff' },
  level_unverified: { icon: 'close', color: PIXEL.textDim },
  level_removed: { icon: 'trash', color: '#ff7a73' },
  comment_removed: { icon: 'comment', color: '#ff7a73' },
  badge_granted: { icon: 'crown', color: '#ffd23f' },
  unbanned: { icon: 'check', color: '#22c46e' },
};

function timeAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ms).toLocaleDateString();
}

export default function InboxScreen() {
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
      if (accept) await acceptFriend(userId);
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
    <ScreenView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={session ? <RefreshControl refreshing={loading} onRefresh={load} tintColor={PIXEL.accent2} /> : undefined}
      >
        <View style={styles.header}>
          <PixelIcon name="bell" size={21} color={PIXEL.accent} />
          <Text style={styles.title}>INBOX</Text>
        </View>

        {session === undefined ? (
          <ActivityIndicator color={PIXEL.accent2} style={styles.loader} />
        ) : !session ? (
          <View style={styles.center}>
            <Text style={styles.mutedCenter}>Sign in to get friend requests and messages from the TilePulse team.</Text>
            <PressableScale scaleTo={0.95} style={styles.primaryBtn} onPress={() => router.push('/(tabs)/profile')}>
              <PixelIcon name="person" size={14} color="#000000" />
              <Text style={styles.primaryText}>SIGN IN</Text>
            </PressableScale>
          </View>
        ) : (
          <Animated.View entering={FadeIn.duration(200)} style={styles.list}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {items.length === 0 && !loading ? (
              <View style={styles.empty}>
                <PixelIcon name="bell" size={28} color="#2a3654" />
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
                      <Text style={[styles.itemTitle, isWarning && { color: '#ffb84d' }]} numberOfLines={2}>
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
                              <PixelIcon name="check" size={12} color="#000000" />
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
                      <PixelIcon name="close" size={10} color="#3a4a70" />
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
    </ScreenView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: PIXEL.bg },
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 30, gap: 14 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 16 },
  loader: { marginTop: 40 },
  center: { alignItems: 'center', gap: 14, marginTop: 40 },
  mutedCenter: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 18, textAlign: 'center' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: PIXEL.accent, borderWidth: 2, borderColor: '#000000' },
  primaryText: { color: '#000000', fontFamily: FONTS.pixel, fontSize: 9 },
  error: { color: PIXEL.accent, fontFamily: FONTS.body, fontSize: 17 },
  list: { gap: 8 },
  empty: { alignItems: 'center', gap: 10, marginTop: 40 },
  item: { flexDirection: 'row', gap: 10, backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: PIXEL.panelLight, padding: 10 },
  itemNew: { borderColor: '#2f4a8a' },
  itemWarning: { borderColor: '#7a5a1e', backgroundColor: 'rgba(255,184,77,0.06)' },
  iconBox: { width: 32, height: 32, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#070b14' },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemTitle: { color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 8, lineHeight: 13, flexShrink: 1 },
  newDot: { width: 7, height: 7, backgroundColor: PIXEL.accent },
  itemBody: { color: PIXEL.text, fontFamily: FONTS.body, fontSize: 18, marginTop: 4 },
  reasonLabel: { color: '#ffb84d' },
  time: { color: '#6b7a99', fontFamily: FONTS.body, fontSize: 15, marginTop: 3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  acceptBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#22c46e', borderWidth: 2, borderColor: '#000000' },
  acceptText: { color: '#000000', fontFamily: FONTS.pixel, fontSize: 7 },
  declineBtn: { paddingHorizontal: 10, paddingVertical: 7, borderWidth: 2, borderColor: '#d8342f' },
  declineText: { color: '#ff7a73', fontFamily: FONTS.pixel, fontSize: 7 },
  linkBtn: { paddingHorizontal: 10, paddingVertical: 7, borderWidth: 2, borderColor: PIXEL.panelLight },
  linkText: { color: PIXEL.accent2, fontFamily: FONTS.pixel, fontSize: 7 },
  dismiss: { padding: 4, alignSelf: 'flex-start' },
  moreBtn: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8, borderWidth: 2, borderColor: PIXEL.panelLight },
});
