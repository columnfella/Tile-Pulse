import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import { audioService } from '../services/audio';
import { storageService } from '../services/storage';
import { AppSplash } from '../src/components/ui/AppSplash';

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

/** Seeds storage; resolves after a minimum splash time. */
async function initializeApp(): Promise<void> {
  await Promise.all([
    storageService.initStorage(),
    new Promise((resolve) => setTimeout(resolve, MIN_SPLASH_MS)),
  ]);
}

export default function RootLayout() {
  useImmersiveMode();
  const [isReady, setIsReady] = useState(false);

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

  return (
    <>
      <StatusBar hidden style="light" />
      <NavigationBar hidden style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#030712' },
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
    </>
  );
}
