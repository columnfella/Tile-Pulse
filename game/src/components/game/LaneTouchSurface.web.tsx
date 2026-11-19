/**
 * The touch area of the play board: web version (iPhone Safari, any browser).
 * The phone app uses LaneTouchSurface.tsx; this file only ships to the web.
 *
 * Reads browser pointer events straight from the DOM element:
 *  - every finger is tracked on its own (chords, hold one lane + tap another),
 *    unlike react-native-web's Pressable, which only follows one press at a
 *    time and dropped taps that overlapped a previous finger;
 *  - the press is handled on `pointerdown`, the earliest event a browser gives,
 *    without React's responder system in between;
 *  - `touch-action: none` and cancelled touchmove / gesture events stop Safari
 *    from treating fast taps as scrolls, zooms or long presses (which made it
 *    swallow some taps);
 *  - mouse clicks work too (desktop browsers).
 */
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import type { Lane, LaneTouchSurfaceProps } from './LaneTouchSurface';

export type { Lane, LaneTouchSurfaceProps } from './LaneTouchSurface';

export function LaneTouchSurface({ style, onPressStart, onPressEnd, onFingersChange, children }: LaneTouchSurfaceProps) {
  const ref = useRef<HTMLElement | null>(null);
  // Listeners are attached once; they always call the latest props
  const props = useRef({ onPressStart, onPressEnd, onFingersChange });
  props.current = { onPressStart, onPressEnd, onFingersChange };

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.addEventListener !== 'function') return;

    el.style.touchAction = 'none';
    (el.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = 'none';

    const lanes = new Map<number, Lane>(); // pointerId → lane
    const fingers = new Map<number, number>(); // pointerId → x in lanes (0 … 4)
    let rect = el.getBoundingClientRect();

    const lanesForX = (clientX: number) =>
      Math.max(0, Math.min(4, ((clientX - rect.left) / Math.max(1, rect.width)) * 4));
    const laneOf = (x: number) => Math.min(3, Math.floor(x)) as Lane;
    const emitFingers = () => props.current.onFingersChange?.([...fingers.values()]);
    const laneStillHeld = (lane: Lane) => [...lanes.values()].includes(lane);

    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (lanes.has(e.pointerId)) return;
      // Cheap, and keeps the lanes right after rotation / resizing / scrolling
      rect = el.getBoundingClientRect();
      try {
        el.setPointerCapture(e.pointerId); // keep receiving moves outside the board
      } catch {
        /* not supported: moves inside the board still work */
      }
      const x = lanesForX(e.clientX);
      const lane = laneOf(x);
      lanes.set(e.pointerId, lane);
      fingers.set(e.pointerId, x);
      props.current.onPressStart(lane, false, e.clientY - rect.top);
      emitFingers();
    };

    const move = (e: PointerEvent) => {
      const prev = lanes.get(e.pointerId);
      if (prev === undefined) return;
      const x = lanesForX(e.clientX);
      fingers.set(e.pointerId, x);
      const lane = laneOf(x);
      if (lane !== prev) {
        // Finger slid into another lane: release the old one, press the new one
        lanes.set(e.pointerId, lane);
        if (!laneStillHeld(prev)) props.current.onPressEnd(prev);
        props.current.onPressStart(lane, true, e.clientY - rect.top);
      }
      emitFingers();
    };

    const up = (e: PointerEvent) => {
      const lane = lanes.get(e.pointerId);
      if (lane === undefined) return;
      lanes.delete(e.pointerId);
      fingers.delete(e.pointerId);
      if (!laneStillHeld(lane)) props.current.onPressEnd(lane);
      emitFingers();
    };

    // Safari: no scrolling, rubber banding, pinch or magnifier on the board
    const block = (e: Event) => {
      if (e.cancelable) e.preventDefault();
    };
    const onResize = () => {
      rect = el.getBoundingClientRect();
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('touchmove', block, { passive: false });
    el.addEventListener('gesturestart', block, { passive: false });
    el.addEventListener('contextmenu', block);
    window.addEventListener('resize', onResize);

    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('lostpointercapture', up);
      el.removeEventListener('touchmove', block);
      el.removeEventListener('gesturestart', block);
      el.removeEventListener('contextmenu', block);
      window.removeEventListener('resize', onResize);
      // Release anything still pressed (e.g. leaving the screen mid-hold)
      for (const lane of new Set(lanes.values())) props.current.onPressEnd(lane);
      lanes.clear();
      fingers.clear();
    };
  }, []);

  return (
    // react-native-web: a View's ref is its DOM element
    <View ref={ref as unknown as React.Ref<React.ComponentRef<typeof View>>} style={style}>
      {children}
    </View>
  );
}
