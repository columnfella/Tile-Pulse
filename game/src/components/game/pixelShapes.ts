/**
 * Pixel-art circles, arcs and rings for the hold / slide effects, built as ONE
 * SVG path of square cells (one rect per horizontal run, like PixelIcon). The
 * same path string works for react-native-svg and for Skia, and draws with a
 * plain solid fill: no gradients or new shaders, so Skia never has to compile
 * a new GPU program mid-song (that caused a ~1 s freeze on slides).
 */

/** Size of one art pixel for these effects (thinner than the 4 px tile bevel). */
export const FX_CELL = 3;

const cache = new Map<string, string>();

/**
 * Cells whose centre lies between `radius - thickness` and `radius` from (0, 0).
 * `thickness` omitted = a filled disc. `half` = only the top half (an arc).
 * Coordinates are centred on (0, 0); the shape spans ±n·cell where
 * n = ceil(radius / cell) (see pixelExtent).
 */
export function pixelCirclePath(radius: number, thickness?: number, half = false, cell = FX_CELL): string {
  const key = `${radius}|${thickness ?? 'disc'}|${half ? 1 : 0}|${cell}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const n = Math.max(1, Math.ceil(radius / cell));
  const inner = thickness === undefined ? -1 : radius - thickness;
  let d = '';
  for (let gy = -n; gy < (half ? 0 : n); gy++) {
    const cy = (gy + 0.5) * cell;
    let start: number | null = null;
    for (let gx = -n; gx <= n; gx++) {
      const cx = (gx + 0.5) * cell;
      const r = Math.hypot(cx, cy);
      const on = gx < n && r <= radius && r >= inner;
      if (on && start === null) start = gx;
      if (!on && start !== null) {
        d += `M${start * cell} ${gy * cell}h${(gx - start) * cell}v${cell}h${(start - gx) * cell}z`;
        start = null;
      }
    }
  }
  if (cache.size > 200) cache.clear();
  cache.set(key, d);
  return d;
}

/** Half-size of a pixelCirclePath's bounding box (it spans -e … +e). */
export const pixelExtent = (radius: number, cell = FX_CELL) => Math.max(1, Math.ceil(radius / cell)) * cell;
