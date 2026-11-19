/**
 * The touch area of the play board (phone app: Android / iOS).
 *
 * React Native's responder system only lets one Pressable be touched at a
 * time, which breaks chords and holding one lane while tapping another. So we
 * read raw multi-touch events and map each finger to a lane.
 *
 * The web version has its own implementation in LaneTouchSurface.web.tsx
 * (browser pointer events), so changes there never affect the app.
 */
import React, { useRef } from 'react';
import { View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';

export type Lane = 0 | 1 | 2 | 3;

export interface LaneTouchSurfaceProps {
  style?: StyleProp<ViewStyle>;
  /** `glide`: the finger slid into this lane. `y`: px from the top of the board. */
  onPressStart: (lane: Lane, glide: boolean, y?: number) => void;
  onPressEnd: (lane: Lane) => void;
  /** Horizontal position of every finger, in lanes (0 = left edge, 4 = right edge). */
  onFingersChange?: (fingers: number[]) => void;
  children?: React.ReactNode;
}

export function LaneTouchSurface({ style, onPressStart, onPressEnd, onFingersChange, children }: LaneTouchSurfaceProps) {
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const frame = useRef({ x: 0, y: 0, width: 1 });
  const touchLanes = useRef(new Map<string, Lane>());
  const fingerX = useRef(new Map<string, number>());
  const emitFingers = () => onFingersChange?.([...fingerX.current.values()]);

  const handleLayout = () => {
    ref.current?.measureInWindow((x, y, width) => {
      if (width > 0) frame.current = { x, y, width };
    });
  };

  /** pageX → position in lanes (0 … 4). */
  const lanesForPageX = (pageX: number) => {
    const { x, width } = frame.current;
    return Math.max(0, Math.min(4, ((pageX - x) / width) * 4));
  };
  const laneForX = (pageX: number): Lane => Math.min(3, Math.floor(lanesForPageX(pageX))) as Lane;

  const handleTouchStart = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      const id = String(t.identifier);
      if (touchLanes.current.has(id)) continue;
      const lane = laneForX(t.pageX);
      touchLanes.current.set(id, lane);
      fingerX.current.set(id, lanesForPageX(t.pageX));
      onPressStart(lane, false, t.pageY - frame.current.y);
    }
    emitFingers();
  };

  const handleTouchMove = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      const id = String(t.identifier);
      const prev = touchLanes.current.get(id);
      if (prev === undefined) continue;
      fingerX.current.set(id, lanesForPageX(t.pageX));
      const lane = laneForX(t.pageX);
      if (lane !== prev) {
        // Finger slid into another lane: release the old one, press the new one
        touchLanes.current.set(id, lane);
        if (![...touchLanes.current.values()].includes(prev)) onPressEnd(prev);
        onPressStart(lane, true, t.pageY - frame.current.y);
      }
    }
    emitFingers();
  };

  const handleTouchEnd = (e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) {
      const id = String(t.identifier);
      const lane = touchLanes.current.get(id);
      if (lane === undefined) continue;
      touchLanes.current.delete(id);
      fingerX.current.delete(id);
      // Only release if no other finger is still on this lane
      if (![...touchLanes.current.values()].includes(lane)) onPressEnd(lane);
    }
    emitFingers();
  };

  return (
    <View
      ref={ref}
      onLayout={handleLayout}
      style={style}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {children}
    </View>
  );
}
