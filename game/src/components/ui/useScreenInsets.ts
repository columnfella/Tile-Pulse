import { Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Safe-area insets that also clear camera cutouts (punch-holes, notches,
 * waterdrops) while the status bar is hidden.
 *
 * On Android, hiding the status bar can make the reported top inset drop to 0
 * even though a camera cutout is still there. Every cutout sits inside the
 * status-bar area, so we never go below the status bar's height.
 */
export function useScreenInsets() {
  const insets = useSafeAreaInsets();
  const androidStatusBar = Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 0;
  return {
    top: Math.max(insets.top, androidStatusBar),
    bottom: insets.bottom,
    left: insets.left,
    right: insets.right,
  };
}
