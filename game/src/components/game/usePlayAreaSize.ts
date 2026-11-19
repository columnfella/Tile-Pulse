/**
 * Size of the play area (phone app): measured from the play screen's root
 * layout, i.e. the real screen size once the system bars are hidden.
 * The web version has its own in usePlayAreaSize.web.ts.
 */
import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

export function usePlayAreaSize() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
  }, []);
  return { boardWidth: size.width, boardHeight: size.height, onLayout };
}
