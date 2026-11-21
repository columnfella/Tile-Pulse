import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as SystemUI from 'expo-system-ui';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { VT323_400Regular } from '@expo-google-fonts/vt323';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import { audioService } from '../src/services/audio';
import { storageService } from '../src/services/storage';
import { AppSplash } from '../src/components/ui/AppSplash';
import { startPresence } from '../src/services/friends';
import { startMenuMusic } from '../src/services/menuMusic';
import { NowPlayingToast } from '../src/components/ui/NowPlayingToast';
import * as Updates from 'expo-updates';

import { C, loadSavedTheme, useThemeId } from '../src/theme/palette';
import { AppearanceHost } from '../src/components/ui/AppearanceSheet';
/**
 * Immersive full-screen mode: hides the status bar (all platforms) and the
 * Android navigation bar (back/home/recents). Users can still swipe from the
 * edge to reveal them temporarily.
 */
function useImmersiveMode() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const hide = () => NavigationBar.setHidden(true);
    hide();
    // Android can restore the bars after the app is backgrounded or a
    // dialog/keyboard is shown, so re-apply whenever we become active again.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') hide();
    });
    return () => sub.remove();
  }, []);
}

// Keep the native splash up until our animated splash is on screen
SplashScreen.preventAutoHideAsync().catch(() => {});

const MIN_SPLASH_MS = 1400;
/** How long the colours take to settle after switching themes (Appearance). */
const THEME_FADE_MS = 180;

/**
 * Navigation colours from the active theme: the library's default theme is
 * white, which flashed for a frame between tab switches.
 */
const navTheme = () => ({
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: C.bg,
    card: C.panel,
    border: C.panelLight,
    primary: C.accent,
    text: C.text,
  },
});

/** Seeds storage; resolves after a minimum splash time. */
async function initializeApp(): Promise<void> {
  await Promise.all([
    storageService.initStorage(),
    new Promise((resolve) => setTimeout(resolve, MIN_SPLASH_MS)),
  ]);
}

export default function RootLayout() {
  useImmersiveMode();

  // OTA updates (EAS Update): on launch, release builds check for a newer JS
  // bundle on their channel, download it and reload. Skipped in development and
  // where updates aren't enabled (Expo Go, web); never blocks or crashes the app.
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) return;
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      } catch {
        // Offline or the update server is unreachable: keep running the current bundle
      }
    })();
  }, []);

  // Tell friends you're online (a small heartbeat while the app is open and you're signed in)
  useEffect(() => {
    startPresence();
  }, []);

  // Menu music starts with the app (fades in; off in Settings → Menu music)
  useEffect(() => {
    startMenuMusic();
  }, []);

  // Saved theme (Appearance): restored before the first frame, so the app never
  // flashes the default theme first. Unknown / missing values fall back to it.
  const [themeLoaded, setThemeLoaded] = useState(false);
  useEffect(() => {
    void loadSavedTheme().finally(() => setThemeLoaded(true));
  }, []);
  const themeId = useThemeId();

  // Native root view in the theme's background, so nothing light shows between screens
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(C.bg).catch(() => {});
  }, [themeId]);

  // Switching themes: the screens re-render in the new colours behind a short
  // fade from the new background (no reload, nothing else animates)
  const veil = useSharedValue(0);
  const firstTheme = React.useRef(themeId);
  useEffect(() => {
    if (themeId === firstTheme.current) return;
    firstTheme.current = themeId;
    veil.value = 1;
    veil.value = withTiming(0, { duration: THEME_FADE_MS });
  }, [themeId, veil]);
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));
  const [isReady, setIsReady] = useState(false);
  // Pixel fonts must be loaded before anything renders text
  const [fontsLoaded, fontError] = useFonts({ PressStart2P_400Regular, VT323_400Regular });

  useEffect(() => {
    let cancelled = false;
    initializeApp()
      .catch((err) => console.warn('App initialization failed:', err))
      .finally(() => {
        if (!cancelled) setIsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hideNativeSplash = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // Keep the native splash up until the fonts are ready (a font error falls back to system fonts)
  if ((!fontsLoaded && !fontError) || !themeLoaded) return null;

  return (
    <ThemeProvider value={navTheme()}>
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar hidden style="light" />
      <NavigationBar hidden style="light" />
      {/* Keyed by theme: switching themes re-renders every screen in the new
          colours (they all read the active theme, see src/theme/palette.ts) */}
      <View key={themeId} style={styles.flex}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: C.bg },
          animation: 'fade_from_bottom',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="play/[id]"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            animation: 'fade',
            animationDuration: 250,
            gestureEnabled: false,
          }}
        />
      </Stack>
      </View>

      {/* Theme switch: fades from the new background into the re-coloured screen */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }, veilStyle]} />

      {/* Appearance (theme picker): above the screens, so it stays open while they re-colour */}
      <AppearanceHost />

      {/* Animated startup screen; fades out once initialization finishes */}
      {/* Menu song credit pop-up (shown once the splash is gone) */}
      <NowPlayingToast ready={isReady} />

      {!isReady && <AppSplash onReady={hideNativeSplash} />}
    </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
