import React, { memo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import type { TileNote } from '../../types/song';
import type { ActiveTileState } from '../../types/game';
import { TapTileView } from './TapTileView';
import { HoldTileView } from './HoldTileView';

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
  status: ActiveTileState['status'];
  speed: number;
  hitLineY: number;
  height: number;
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
  speed,
  hitLineY,
  height,
  songTime,
}: MovingTileProps) {
  const noteTime = tile.noteTime;
  const baseTop = hitLineY - height;

  const style = useAnimatedStyle(() => ({
    // Tile bottom reaches the hit line exactly when songTime === noteTime
    transform: [{ translateY: baseTop - (noteTime - songTime.value) * speed }],
  }));

  const isHold = tile.durationBeats > 0;

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
              ? { songTime, start: tile.noteTime, duration: tile.durationSeconds }
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
  songTime,
  getTileState,
}: TileFieldProps) {
  const speed = (pixelsPerBeat * bpm) / 60; // px per second

  return (
    <>
      {tiles.map((tile) => {
        const state = getTileState(tile.id) ?? DEFAULT_STATE;
        // Hit tiles disappear; skip mounting them at all
        if (state.status === 'hit' && (tile.durationBeats === 0 || state.holdProgress >= 1)) {
          return null;
        }
        const height =
          tile.durationBeats > 0 ? Math.max(tapHeight, tile.durationBeats * pixelsPerBeat) : tapHeight;
        return (
          <MovingTile
            key={tile.id}
            tile={tile}
            holdProgress={state.holdProgress}
            status={state.status}
            speed={speed}
            hitLineY={hitLineY}
            height={height}
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
  },
});
