/**
 * Shows new developer announcements (src/services/announcements.ts) as a
 * pop-up, one at a time, once per device. Checked when the app starts and when
 * it comes back to the foreground (at most every few minutes).
 * Rendered by the root layout above every screen.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { PressableScale } from './PressableScale';
import { PixelIcon } from './PixelIcon';
import { getUnseenAnnouncements, markAnnouncementSeen, type Announcement } from '../../services/announcements';
import { FONTS } from '../../theme/pixel';
import { C, alpha, themedStyles, useThemeId } from '../../theme/palette';

const RECHECK_MS = 5 * 60_000;

export function AnnouncementHost({ ready }: { ready: boolean }) {
  useThemeId(); // lives above the screens: re-render when the theme changes
  const [queue, setQueue] = useState<Announcement[]>([]);
  const lastCheck = useRef(0);

  const check = useCallback(async () => {
    if (Date.now() - lastCheck.current < RECHECK_MS) return;
    lastCheck.current = Date.now();
    const unseen = await getUnseenAnnouncements();
    if (unseen.length) setQueue((q) => (q.length ? q : unseen));
  }, []);

  useEffect(() => {
    if (!ready) return;
    void check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void check());
    return () => sub.remove();
  }, [ready, check]);

  const current = queue[0];
  if (!ready || !current) return null;

  const dismiss = () => {
    void markAnnouncementSeen(current.id);
    setQueue((q) => q.slice(1));
  };
  const open = () => {
    if (current.link) Linking.openURL(current.link.url).catch(() => {});
    dismiss();
  };

  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={styles.backdrop}>
      <Animated.View key={current.id} entering={ZoomIn.duration(220)} style={styles.card} accessibilityRole="alert">
        <View style={styles.head}>
          <View style={styles.iconBox}>
            <PixelIcon name="bell" size={14} color={C.onAccent} />
          </View>
          <Text style={styles.kicker}>FROM THE TILEPULSE TEAM</Text>
        </View>
        <Text style={styles.title}>{current.title}</Text>
        <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyContent}>
          <Text style={styles.body}>{current.body}</Text>
        </ScrollView>
        <View style={styles.actions}>
          {current.link ? (
            <PressableScale scaleTo={0.95} style={styles.primaryBtn} onPress={open} accessibilityRole="link">
              <Text style={styles.primaryText}>{current.link.label.toUpperCase()}</Text>
            </PressableScale>
          ) : null}
          <PressableScale scaleTo={0.95} style={current.link ? styles.secondaryBtn : styles.primaryBtn} onPress={dismiss}>
            <Text style={current.link ? styles.secondaryText : styles.primaryText}>GOT IT</Text>
          </PressableScale>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = themedStyles(() => ({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 900,
    elevation: 900,
    backgroundColor: alpha(C.black, 0.7),
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '80%',
    backgroundColor: C.panel,
    borderWidth: 3,
    borderColor: C.accent,
    padding: 16,
    gap: 10,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBox: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent },
  kicker: { color: C.blue, fontFamily: FONTS.pixel, fontSize: 7 },
  title: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 12, lineHeight: 18 },
  bodyScroll: { flexGrow: 0 },
  bodyContent: { paddingBottom: 2 },
  body: { color: C.text, fontFamily: FONTS.body, fontSize: 19, lineHeight: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  primaryBtn: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, backgroundColor: C.accent, borderWidth: 2, borderColor: C.outline },
  primaryText: { color: C.onAccent, fontFamily: FONTS.pixel, fontSize: 9 },
  secondaryBtn: { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderWidth: 2, borderColor: C.panelLight },
  secondaryText: { color: C.textDim, fontFamily: FONTS.pixel, fontSize: 9 },
}));
