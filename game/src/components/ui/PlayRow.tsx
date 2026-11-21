/**
 * PLAY button with a hardcore switch beside it. With hardcore on, the play
 * button turns red and the level starts in hardcore mode (one miss = loss).
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { PressableScale } from './PressableScale';
import { PixelIcon } from './PixelIcon';
import { useHardcore } from '../../services/hardcore';
import { FONTS, PIXEL } from '../../theme/pixel';

import { C, themedStyles } from '../../theme/palette';

export function PlayRow({ songId, style }: { songId: string; style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const [hardcore, toggle] = useHardcore(songId);
  const play = () =>
    router.push(hardcore ? { pathname: '/play/[id]', params: { id: songId, hardcore: '1' } } : `/play/${songId}`);

  return (
    <View style={[styles.row, style]}>
      <PressableScale
        scaleTo={0.96}
        style={[styles.play, hardcore && styles.playHardcore]}
        onPress={play}
        accessibilityLabel={hardcore ? 'Play in hardcore mode' : 'Play'}
      >
        <PixelIcon name="play" size={14} color={hardcore ? C.textStrong : C.onAccent} />
        <Text style={[styles.playText, hardcore && styles.playTextHardcore]}>{hardcore ? 'PLAY HARDCORE' : 'PLAY'}</Text>
      </PressableScale>
      <PressableScale
        scaleTo={0.9}
        style={[styles.toggle, hardcore && styles.toggleOn]}
        onPress={toggle}
        accessibilityRole="switch"
        accessibilityState={{ checked: hardcore }}
        accessibilityLabel="Hardcore mode: one miss and you lose"
      >
        <PixelIcon name="skull" size={14} color={hardcore ? C.textStrong : PIXEL.textDim} />
        <Text style={[styles.toggleText, hardcore && styles.toggleTextOn]}>HC</Text>
      </PressableScale>
    </View>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', gap: 8 },
  play: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
    backgroundColor: PIXEL.accent,
    borderWidth: 2,
    borderColor: C.outline,
  },
  playHardcore: { backgroundColor: C.danger },
  playText: { color: C.onAccent, fontFamily: FONTS.pixel, fontSize: 10 },
  playTextHardcore: { color: C.textStrong },
  toggle: {
    width: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 2,
    borderColor: PIXEL.panelLight,
    backgroundColor: C.bgDeep,
  },
  toggleOn: { backgroundColor: C.dangerDeep, borderColor: C.danger },
  toggleText: { color: PIXEL.textDim, fontFamily: FONTS.pixel, fontSize: 7 },
  toggleTextOn: { color: C.textStrong },
}));
