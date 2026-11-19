/**
 * Size of the play area: web version (iPhone Safari, any browser).
 * The play screen fills the window. In the browser the root layout event may
 * never arrive, which left the board at 0 px and mounted no tiles at all, so
 * the window size is used until a measurement comes in.
 */
import { useCallback, useState } from 'react';
import { useWindowDimensions, type LayoutChangeEvent } from 'react-native';

export function usePlayAreaSize() {
  const win = useWindowDimensions();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
  }, []);
  return {
    boardWidth: size.width > 0 ? size.width : win.width,
    boardHeight: size.height > 0 ? size.height : win.height,
    onLayout,
  };
}
