/** Web: no Skia canvas; slides are drawn per tile by SlideTileView.web.tsx. */
import type { SharedValue } from 'react-native-reanimated';
import type { ActiveTileState } from '../../types/game';
import type { TimedTile } from './TileField';

export const SLIDES_IN_LAYER = false;

export function SlideLayer(_props: {
  tiles: TimedTile[];
  getTileState: (id: string) => ActiveTileState | undefined;
  songTime: SharedValue<number>;
  speed: number;
  hitLineY: number;
  pixelsPerBeat: number;
  boardWidth: number;
  boardHeight: number;
  version: number;
}) {
  return null;
}
