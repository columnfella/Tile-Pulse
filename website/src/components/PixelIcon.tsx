/**
 * Tiny pixel-art icons drawn from bitmaps ('#' = filled pixel), like the
 * game's own icons. One SVG path per icon with crisp edges, coloured with
 * currentColor, so they match the pixel fonts instead of font glyphs (★ ■ →)
 * that render differently on every device and sit off-centre.
 */
const BITMAPS = {
  star: [
    '...#...',
    '..###..',
    '#######',
    '.#####.',
    '..###..',
    '.##.##.',
    '.#...#.',
  ],
  bullet: ['##', '##'],
  arrow: [
    '...#...',
    '....#..',
    '#######',
    '....#..',
    '...#...',
  ],
} as const;

export type PixelIconName = keyof typeof BITMAPS;

function pathOf(bitmap: readonly string[]) {
  let d = '';
  bitmap.forEach((row, y) => {
    let start = -1;
    for (let x = 0; x <= row.length; x++) {
      const on = row[x] === '#';
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        d += `M${start} ${y}h${x - start}v1h${start - x}z`;
        start = -1;
      }
    }
  });
  return d;
}

/** `px`: size of one art pixel in CSS px (keeps edges on whole pixels). */
export function PixelIcon({ name, px = 2, className }: { name: PixelIconName; px?: number; className?: string }) {
  const bitmap = BITMAPS[name];
  const w = bitmap[0].length;
  const h = bitmap.length;
  return (
    <svg
      className={className}
      width={w * px}
      height={h * px}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <path d={pathOf(bitmap)} fill="currentColor" />
    </svg>
  );
}
