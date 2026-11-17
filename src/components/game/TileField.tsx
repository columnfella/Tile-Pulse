import React, { memo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import type { TileNote } from '../../types/song';
import type { ActiveTileState } from '../../types/game';
import { TapTileView } from './TapTileView';
import { HoldTileView } from './HoldTileView';
import { SlideTileView } from './SlideTileView';
import { SlideLayer } from './SlideLayer';
import { isSlideTile } from '../../game/engine';

export interface TimedTile extends TileNote {
  noteTime: number; // seconds
  endTime: number; // seconds (same as noteTime for tap tiles)
  durationSeconds: number;
}

interface TileFieldProps {
  /** Tiles near the playhead (windowed by the parent). */
  tiles: TimedTile[];
  bpm: number;
  hitLineY: number;
  pixelsPerBeat: number;
  tapHeight: number;
  /** Width of the whole board in px (slide tiles span all lanes). */
  boardWidth?: number;
  /** Height of the board in px (the shared slide canvas covers it). */
  boardHeight?: number;
  /** Song time in seconds, advanced on the UI thread every frame. */
  songTime: SharedValue<number>;
  getTileState: (id: string) => ActiveTileState | undefined;
  /** Bumped whenever a tile's status changes, to re-render the field. */
  version: number;
}

const DEFAULT_STATE: ActiveTileState = { status: 'pending', heldBeats: 0, holdProgress: 0 };

interface MovingTileProps {
  tile: TimedTile;
  holdProgress: number;
  /** Song time when the hold was pressed (the fill grows from then). */
  holdStart?: number;
  status: ActiveTileState['status'];
  speed: number;
  hitLineY: number;
  height: number;
  pixelsPerBeat: number;
  boardWidth?: number;
  songTime: SharedValue<number>;
}

/**
 * One falling tile. Its vertical position is computed in a worklet on the UI
 * thread from the shared song clock, so it moves at the display's frame rate
 * even if the JS thread is busy. React only re-renders it when its status
 * (pending / holding / hit / missed) changes.
 */
const MovingTile = memo(function MovingTile({
  tile,
  status,
  holdProgress,
  holdStart,
  speed,
  hitLineY,
  height,
  pixelsPerBeat,
  boardWidth,
  songTime,
}: MovingTileProps) {
  const noteTime = tile.noteTime;
  const baseTop = hitLineY - height;

  const style = useAnimatedStyle(() => ({
    // Tile bottom reaches the hit line exactly when songTime === noteTime
    // Visible only once positioned by the worklet (never flashes at y = 0)
    opacity: 1,
    transform: [{ translateY: baseTop - (noteTime - songTime.value) * speed }],
  }));

  const isHold = tile.durationBeats > 0;
  const isSlide = isSlideTile(tile);

  if (isSlide) {
    return (
      <Animated.View pointerEvents="none" style={[styles.tile, styles.slide, { height }, style]}>
        <SlideTileView
          id={tile.id}
          path={tile.path!}
          durationBeats={tile.durationBeats}
          height={height}
          pixelsPerBeat={pixelsPerBeat}
          laneWidth={(boardWidth ?? 0) / 4}
          isHolding={status === 'holding'}
          isHit={status === 'hit'}
          isMissed={status === 'missed'}
          holdProgress={holdProgress}
          live={
            status === 'holding'
              ? { songTime, start: holdStart ?? tile.noteTime, duration: tile.durationSeconds }
              : undefined
          }
        />
      </Animated.View>
    );
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.tile, { left: `${tile.lane * 25}%`, height }, style]}
    >
      {isHold ? (
        <HoldTileView
          y={0}
          height={height}
          lane={tile.lane}
          isHolding={status === 'holding'}
          holdProgress={holdProgress}
          isHit={status === 'hit'}
          isMissed={status === 'missed'}
          live={
            status === 'holding'
              ? { songTime, start: holdStart ?? tile.noteTime, duration: tile.durationSeconds }
              : undefined
          }
        />
      ) : (
        <TapTileView
          y={0}
          height={height}
          lane={tile.lane}
          isHit={status === 'hit'}
          isMissed={status === 'missed'}
        />
      )}
    </Animated.View>
  );
});

export const TileField = memo(function TileField({
  tiles,
  bpm,
  hitLineY,
  pixelsPerBeat,
  tapHeight,
  boardWidth,
  boardHeight,
  songTime,
  getTileState,
  version,
}: TileFieldProps) {
  const speed = (pixelsPerBeat * bpm) / 60; // px per second

  return (
    <>
      {/* Native: every slide in one Skia canvas (web: nothing; slides draw per tile) */}
      <SlideLayer
        tiles={tiles}
        getTileState={getTileState}
        songTime={songTime}
        speed={speed}
        hitLineY={hitLineY}
        pixelsPerBeat={pixelsPerBeat}
        boardWidth={boardWidth ?? 0}
        boardHeight={boardHeight ?? 0}
        version={version}
      />
      {tiles.map((tile) => {
        const state = getTileState(tile.id) ?? DEFAULT_STATE;
        // Hit tiles stay on screen in a darker "pressed" state and scroll away;
        // missed tiles turn red.
        // Slides are exactly as tall as their path, so bends land on the beat grid
        const height = isSlideTile(tile)
          ? tile.durationBeats * pixelsPerBeat
          : tile.durationBeats > 0
            ? Math.max(tapHeight, tile.durationBeats * pixelsPerBeat)
            : tapHeight;
        return (
          <MovingTile
            key={tile.id}
            tile={tile}
            holdProgress={state.holdProgress}
            holdStart={state.holdStartTime}
            status={state.status}
            speed={speed}
            hitLineY={hitLineY}
            height={height}
            pixelsPerBeat={pixelsPerBeat}
            boardWidth={boardWidth}
            songTime={songTime}
          />
        );
      })}
    </>
  );
});

const styles = StyleSheet.create({
  tile: {
    position: 'absolute',
    top: 0,
    width: '25%',
    opacity: 0,
  },
  slide: { left: 0, width: '100%' },
});
