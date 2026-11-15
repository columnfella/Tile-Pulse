import React from 'react';
import { Tabs } from 'expo-router';
import { Home, Sliders } from 'lucide-react-native';
import { ACTIVE_THEME } from '../../constants/theme';

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
        tabBarActiveTintColor: '#38bdf8',
        tabBarInactiveTintColor: '#94a3b8',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Songs',
          tabBarIcon: ({ color, size }) => (
            <Home size={size || 20} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="editor"
        options={{
          title: 'Editor',
          tabBarIcon: ({ color, size }) => (
            <Sliders size={size || 20} color={String(color)} />
          ),
        }}
      />
    </Tabs>
  );
}
