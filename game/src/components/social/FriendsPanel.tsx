/**
 * Social tab → Friends: add friends by @username, answer friend requests, and
 * see which friends are online and what they're playing (refreshes every 20 s).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import { PixelIcon } from '../../components/ui/PixelIcon';
import { PressableScale } from '../../components/ui/PressableScale';
import { ProfileSheet } from '../../components/ui/ProfileSheet';
import { FONTS, PIXEL } from '../../theme/pixel';
import { API_BASE, ApiUnavailableError } from '../../services/communityApi';
import { getSession, onSessionChange, type Session } from '../../services/account';
import { avatarUrl, type ImageRef } from '../../services/profile';
import {
  acceptFriend,
  addFriend,
  getFriends,
  presenceText,
  removeFriend,
  type Friend,
  type FriendLists,
  type FriendRequest,
} from '../../services/friends';

import { C, themedStyles } from '../../theme/palette';
import { playerErrorMessage } from '../../services/playerError';
const POLL_MS = 20_000;

// Player-friendly: never shows the server address or technical details
const errorText = (err: unknown) => playerErrorMessage(err);

function Avatar({ id, avatar, name, size = 40 }: { id: string; avatar: ImageRef | null; name: string; size?: number }) {
  const uri = avatarUrl(id, avatar);
  return (
    <View style={[styles.avatar, { width: size, height: size }]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} />
      ) : (
        <Text style={[styles.avatarText, { fontSize: size * 0.34 }]}>{(name[0] ?? '?').toUpperCase()}</Text>
      )}
    </View>
  );
}

export function FriendsPanel() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [lists, setLists] = useState<FriendLists | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void getSession().then(setSession);
    return onSessionChange((s) => {
      setSession(s);
      if (!s) setLists(null);
    });
  }, []);

  const refresh = useCallback(async (quiet = false) => {
    if (!(await getSession())) return;
    if (!quiet) setLoading(true);
    try {
      setLists(await getFriends());
      setError(null);
    } catch (err) {
      if (!quiet) setError(errorText(err));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  // Load on focus, then keep presence fresh while the tab is open
  const token = session?.token;
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      void refresh();
      pollRef.current = setInterval(() => void refresh(true), POLL_MS);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      };
    }, [token, refresh])
  );

  const handleAdd = async () => {
    const name = username.trim().replace(/^@/, '');
    if (!name) return;
    setAdding(true);
    setMessage(null);
    try {
      const r = await addFriend(name);
      setLists(r);
      setUsername('');
      setMessage({ text: r.status === 'friends' ? `You and @${name} are now friends!` : `Friend request sent to @${name}.` });
    } catch (err) {
      setMessage({ text: errorText(err), error: true });
    } finally {
      setAdding(false);
    }
  };

  const act = async (id: string, fn: () => Promise<FriendLists>) => {
    setBusyId(id);
    try {
      setLists(await fn());
    } catch (err) {
      setMessage({ text: errorText(err), error: true });
    } finally {
      setBusyId(null);
    }
  };

  const RequestRow = ({ r, incoming }: { r: FriendRequest; incoming: boolean }) => (
    <View style={styles.row}>
      <PressableScale scaleTo={0.95} style={styles.rowMain} onPress={() => setViewing(r.username)}>
        <Avatar id={r.id} avatar={r.avatar} name={r.displayName} size={34} />
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1}>
            {r.displayName}
          </Text>
          <Text style={styles.muted}>@{r.username}</Text>
        </View>
      </PressableScale>
      {busyId === r.id ? (
        <ActivityIndicator color={PIXEL.accent2} />
      ) : incoming ? (
        <View style={styles.reqBtns}>
          <PressableScale scaleTo={0.9} style={styles.acceptBtn} onPress={() => act(r.id, () => acceptFriend(r.id))} accessibilityLabel="Accept">
            <PixelIcon name="check" size={14} color={C.onAccent} />
          </PressableScale>
          <PressableScale scaleTo={0.9} style={styles.declineBtn} onPress={() => act(r.id, () => removeFriend(r.id))} accessibilityLabel="Decline">
            <PixelIcon name="close" size={14} color={C.dangerSoft} />
          </PressableScale>
        </View>
      ) : (
        <PressableScale scaleTo={0.9} style={styles.cancelBtn} onPress={() => act(r.id, () => removeFriend(r.id))}>
          <Text style={styles.cancelText}>CANCEL</Text>
        </PressableScale>
      )}
    </View>
  );

  const FriendRow = ({ f }: { f: Friend }) => {
    const playing = f.presence.activity === 'playing';
    return (
      <PressableScale scaleTo={0.98} style={styles.row} onPress={() => setViewing(f.username)}>
        <View>
          <Avatar id={f.id} avatar={f.avatar} name={f.displayName} />
          <View style={[styles.dot, f.presence.online && styles.dotOn, playing && styles.dotPlaying]} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1}>
            {f.displayName} <Text style={styles.muted}>@{f.username}</Text>
          </Text>
          <Text style={[styles.status, f.presence.online && styles.statusOn, playing && styles.statusPlaying]} numberOfLines={1}>
            {presenceText(f.presence)}
          </Text>
        </View>
        <PixelIcon name="chevronRight" size={14} color={C.textFaint} />
      </PressableScale>
    );
  };

  const online = lists?.friends.filter((f) => f.presence.online).length ?? 0;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={session ? <RefreshControl refreshing={loading} onRefresh={() => refresh()} tintColor={PIXEL.accent2} /> : undefined}
      >
        {session === undefined ? (
          <ActivityIndicator color={PIXEL.accent2} style={styles.loader} />
        ) : !session ? (
          <View style={styles.center}>
            <Text style={styles.mutedCenter}>Sign in to add friends and see what they’re playing.</Text>
            <PressableScale scaleTo={0.95} style={styles.primaryBtn} onPress={() => router.push('/(tabs)/profile')}>
              <PixelIcon name="person" size={14} color={C.onAccent} />
              <Text style={styles.primaryText}>SIGN IN</Text>
            </PressableScale>
          </View>
        ) : (
          <Animated.View entering={FadeIn.duration(200)} style={styles.gap}>
            {/* Add a friend */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>ADD A FRIEND</Text>
              <View style={styles.addRow}>
                <TextInput
                  value={username}
                  onChangeText={(t) => {
                    setUsername(t);
                    setMessage(null);
                  }}
                  placeholder="@username"
                  placeholderTextColor={C.textSubtle}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={33}
                  onSubmitEditing={handleAdd}
                  style={styles.input}
                />
                <PressableScale
                  scaleTo={0.94}
                  disabled={adding || !username.trim()}
                  onPress={handleAdd}
                  style={[styles.addBtn, (adding || !username.trim()) && styles.disabled]}
                >
                  {adding ? <ActivityIndicator size="small" color={C.onAccent} /> : <PixelIcon name="userPlus" size={14} color={C.onAccent} />}
                  <Text style={styles.primaryText}>ADD</Text>
                </PressableScale>
              </View>
              {message ? <Text style={message.error ? styles.error : styles.success}>{message.text}</Text> : null}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {lists && lists.incoming.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>FRIEND REQUESTS ({lists.incoming.length})</Text>
                {lists.incoming.map((r) => (
                  <RequestRow key={r.id} r={r} incoming />
                ))}
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                FRIENDS {lists ? `(${lists.friends.length}) · ${online} ONLINE` : ''}
              </Text>
              {!lists ? (
                <ActivityIndicator color={PIXEL.accent2} />
              ) : lists.friends.length === 0 ? (
                <Text style={styles.muted}>No friends yet. Add someone by their @username above.</Text>
              ) : (
                lists.friends.map((f) => <FriendRow key={f.id} f={f} />)
              )}
            </View>

            {lists && lists.outgoing.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>SENT REQUESTS</Text>
                {lists.outgoing.map((r) => (
                  <RequestRow key={r.id} r={r} incoming={false} />
                ))}
              </View>
            ) : null}
          </Animated.View>
        )}
      </ScrollView>
      <ProfileSheet
        username={viewing}
        onClose={() => {
          setViewing(null);
          void refresh(true); // friend changes made from the profile
        }}
      />
    </View>
  );
}

