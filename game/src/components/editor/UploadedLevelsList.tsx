/**
 * Editor → UPLOADED: the levels you posted. Tap one to edit it (downloaded into
 * your editor first if it isn't on this device), then use Upload → Update level
 * to publish the new version: players who downloaded it get it automatically.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { PixelIcon } from '../ui/PixelIcon';
import { PressableScale } from '../ui/PressableScale';
import { listItemIn } from '../ui/motion';
import { getSession, onSessionChange, type Session } from '../../services/account';
import { getMyProfile, getProfile, type ProfileUpload } from '../../services/profile';
import { downloadForEditing, findLocalSongForLevel } from '../../services/levelUpload';
import { playerErrorMessage } from '../../services/playerError';
import type { Song } from '../../types/song';
import { FONTS } from '../../theme/pixel';
import { C, themedStyles } from '../../theme/palette';

export function UploadedLevelsList({ onOpen }: { onOpen: (song: Song) => void }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [uploads, setUploads] = useState<ProfileUpload[] | null>(null);
  const [onDevice, setOnDevice] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    void getSession().then(setSession);
    return onSessionChange(setSession);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const me = await getMyProfile();
      const list = (await getProfile(me.username)).uploads ?? [];
      setUploads(list);
      const local = await Promise.all(list.map(async (u) => ((await findLocalSongForLevel(u.id)) ? u.id : null)));
      setOnDevice(new Set(local.filter((x): x is string => !!x)));
    } catch (err) {
      setError(playerErrorMessage(err, 'Couldn’t load your levels. Please try again.'));
    }
  }, []);

  useEffect(() => {
    if (session) void load();
    else setUploads(null);
  }, [session, load]);

  const open = async (u: ProfileUpload) => {
    if (opening) return;
    setOpening(u.id);
    setError(null);
    try {
      const song = await downloadForEditing(u.id, u.visibility === 'unlisted' ? 'unlisted' : 'public');
      onOpen(song);
    } catch (err) {
      setError(playerErrorMessage(err, 'Couldn’t open this level. Please try again.'));
    } finally {
      setOpening(null);
    }
  };

  if (session === undefined) return <ActivityIndicator color={C.blue} style={styles.loader} />;
  if (!session) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Sign in to see and update the levels you posted.</Text>
        <PressableScale scaleTo={0.95} style={styles.primaryBtn} onPress={() => router.navigate('/(tabs)/profile')}>
          <PixelIcon name="person" size={14} color={C.onAccent} />
          <Text style={styles.primaryText}>SIGN IN</Text>
        </PressableScale>
      </View>
    );
  }

  return (
    <FlatList
      data={uploads ?? []}
      keyExtractor={(u) => u.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.headerGap}>
          <Text style={styles.hint}>
            Tap a level to edit it, then UPLOAD → UPDATE LEVEL. Players who downloaded it get the new version automatically.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        uploads === null ? (
          <ActivityIndicator color={C.blue} style={styles.loader} />
        ) : (
          <Text style={[styles.muted, styles.emptyText]}>You haven’t posted any levels yet. Upload one from the editor.</Text>
        )
      }
      renderItem={({ item, index }) => {
        const local = onDevice.has(item.id);
        return (
          <Animated.View entering={listItemIn(index)}>
            <PressableScale scaleTo={0.97} style={styles.card} onPress={() => open(item)} accessibilityLabel={`Edit ${item.name}`}>
              <View style={styles.icon}>
                <PixelIcon name="upload" size={18} color={C.blue} />
              </View>
              <View style={styles.info}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.song.title} · {item.difficulty.toUpperCase()} {item.level} · {item.plays} plays
                  {item.visibility === 'unlisted' ? ' · unlisted' : ''}
                </Text>
                <Text style={[styles.status, local && styles.statusLocal]}>{local ? 'ON THIS DEVICE' : 'TAP TO DOWNLOAD & EDIT'}</Text>
              </View>
              {opening === item.id ? <ActivityIndicator color={C.blue} /> : <PixelIcon name="chevronRight" size={21} color={C.textFaint} />}
            </PressableScale>
          </Animated.View>
        );
      }}
    />
  );
}

const styles = themedStyles(() => ({
  loader: { marginTop: 30 },
  center: { alignItems: 'center', gap: 14, paddingTop: 40, paddingHorizontal: 24 },
  muted: { color: C.textDim, fontFamily: FONTS.body, fontSize: 18, textAlign: 'center' },
  emptyText: { marginTop: 24 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: C.accent, borderWidth: 2, borderColor: C.outline },
  primaryText: { color: C.onAccent, fontFamily: FONTS.pixel, fontSize: 9 },
  list: { padding: 16, gap: 8 },
  headerGap: { gap: 8, marginBottom: 4 },
  hint: { color: C.textDim, fontFamily: FONTS.body, fontSize: 16, lineHeight: 17 },
  error: { color: C.danger, fontFamily: FONTS.body, fontSize: 17 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: C.panel, borderWidth: 2, borderColor: C.panelLight },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgDeep, borderWidth: 2, borderColor: C.panelLight },
  info: { flex: 1, gap: 2 },
  title: { color: C.textStrong, fontFamily: FONTS.body, fontSize: 20 },
  meta: { color: C.textSubtle, fontFamily: FONTS.body, fontSize: 15 },
  status: { color: C.blue, fontFamily: FONTS.pixel, fontSize: 6, marginTop: 2 },
  statusLocal: { color: C.success },
}));
