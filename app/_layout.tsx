import React, { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import { audioService } from '../services/audio';

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

export default function RootLayout() {
  useImmersiveMode();

  useEffect(() => {
    // Render the hit sounds up front so the first tap isn't silent
    void audioService.prepareEffects();
  }, []);

  return (
    <>
      <StatusBar hidden style="light" />
      <NavigationBar hidden style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#030712' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="play/[id]"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
            gestureEnabled: false,
          }}
        />
      </Stack>
    </>
  );
}
