/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { RouterProvider, useRouter, useLocalSearchParams } from './utils/expo-router-web';
import { MobileShell } from './components/ui/MobileShell';
import HomeScreen from '../app/(tabs)/index';
import EditorScreen from '../app/(tabs)/editor';
import PlayScreen from '../app/play/[id]';
import { Home, Sliders } from 'lucide-react';
import { ACTIVE_THEME } from './constants/theme';
import { SplashScreen } from './screens/SplashScreen';

function AppContent() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'home' | 'editor'>('home');
  const [isReady, setIsReady] = useState<boolean>(false);

  const isPlaying = router.route.startsWith('/play/');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'editor') {
      setActiveTab('editor');
    }
  }, []);

  useEffect(() => {
    if (router.route.includes('editor')) {
      setActiveTab('editor');
    } else if (router.route === '/(tabs)' || router.route === '/') {
      setActiveTab('home');
    }
  }, [router.route]);

  const handleTabPress = (tab: 'home' | 'editor') => {
    setActiveTab(tab);
    if (tab === 'editor') {
      router.push('/(tabs)/editor');
    } else {
      router.replace('/(tabs)');
    }
  };

  if (!isReady) {
    return <SplashScreen onLoaded={() => setIsReady(true)} />;
  }

  return (
    <MobileShell activeScreen={isPlaying ? 'play' : activeTab}>
      {isPlaying ? (
        <View style={styles.screenContainer}>
          <PlayScreen />
        </View>
      ) : (
        <View style={styles.mainContainer}>
          <View style={styles.screenContainer}>
            {activeTab === 'home' ? <HomeScreen /> : <EditorScreen />}
          </View>

          {/* Bottom Tabs Bar */}
          <View
            style={[
              styles.tabBar,
              {
                backgroundColor: ACTIVE_THEME.ui.surfaceBackground,
                borderTopColor: ACTIVE_THEME.ui.cardBorder,
              },
            ]}
          >
            <Pressable
              style={styles.tabItem}
              onPress={() => handleTabPress('home')}
              accessibilityLabel="Home tab"
            >
              <Home
                size={20}
                color={activeTab === 'home' ? '#38bdf8' : '#94a3b8'}
                strokeWidth={activeTab === 'home' ? 2.5 : 1.75}
              />
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === 'home' ? '#38bdf8' : '#94a3b8' },
                ]}
              >
                Songs
              </Text>
            </Pressable>

            <Pressable
              style={styles.tabItem}
              onPress={() => handleTabPress('editor')}
              accessibilityLabel="Edit tab"
            >
              <Sliders
                size={20}
                color={activeTab === 'editor' ? '#38bdf8' : '#94a3b8'}
                strokeWidth={activeTab === 'editor' ? 2.5 : 1.75}
              />
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === 'editor' ? '#38bdf8' : '#94a3b8' },
                ]}
              >
                Editor
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </MobileShell>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <AppContent />
    </RouterProvider>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    flexDirection: 'column',
    overflow: 'hidden',
  },
  screenContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  tabBar: {
    height: 60,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  tabText: {
    fontSize: 11,
    marginTop: 3,
    fontWeight: '600',
  },
});
