import React from 'react';
import { Tabs } from 'expo-router';
import { PixelIcon } from '../../src/components/ui/PixelIcon';
import { ACTIVE_THEME } from '../../constants/theme';
import { FONTS } from '../../src/theme/pixel';

export default function TabLayout() {
  const { ui } = ACTIVE_THEME;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        tabBarStyle: {
          backgroundColor: ui.surfaceBackground,
          borderTopColor: ui.cardBorder,
          // No fixed height/padding: React Navigation adds the bottom safe-area
          // inset itself (e.g. the iPhone home indicator).
        },
        tabBarActiveTintColor: '#FF6B4A',
        tabBarLabelStyle: { fontFamily: FONTS.body, fontSize: 15 },
        tabBarInactiveTintColor: '#9aa7c2',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Songs',
          tabBarIcon: ({ color, size }) => (
            <PixelIcon name="home" size={size || 22} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, size }) => (
            <PixelIcon name="discover" size={size || 22} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="editor"
        options={{
          title: 'Editor',
          tabBarIcon: ({ color, size }) => (
            <PixelIcon name="editor" size={size || 22} color={String(color)} />
          ),
        }}
      />
    </Tabs>
  );
}
