import React from 'react';
import { Tabs } from 'expo-router';
import { Home, Sliders } from 'lucide-react';
import { ACTIVE_THEME } from '../../constants/theme';

export default function TabLayout() {
  const { ui } = ACTIVE_THEME;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: ui.surfaceBackground,
          borderTopColor: ui.cardBorder,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#38bdf8',
        tabBarInactiveTintColor: '#94a3b8',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Songs',
          tabBarIcon: ({ color, size }: { color: string; size?: number }) => (
            <Home size={size || 20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="editor"
        options={{
          title: 'Editor',
          tabBarIcon: ({ color, size }: { color: string; size?: number }) => (
            <Sliders size={size || 20} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
