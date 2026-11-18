import React, { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PixelIcon, type PixelIconName } from './PixelIcon';
import { FONTS, PIXEL } from '../../theme/pixel';
import type { Badge } from '../../services/profile';

/**
 * Badge looks (icon + colour). The server decides who has which badge; ids it
 * doesn't know yet (from a newer server) fall back to a plain star.
 */
const LOOKS: Record<string, { icon: PixelIconName; color: string; label: string }> = {
  owner: { icon: 'crown', color: '#ffd23f', label: 'OWNER' },
  developer: { icon: 'terminal', color: '#4dd6ff', label: 'DEV' },
  moderator: { icon: 'modShield', color: '#7dff8a', label: 'MOD' },
  bug_hunter: { icon: 'bug', color: '#c38bff', label: 'BUG HUNTER' },
  artist: { icon: 'note', color: '#ff8fd0', label: 'ARTIST' },
  supporter: { icon: 'heart', color: '#ff6b8a', label: 'SUPPORTER' },
  verified_creator: { icon: 'check', color: '#4d8dff', label: 'VERIFIED CREATOR' },
  hardcore_hero: { icon: 'skull', color: '#FF6B4A', label: 'HARDCORE' },
  early_tester: { icon: 'star', color: '#ffb84d', label: 'EARLY TESTER' },
  creator: { icon: 'pencil', color: '#9aa7c2', label: 'CREATOR' },
};
const FALLBACK = { icon: 'star' as PixelIconName, color: PIXEL.textDim, label: 'BADGE' };

export const badgeLook = (id: string) => LOOKS[id] ?? FALLBACK;

/** Small icon shown right after a player's name (their main badge). */
export const BadgeIcon = memo(function BadgeIcon({ id, size = 12 }: { id: string | null | undefined; size?: number }) {
  if (!id) return null;
  const look = badgeLook(id);
  return (
    <View style={styles.icon} accessibilityLabel={`${look.label} badge`}>
      <PixelIcon name={look.icon} size={size} color={look.color} />
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
              <PixelIcon name={look.icon} size={12} color={look.color} />
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
  icon: { marginLeft: 5, justifyContent: 'center' },
  listWrap: { gap: 6 },
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 2,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  chipText: { fontFamily: FONTS.pixel, fontSize: 7 },
  description: { fontFamily: FONTS.body, fontSize: 17, color: PIXEL.textDim },
});
