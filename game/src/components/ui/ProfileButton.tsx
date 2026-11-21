/**
 * Profile button for the top right of the Songs tab: your profile picture
 * (or your initial), or the generic account icon when you're not signed in.
 * Opens the Profile screen (sign in / create account when signed out).
 */
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PressableScale } from './PressableScale';
import { PixelIcon } from './PixelIcon';
import { useMyAvatar } from '../../services/myAvatar';
import { FONTS, PIXEL } from '../../theme/pixel';

import { C, themedStyles } from '../../theme/palette';
export function ProfileButton({ size = 36 }: { size?: number }) {
  const router = useRouter();
  const me = useMyAvatar();
  return (
    <PressableScale
      scaleTo={0.88}
      style={[styles.button, { width: size, height: size }, me.signedIn && styles.signedIn]}
      onPress={() => router.navigate('/(tabs)/profile')}
      accessibilityLabel={me.signedIn ? 'Your profile' : 'Sign in'}
    >
      {!me.signedIn ? (
        <PixelIcon name="person" size={18} color={C.textSoft} />
      ) : me.uri ? (
        <Image source={{ uri: me.uri }} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={styles.initialBox}>
          <Text style={styles.initial}>{me.initial}</Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = themedStyles(() => ({
  button: { backgroundColor: PIXEL.panelLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  signedIn: { borderWidth: 2, borderColor: PIXEL.accent },
  initialBox: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  initial: { color: C.textStrong, fontFamily: FONTS.pixel, fontSize: 12 },
}));
