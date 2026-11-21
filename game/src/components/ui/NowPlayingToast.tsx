/**
 * "Now playing" pop-up at the top of the screen whenever a menu song starts,
 * crediting the artist the way their licence asks (song, composer, licence,
 * source). Slides down, stays a few seconds, slides back up; tap it to open
 * the artist's page, swipe/tap ✕ to close.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PixelIcon } from './PixelIcon';
import { FONTS, PIXEL } from '../../theme/pixel';
import { useMenuMusicSettings, useTrackStart, type TrackStart } from '../../services/menuMusic';

import { C, alpha } from '../../theme/palette';
const SHOW_MS = 7000;
/** A track that started this recently still gets its pop-up once the app is visible (after the splash). */
const LATE_MS = 15000;

const shortUrl = (url?: string) => (url ? url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : null);

export function NowPlayingToast({ ready = true }: { ready?: boolean }) {
  const start = useTrackStart();
  const { enabled } = useMenuMusicSettings();
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<TrackStart | null>(null);
  const lastId = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ready || !start || start.id === lastId.current || !enabled) return;
    lastId.current = start.id;
    if (Date.now() - start.at > LATE_MS) return;
    setShown(start);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShown(null), SHOW_MS);
  }, [start, enabled, ready]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    []
  );

  if (!shown) return null;
  const { track } = shown;
  const c = track.credit;
  const link = c?.website ?? c?.licenseUrl;

  return (
    <Animated.View
      entering={SlideInUp.duration(380)}
      exiting={SlideOutUp.duration(300)}
      style={[styles.wrap, { top: insets.top + 8 }]}
      pointerEvents="box-none"
    >
      <Pressable
        style={styles.card}
        onPress={() => (link ? Linking.openURL(link).catch(() => {}) : setShown(null))}
        accessibilityRole="button"
        accessibilityLabel={`Now playing ${c?.song ?? track.title}${c?.composer ? ` by ${c.composer}` : ''}`}
      >
        <View style={styles.iconBox}>
          <PixelIcon name="note" size={16} color={C.onAccent} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.kicker}>NOW PLAYING</Text>
          <Text style={styles.title} numberOfLines={1}>
            {c?.song ?? track.title}
            {c?.composer ? <Text style={styles.by}> — {c.composer}</Text> : null}
          </Text>
          {c?.license ? (
            <Text style={styles.line} numberOfLines={1}>
              {c.license}
              {c.licenseUrl ? ` · ${shortUrl(c.licenseUrl)}` : ''}
            </Text>
          ) : null}
          {c?.website ? (
            <Text style={styles.line} numberOfLines={1}>
              {shortUrl(c.website)}
            </Text>
          ) : null}
          {c?.poweredBy ? (
            <Text style={styles.line} numberOfLines={1}>
              {c.poweredBy}
              {c.poweredByUrl ? `: ${shortUrl(c.poweredByUrl)}` : ''}
            </Text>
          ) : null}
        </View>
        <Pressable hitSlop={10} onPress={() => setShown(null)} style={styles.close} accessibilityLabel="Close">
          <PixelIcon name="close" size={10} color={PIXEL.textDim} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 1000, elevation: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: alpha(C.panel, 0.96),
    borderWidth: 2,
    borderColor: C.outline,
    borderLeftWidth: 5,
    borderLeftColor: PIXEL.accent,
    paddingVertical: 9,
    paddingHorizontal: 10,
    shadowColor: C.outline,
    shadowOpacity: 0.5,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
  },
  iconBox: { width: 30, height: 30, backgroundColor: PIXEL.accent, borderWidth: 2, borderColor: C.outline, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 1 },
  kicker: { color: PIXEL.accent, fontFamily: FONTS.pixel, fontSize: 6 },
  title: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 9, marginTop: 3 },
  by: { color: PIXEL.accent2 },
  line: { color: PIXEL.textDim, fontFamily: FONTS.body, fontSize: 15 },
  close: { padding: 4, alignSelf: 'flex-start' },
});
