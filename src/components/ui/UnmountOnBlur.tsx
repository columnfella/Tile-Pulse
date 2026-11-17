import React from 'react';
import { useIsFocused } from 'expo-router';

/**
 * Renders a tab's screen only while that tab is open. Leaving the tab unmounts
 * it, which frees its memory (lists, images, sheets, timers) and means it starts
 * fresh next time — no card left expanded or menu left open from before.
 * Used for every tab via `screenLayout` in app/(tabs)/_layout.tsx.
 */
export function UnmountOnBlur({ children }: { children: React.ReactNode }) {
  const focused = useIsFocused();
  return focused ? <>{children}</> : null;
}
