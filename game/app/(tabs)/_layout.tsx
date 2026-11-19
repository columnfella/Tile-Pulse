import React from 'react';
import { View } from 'react-native';
import { TabsBackground } from '../../src/components/backgrounds/TabsBackground';
import { Tabs } from 'expo-router';
import { PixelIcon } from '../../src/components/ui/PixelIcon';
import { UnmountOnBlur } from '../../src/components/ui/UnmountOnBlur';
import { ACTIVE_THEME } from '../../src/constants/theme';
import { FONTS } from '../../src/theme/pixel';
import { useUnreadCount } from '../../src/services/notifications';

export default function TabLayout() {
  const { ui } = ACTIVE_THEME;
  const unread = useUnreadCount();

  return (
    <View style={{ flex: 1, backgroundColor: '#05070d' }}>
      {/* One animated theme background behind every tab (hidden in the editor) */}
      <TabsBackground />
    <Tabs
      // A tab is unmounted when you leave it (frees memory, and it starts fresh next time)
      screenLayout={({ children }) => <UnmountOnBlur>{children}</UnmountOnBlur>}
      screenOptions={{
        headerShown: false,
        // Tabs cross-fade through the app's navy (never the default white scene)
        animation: 'fade',
        // Transparent scenes: the shared background shows through (and tab
        // fades go through it, never white)
        sceneStyle: { backgroundColor: 'transparent' },
        tabBarStyle: {
          backgroundColor: ui.surfaceBackground,
          borderTopColor: ui.cardBorder,
          // No fixed height/padding: React Navigation adds the bottom safe-area
          // inset itself (e.g. the iPhone home indicator).
        },
        tabBarActiveTintColor: '#FF6B4A',
        // Seven tabs: a smaller label so they all fit on narrow phones
        tabBarLabelStyle: { fontFamily: FONTS.body, fontSize: 12 },
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
      <Tabs.Screen
        name="social"
        options={{
          title: 'Social',
          tabBarIcon: ({ color, size }) => (
            <PixelIcon name="friends" size={size || 22} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#FF6B4A', color: '#000000', fontFamily: FONTS.body, fontSize: 12 },
          tabBarIcon: ({ color, size }) => <PixelIcon name="bell" size={size || 22} color={String(color)} />,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Ranks',
          tabBarIcon: ({ color, size }) => (
            <PixelIcon name="trophy" size={size || 22} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <PixelIcon name="person" size={size || 22} color={String(color)} />
          ),
        }}
      />
    </Tabs>
    </View>
  );
}