const styles = themedStyles(() => ({
  root: { flex: 1, backgroundColor: 'transparent' },
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 40 },
  gap: { gap: 12 },
  loader: { marginTop: 40 },
  center: { alignItems: 'center', gap: 14, paddingTop: 40 },
  muted: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 16 },
  mutedCenter: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 18, textAlign: 'center' },
  error: { color: PIXEL.accent, fontFamily: FONTS.body, fontSize: 17 },
  success: { color: C.success, fontFamily: FONTS.body, fontSize: 17 },
  disabled: { opacity: 0.45 },

  section: { backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: PIXEL.panelLight, padding: 12, gap: 8 },
  sectionTitle: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 8 },
  addRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    color: C.textStrong,
    fontFamily: FONTS.body,
    fontSize: 20,
    backgroundColor: C.bgDeep,
    borderWidth: 2,
    borderColor: C.line,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, backgroundColor: PIXEL.accent, borderWidth: 2, borderColor: C.outline },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: PIXEL.accent, borderWidth: 2, borderColor: C.outline },
  primaryText: { color: C.onAccent, fontFamily: FONTS.pixel, fontSize: 9 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.lineSoft },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { backgroundColor: PIXEL.panelLight, borderWidth: 2, borderColor: C.outline, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { color: C.textStrong, fontFamily: FONTS.pixel },
  dot: { position: 'absolute', right: -3, bottom: -3, width: 12, height: 12, borderWidth: 2, borderColor: PIXEL.panel, backgroundColor: C.textFaint },
  dotOn: { backgroundColor: C.success },
  dotPlaying: { backgroundColor: PIXEL.accent },
  name: { color: C.textStrong, fontFamily: FONTS.body, fontSize: 19 },
  status: { color: C.textSubtle, fontFamily: FONTS.body, fontSize: 16 },
  statusOn: { color: C.success },
  statusPlaying: { color: PIXEL.accent },
  reqBtns: { flexDirection: 'row', gap: 6 },
  acceptBtn: { width: 36, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: C.success, borderWidth: 2, borderColor: C.outline },
  declineBtn: { width: 36, height: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.danger },
  cancelBtn: { paddingHorizontal: 10, paddingVertical: 6, borderWidth: 2, borderColor: PIXEL.panelLight },
  cancelText: { color: PIXEL.textDim, fontFamily: FONTS.pixel, fontSize: 7 },
}));
