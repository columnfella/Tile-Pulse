import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { VT323_400Regular } from '@expo-google-fonts/vt323';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import { audioService } from '../services/audio';
import { storageService } from '../services/storage';
import { AppSplash } from '../src/components/ui/AppSplash';
import { startPresence } from '../src/services/friends';
import * as Updates from 'expo-updates';

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
const APP_BACKGROUND = '#05070d';

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

  // Dark native root view, so nothing light can show between screen transitions
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(APP_BACKGROUND).catch(() => {});
  }, []);
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
  if (!fontsLoaded && !fontError) return null;

  return (
    <View style={{ flex: 1, backgroundColor: APP_BACKGROUND }}>
      <StatusBar hidden style="light" />
      <NavigationBar hidden style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#05070d' },
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

      {/* Animated startup screen; fades out once initialization finishes */}
      {!isReady && <AppSplash onReady={hideNativeSplash} />}
    </View>
  );
}
