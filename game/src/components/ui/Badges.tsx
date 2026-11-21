import React, { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PixelIcon, type PixelIconName } from './PixelIcon';
import { FONTS, PIXEL } from '../../theme/pixel';
import type { Badge } from '../../services/profile';

import { C, alpha } from '../../theme/palette';
/**
 * Badge looks (icon + colour). The server decides who has which badge; ids it
 * doesn't know yet (from a newer server) fall back to a plain star.
 */
const LOOKS: Record<string, { icon: PixelIconName; color: string; label: string }> = {
  owner: { icon: 'crown', color: C.yellow, label: 'OWNER' },
  developer: { icon: 'terminal', color: '#4dd6ff', label: 'DEV' },
  moderator: { icon: 'modShield', color: C.successBright, label: 'MOD' },
  bug_hunter: { icon: 'bug', color: '#c38bff', label: 'BUG HUNTER' },
  artist: { icon: 'note', color: '#ff8fd0', label: 'ARTIST' },
  supporter: { icon: 'heart', color: '#ff6b8a', label: 'SUPPORTER' },
  verified_creator: { icon: 'check', color: C.blue, label: 'VERIFIED CREATOR' },
  hardcore_hero: { icon: 'skull', color: C.accent, label: 'HARDCORE' },
  early_tester: { icon: 'star', color: C.warning, label: 'EARLY TESTER' },
  creator: { icon: 'pencil', color: C.textDim, label: 'CREATOR' },
};
const FALLBACK = { icon: 'star' as PixelIconName, color: PIXEL.textDim, label: 'BADGE' };

export const badgeLook = (id: string) => LOOKS[id] ?? FALLBACK;

/** Small icon shown right after a player's name (their main badge). */
export const BadgeIcon = memo(function BadgeIcon({ id, size = 12 }: { id: string | null | undefined; size?: number }) {
  if (!id) return null;
  const look = badgeLook(id);
  return (
    <View style={styles.icon} accessibilityLabel={`${look.label} badge`}>
      <PixelIcon name={look.icon} size={size} color={look.color} fit />
    </View>
  );
});

/** All badges of a player as chips; tap one to read what it means. */
export function BadgeList({ badges }: { badges: Badge[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!badges.length) return null;
  const shown = badges.find((b) => b.id === open);
  return (
    <View style={styles.listWrap}>
      <View style={styles.list}>
        {badges.map((b) => {
          const look = badgeLook(b.id);
          const active = open === b.id;
          return (
            <Pressable
              key={b.id}
              onPress={() => setOpen(active ? null : b.id)}
              style={[styles.chip, { borderColor: look.color }, active && { backgroundColor: `${look.color}26` }]}
              accessibilityRole="button"
              accessibilityLabel={`${b.name} badge`}
            >
              <PixelIcon name={look.icon} size={12} color={look.color} fit />
              <Text style={[styles.chipText, { color: look.color }]}>{look.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {shown ? (
        <Text style={styles.description}>
          {shown.name}: {shown.description}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { marginLeft: 5, alignItems: 'center', justifyContent: 'center' },
  listWrap: { gap: 6 },
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 2,
    paddingHorizontal: 7,
    paddingVertical: 5,
    minHeight: 24,
    backgroundColor: alpha(C.black, 0.35),
  },
  // The pixel font carries extra top padding on Android: trim it so the label
  // sits on the icon's centre line
  chipText: { fontFamily: FONTS.pixel, fontSize: 7, lineHeight: 10, includeFontPadding: false, textAlignVertical: 'center' },
  description: { fontFamily: FONTS.body, fontSize: 17, color: PIXEL.textDim },
});
