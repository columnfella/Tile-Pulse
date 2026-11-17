/**
 * Leaderboard tab: players ranked by their accumulated score — the sum of
 * their best run on every community level (replays of a level don't stack).
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { ScreenView } from '../../src/components/ui/ScreenView';
import { PixelIcon } from '../../src/components/ui/PixelIcon';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { ProfileSheet } from '../../src/components/ui/ProfileSheet';
import { listItemIn } from '../../src/components/ui/motion';
import { FONTS, PIXEL } from '../../src/theme/pixel';
import { API_BASE, ApiUnavailableError } from '../../src/services/communityApi';
import { getSession } from '../../src/services/account';
import { avatarUrl } from '../../src/services/profile';
import { getLeaderboard, type Leaderboard, type LeaderboardEntry } from '../../src/services/friends';

const MEDAL = ['#f5b83d', '#cdd6ea', '#d08a4f'] as const; // gold, silver, bronze

export default function LeaderboardScreen() {
  const [data, setData] = useState<Leaderboard | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [board, session] = await Promise.all([getLeaderboard(100), getSession()]);
      setData(board);
      setMe(session?.user.username ?? null);
    } catch (err) {
      setError(
        err instanceof ApiUnavailableError
          ? `Can’t reach the community server (${API_BASE}).`
          : err instanceof Error
            ? err.message
            : 'Something went wrong.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const renderItem = ({ item, index }: { item: LeaderboardEntry; index: number }) => {
    const uri = avatarUrl(item.player.id, item.player.avatar);
    const isMe = item.player.username === me;
    const medal = item.rank <= 3 ? MEDAL[item.rank - 1] : null;
    return (
      <Animated.View entering={listItemIn(Math.min(index, 12))}>
        <PressableScale scaleTo={0.98} style={[styles.row, isMe && styles.rowMe]} onPress={() => setViewing(item.player.username)}>
          <View style={[styles.rankBox, medal ? { borderColor: medal } : null]}>
            {medal ? <PixelIcon name="trophy" size={14} color={medal} /> : null}
            <Text style={[styles.rank, medal ? { color: medal } : null]}>{item.rank}</Text>
          </View>
          <View style={styles.avatar}>
            {uri ? (
              <Image source={{ uri }} style={StyleSheet.absoluteFill} />
            ) : (
              <Text style={styles.avatarText}>{(item.player.displayName[0] ?? '?').toUpperCase()}</Text>
            )}
          </View>
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={1}>
              {item.player.displayName}
              {isMe ? <Text style={styles.you}>  YOU</Text> : null}
            </Text>
            <Text style={styles.muted} numberOfLines={1}>
              @{item.player.username} · {item.levels} {item.levels === 1 ? 'level' : 'levels'}
            </Text>
          </View>
          <Text style={styles.total}>{item.total.toLocaleString()}</Text>
        </PressableScale>
      </Animated.View>
    );
  };

  return (
    <ScreenView style={styles.root}>
      <FlatList
        data={data?.players ?? []}
        keyExtractor={(e) => e.player.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={load} tintColor={PIXEL.accent2} />}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <View style={styles.header}>
              <PixelIcon name="trophy" size={21} color="#f5b83d" />
              <Text style={styles.title}>LEADERBOARD</Text>
            </View>
            <Text style={styles.muted}>
              Total score = your best run on every community level. Replaying a level only counts if you beat your best.
            </Text>
            {data?.me ? (
              <View style={styles.meCard}>
                <Text style={styles.meLabel}>YOUR RANK</Text>
                <Text style={styles.meRank}>{data.me.rank ? `#${data.me.rank}` : '—'}</Text>
                <Text style={styles.muted}>
                  {data.me.total.toLocaleString()} pts · {data.me.levels} levels
                  {data.totalPlayers ? ` · ${data.totalPlayers} players` : ''}
                </Text>
                {!data.me.rank ? <Text style={styles.muted}>Finish a community level from Discover to get ranked.</Text> : null}
              </View>
            ) : data ? (
              <Text style={styles.muted}>Sign in (Profile tab) to see your own rank.</Text>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          loading && !data ? (
            <ActivityIndicator color={PIXEL.accent2} style={styles.loader} />
          ) : !error ? (
            <Text style={[styles.muted, styles.empty]}>No scores yet. Be the first on the board!</Text>
          ) : undefined
        }
      />
      <ProfileSheet username={viewing} onClose={() => setViewing(null)} />
    </ScreenView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: PIXEL.bg },
  flex: { flex: 1 },
  list: { padding: 16, paddingBottom: 40, gap: 6 },
  headerWrap: { gap: 10, marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 14 },
  muted: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 16 },
  error: { color: PIXEL.accent, fontFamily: FONTS.body, fontSize: 17 },
  loader: { marginTop: 30 },
  empty: { textAlign: 'center', marginTop: 30 },

  meCard: { backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: PIXEL.accent, padding: 12, gap: 4 },
  meLabel: { color: '#6b7a99', fontFamily: FONTS.pixel, fontSize: 7 },
  meRank: { color: PIXEL.accent, fontFamily: FONTS.pixel, fontSize: 20 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: PIXEL.panel, borderWidth: 2, borderColor: PIXEL.panelLight },
  rowMe: { borderColor: PIXEL.accent },
  rankBox: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: PIXEL.panelLight, backgroundColor: '#070b14', gap: 2 },
  rank: { color: PIXEL.text, fontFamily: FONTS.pixel, fontSize: 9 },
  avatar: { width: 38, height: 38, backgroundColor: PIXEL.panelLight, borderWidth: 2, borderColor: '#000000', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { color: '#ffffff', fontFamily: FONTS.pixel, fontSize: 12 },
  name: { color: '#ffffff', fontFamily: FONTS.body, fontSize: 19 },
  you: { color: PIXEL.accent, fontFamily: FONTS.pixel, fontSize: 7 },
  total: { color: '#f5b83d', fontFamily: FONTS.pixel, fontSize: 10 },
});
