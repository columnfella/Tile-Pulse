/**
 * Appearance: pick the colour theme (and the animated menu background).
 *
 * Opened with openAppearance() (the palette button on the Songs tab). It is
 * rendered by <AppearanceHost /> in the root layout, above every screen, so it
 * stays open while the app re-colours behind it when you pick a theme.
 * The choice applies immediately and is saved on the device (src/theme/palette.ts).
 */
import React, { useSyncExternalStore } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { PressableScale } from './PressableScale';
import { PixelIcon } from './PixelIcon';
import { BackgroundPicker, Sheet } from './SongSettingsSheet';
import { setDefaultBackground, useDefaultBackground } from '../../services/settings';
import { FONTS } from '../../theme/pixel';
import { C, THEMES, setTheme, themedStyles, useThemeId, type ThemeDefinition } from '../../theme/palette';

/* ------------------------------ open / close ------------------------------ */

let isOpen = false;
const listeners = new Set<() => void>();
const setOpen = (v: boolean) => {
  isOpen = v;
  listeners.forEach((l) => l());
};
export const openAppearance = () => setOpen(true);
export const closeAppearance = () => setOpen(false);
const useIsOpen = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => isOpen,
    () => false
  );

/* ------------------------------- theme card ------------------------------- */

/** The colours shown on each theme's card: a quick taste of the theme. */
const SWATCHES: (keyof ThemeDefinition['colors'])[] = ['background', 'surface', 'primary', 'secondary', 'highlight', 'text'];

function ThemeCard({ theme, active, width }: { theme: ThemeDefinition; active: boolean; width: number }) {
  const t = theme.colors;
  return (
    <PressableScale
      scaleTo={0.96}
      onPress={() => setTheme(theme.id)}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${theme.name} theme${active ? ', selected' : ''}`}
      // Each card previews its theme in the theme's own colours
      style={[styles.card, { width, backgroundColor: t.background, borderColor: active ? C.primary : t.border }, active && styles.cardActive]}
    >
      <View style={styles.cardHead}>
        <Text style={[styles.cardName, { color: t.text }]} numberOfLines={1}>
          {theme.name}
        </Text>
        {active ? (
          <View style={[styles.activeBadge, { backgroundColor: C.primary }]}>
            <PixelIcon name="check" size={10} color={C.onAccent} />
          </View>
        ) : null}
      </View>
      <Text style={[styles.cardMood, { color: t.textMuted }]} numberOfLines={1}>
        {theme.mood}
      </Text>
      <View style={[styles.swatches, { borderColor: t.border }]}>
        {SWATCHES.map((k) => (
          <View key={k} style={[styles.swatch, { backgroundColor: t[k] }]} />
        ))}
      </View>
      {/* A tiny "button" in the theme's accent, so the accent reads at a glance */}
      <View style={[styles.sample, { backgroundColor: t.surface, borderColor: t.border }]}>
        <View style={[styles.sampleBtn, { backgroundColor: t.primary }]} />
        <View style={[styles.sampleLine, { backgroundColor: t.textMuted }]} />
      </View>
      {/* Always takes its space, so selecting a card never changes its height */}
      <Text style={[styles.activeText, { color: C.primary, opacity: active ? 1 : 0 }]}>ACTIVE</Text>
    </PressableScale>
  );
}

/* ---------------------------------- sheet --------------------------------- */

export function AppearanceHost() {
  const open = useIsOpen();
  const themeId = useThemeId(); // re-render in the new colours when the theme changes
  const background = useDefaultBackground();
  const { width } = useWindowDimensions();
  if (!open) return null;

  // 2 columns on phones, more on tablets / desktop browsers
  const inner = Math.min(width, 900) - 32 - 4;
  const columns = inner >= 640 ? 4 : inner >= 460 ? 3 : 2;
  const gap = 10;
  const cardW = Math.floor((inner - gap * (columns - 1)) / columns);

  return (
    <Sheet title="Appearance" icon={<PixelIcon name="palette" size={18} color={C.highlight} />} onClose={closeAppearance}>
      <Text style={styles.sectionLabel}>THEME</Text>
      <Text style={styles.sectionHint}>Changes the colours of the whole game. Saved on this device.</Text>
      <View style={[styles.grid, { gap }]} accessibilityRole="radiogroup">
        {THEMES.map((t) => (
          <ThemeCard key={t.id} theme={t} active={t.id === themeId} width={cardW} />
        ))}
      </View>

      <Text style={[styles.sectionLabel, styles.sectionGap]}>BACKGROUND ANIMATION</Text>
      <Text style={styles.sectionHint}>
        Shown behind the menus, and during any song whose background is set to “Theme default”. Uses the theme’s colours.
      </Text>
      {/* Keyed by theme: the live previews redraw in the new colours */}
      <BackgroundPicker key={themeId} value={background} onChange={(v) => v !== 'default' && setDefaultBackground(v)} />
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  sectionLabel: { color: C.textSubtle, fontFamily: FONTS.body, fontSize: 15, letterSpacing: 1.5, marginTop: 4, marginBottom: 4 },
  sectionGap: { marginTop: 18 },
  sectionHint: { color: C.textDim, fontFamily: FONTS.body, fontSize: 16, lineHeight: 16, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { borderWidth: 2, padding: 10, gap: 6 },
  cardActive: { borderWidth: 3, padding: 9 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  cardName: { flexShrink: 1, fontFamily: FONTS.pixel, fontSize: 8, lineHeight: 12 },
  activeBadge: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  cardMood: { fontFamily: FONTS.body, fontSize: 14, lineHeight: 14 },
  swatches: { flexDirection: 'row', height: 14, borderWidth: 1 },
  swatch: { flex: 1 },
  sample: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 5, borderWidth: 1 },
  sampleBtn: { width: 22, height: 8 },
  sampleLine: { flex: 1, height: 3, opacity: 0.6 },
  activeText: { fontFamily: FONTS.pixel, fontSize: 7 },
}));
