/**
 * Social tab: everything about other players in one place, in three sections:
 *  - FRIENDS: add friends, answer requests, see who's online / playing
 *  - RANKS:   the global leaderboard
 *  - INBOX:   notifications (friend requests, warnings, verified levels, badges)
 *
 * Open a section directly with /social?section=inbox (or friends / ranks).
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useLocalSearchParams } from 'expo-router';
import { ScreenView } from '../../src/components/ui/ScreenView';
import { PixelIcon, type PixelIconName } from '../../src/components/ui/PixelIcon';
import { PressableScale } from '../../src/components/ui/PressableScale';
import { FriendsPanel } from '../../src/components/social/FriendsPanel';
import { RanksPanel } from '../../src/components/social/RanksPanel';
import { InboxPanel } from '../../src/components/social/InboxPanel';
import { useSocialCounts } from '../../src/services/socialCounts';
import { PixelBadge } from '../../src/components/ui/PixelBadge';
import { FONTS, PIXEL } from '../../src/theme/pixel';

import { C, alpha, themedStyles } from '../../src/theme/palette';
type Section = 'friends' | 'ranks' | 'inbox';

const SECTIONS: { id: Section; label: string; icon: PixelIconName }[] = [
  { id: 'friends', label: 'FRIENDS', icon: 'friends' },
  { id: 'ranks', label: 'RANKS', icon: 'trophy' },
  { id: 'inbox', label: 'INBOX', icon: 'bell' },
];

const isSection = (s: unknown): s is Section => s === 'friends' || s === 'ranks' || s === 'inbox';

export default function SocialScreen() {
  const params = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState<Section>(isSection(params.section) ? params.section : 'friends');
  const counts = useSocialCounts();

  // Links like /social?section=inbox switch the section even when the tab is already open
  useEffect(() => {
    if (isSection(params.section)) setSection(params.section);
  }, [params.section]);

  return (
    <ScreenView style={styles.root}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <PixelIcon name="friends" size={21} color={PIXEL.accent} />
          <Text style={styles.title}>SOCIAL</Text>
        </View>
        <View style={styles.segments}>
          {SECTIONS.map((s) => {
            const active = s.id === section;
            // FRIENDS: requests waiting for you · INBOX: unread notices + new announcements
            const count = s.id === 'friends' ? counts.friends : s.id === 'inbox' ? counts.inbox : 0;
            return (
              <PressableScale
                key={s.id}
                scaleTo={0.95}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => setSection(s.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={count ? `${s.label}, ${count} new` : s.label}
              >
                <PixelIcon name={s.icon} size={13} color={active ? PIXEL.accent : PIXEL.textDim} />
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{s.label}</Text>
                <PixelBadge count={count} />
              </PressableScale>
            );
          })}
        </View>
      </View>

      {/* Only the open section is mounted (it loads its data when shown) */}
      <Animated.View key={section} entering={FadeIn.duration(180)} style={styles.flex}>
        {section === 'friends' ? <FriendsPanel /> : section === 'ranks' ? <RanksPanel /> : <InboxPanel />}
      </Animated.View>
    </ScreenView>
  );
}

const styles = themedStyles(() => ({
  root: { backgroundColor: 'transparent' },
  flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 14 },
  segments: { flexDirection: 'row', gap: 6 },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    backgroundColor: PIXEL.panel,
    borderWidth: 2,
    borderColor: PIXEL.panelLight,
  },
  segmentActive: { borderColor: PIXEL.accent, backgroundColor: alpha(C.accent, 0.12) },
  segmentText: { color: PIXEL.textDim, fontFamily: FONTS.pixel, fontSize: 8 },
  segmentTextActive: { color: PIXEL.accent },
}));
