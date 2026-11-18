import React, { memo, useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * Tiny pixel-art icons drawn from bitmaps ('#' = filled pixel).
 * The whole icon is ONE filled SVG path (one rect per horizontal run), so
 * there are no hairline seams between rows on screens whose pixel ratio
 * isn't a whole number (separate Views per row showed thin gaps).
 */
const BITMAPS = {
  home: [
    '....#....',
    '...###...',
    '..#####..',
    '.#######.',
    '#########',
    '.##...##.',
    '.##.#.##.',
    '.##.#.##.',
    '.#######.',
  ],
  discover: [
    '.####....',
    '#....#...',
    '#.##.#...',
    '#.#..#...',
    '#....#...',
    '.#####...',
    '.....##..',
    '......##.',
    '.......##',
  ],
  editor: [
    '......##.',
    '.....####',
    '....####.',
    '...####..',
    '..####...',
    '.####....',
    '.###.....',
    '##.......',
    '#........',
  ],
  palette: [
    '..#####..',
    '.#.....#.',
    '#.#..#..#',
    '#.......#',
    '#.#.....#',
    '#....##.#',
    '.#..#..#.',
    '..##...#.',
    '....###..',
  ],
  // 7×7 icons for small UI (14px = 2px cells, 21px = 3px cells)
  storage: [
    '######.',
    '#.##..#',
    '#.##..#',
    '#######',
    '#.....#',
    '#.....#',
    '#######',
  ],
  check: [
    '......#',
    '.....##',
    '#...##.',
    '##.##..',
    '.###...',
    '..#....',
    '.......',
  ],
  pencil: [
    '.....##',
    '....###',
    '...###.',
    '..###..',
    '.###...',
    '###....',
    '##.....',
  ],
  trash: [
    '..###..',
    '#######',
    '.#####.',
    '.#.#.#.',
    '.#.#.#.',
    '.#.#.#.',
    '.#####.',
  ],
  clock: [
    '.#####.',
    '#..#..#',
    '#..#..#',
    '#..##.#',
    '#.....#',
    '#.....#',
    '.#####.',
  ],
  note: [
    '..#####',
    '..#...#',
    '..#...#',
    '..#...#',
    '###.###',
    '###.###',
    '.......',
  ],
  play: [
    '#......',
    '###....',
    '#####..',
    '#######',
    '#####..',
    '###....',
    '#......',
  ],
  pause: [
    '.##.##.',
    '.##.##.',
    '.##.##.',
    '.##.##.',
    '.##.##.',
    '.##.##.',
    '.##.##.',
  ],
  plus: [
    '...#...',
    '...#...',
    '...#...',
    '#######',
    '...#...',
    '...#...',
    '...#...',
  ],
  minus: [
    '.......',
    '.......',
    '.......',
    '#######',
    '.......',
    '.......',
    '.......',
  ],
  undo: [
    '..#....',
    '.##....',
    '######.',
    '.##...#',
    '..#...#',
    '.....#.',
    '..###..',
  ],
  redo: [
    '....#..',
    '....##.',
    '.######',
    '#...##.',
    '#...#..',
    '.#.....',
    '..###..',
  ],
  reset: [
    '..###.#',
    '.#...##',
    '#...###',
    '#......',
    '#.....#',
    '.#...#.',
    '..###..',
  ],
  chevronLeft: [
    '....##.',
    '...##..',
    '..##...',
    '.##....',
    '..##...',
    '...##..',
    '....##.',
  ],
  chevronRight: [
    '.##....',
    '..##...',
    '...##..',
    '....##.',
    '...##..',
    '..##...',
    '.##....',
  ],
  chevronDown: [
    '.......',
    '#.....#',
    '##...##',
    '.##.##.',
    '..###..',
    '...#...',
    '.......',
  ],
  chevronUp: [
    '.......',
    '...#...',
    '..###..',
    '.##.##.',
    '##...##',
    '#.....#',
    '.......',
  ],
  person: [
    '..###..',
    '..###..',
    '..###..',
    '.......',
    '.#####.',
    '#######',
    '#######',
  ],
  mic: [
    '..###..',
    '..###..',
    '..###..',
    '#.###.#',
    '.#####.',
    '...#...',
    '..###..',
  ],
  globe: [
    '.#####.',
    '#.#.#.#',
    '#######',
    '#.#.#.#',
    '#######',
    '#.#.#.#',
    '.#####.',
  ],
  shield: [
    '#######',
    '#.....#',
    '#....##',
    '##..#.#',
    '.###..#',
    '..#..#.',
    '...##..',
  ],
  gear: [
    '.#.#.#.',
    '#######',
    '.##.##.',
    '###.###',
    '.##.##.',
    '#######',
    '.#.#.#.',
  ],
  folder: [
    '###....',
    '#..###.',
    '#######',
    '#.....#',
    '#.....#',
    '#.....#',
    '#######',
  ],
  close: [
    '#.....#',
    '.#...#.',
    '..#.#..',
    '...#...',
    '..#.#..',
    '.#...#.',
    '#.....#',
  ],
  filter: [
    '#######',
    '.#####.',
    '..###..',
    '..###..',
    '...#...',
    '...#...',
    '...##..',
  ],
  download: [
    '...#...',
    '...#...',
    '.#.#.#.',
    '..###..',
    '...#...',
    '#.....#',
    '#######',
  ],
  upload: [
    '...#...',
    '..###..',
    '.#.#.#.',
    '...#...',
    '...#...',
    '#.....#',
    '#######',
  ],
  image: [
    '#######',
    '#.....#',
    '#.##..#',
    '#.....#',
    '#..#..#',
    '#.###.#',
    '#######',
  ],
  arrowUpLeft: [
    '#####..',
    '##.....',
    '#.#....',
    '#..#...',
    '#...#..',
    '.....#.',
    '......#',
  ],
  arrowUpRight: [
    '..#####',
    '.....##',
    '....#.#',
    '...#..#',
    '..#...#',
    '.#.....',
    '#......',
  ],
  star: [
    '...#...',
    '..###..',
    '#######',
    '.#####.',
    '..###..',
    '.##.##.',
    '.#...#.',
  ],
  heart: [
    '.##.##.',
    '#######',
    '#######',
    '#######',
    '.#####.',
    '..###..',
    '...#...',
  ],
  heartOutline: [
    '.##.##.',
    '#..#..#',
    '#.....#',
    '#.....#',
    '.#...#.',
    '..#.#..',
    '...#...',
  ],
  comment: [
    '#######',
    '#.....#',
    '#.###.#',
    '#.....#',
    '#######',
    '.##....',
    '.#.....',
  ],
  lock: [
    '..###..',
    '.#...#.',
    '.#...#.',
    '#######',
    '###.###',
    '###.###',
    '#######',
  ],
  copy: [
    '####...',
    '#..#...',
    '#.#####',
    '#.#...#',
    '###...#',
    '..#...#',
    '..#####',
  ],
  thumbUp: [
    '...##..',
    '..###..',
    '..##...',
    '######.',
    '######.',
    '######.',
    '#####..',
  ],
  thumbDown: [
    '#####..',
    '######.',
    '######.',
    '######.',
    '..##...',
    '..###..',
    '...##..',
  ],
  friends: [
    '.##..##',
    '####.##',
    '####...',
    '.##.##.',
    '..#####',
    '######.',
    '######.',
  ],
  trophy: [
    '#######',
    '#.###.#',
    '#.###.#',
    '.#####.',
    '..###..',
    '...#...',
    '..###..',
  ],
  userPlus: [
    '.##....',
    '####.#.',
    '#######',
    '.##..#.',
    '#####..',
    '######.',
    '######.',
  ],
  skull: [
    '.#####.',
    '#######',
    '#..#..#',
    '#######',
    '.##.##.',
    '..###..',
    '..#.#..',
  ],
  crown: [
    '#..#..#',
    '##.#.##',
    '#######',
    '#######',
    '#.#.#.#',
    '#######',
    '.......',
  ],
  bell: [
    '...#...',
    '.#####.',
    '.#####.',
    '.#####.',
    '#######',
    '.......',
    '...#...',
  ],
  // Developer badge: a terminal window with a ">_" prompt
  terminal: [
    '#########',
    '#.......#',
    '#.#.....#',
    '#..#....#',
    '#...#...#',
    '#..#....#',
    '#.#..####',
    '#.......#',
    '#########',
  ],
  // Moderator badge: a solid shield with a check mark cut out
  modShield: [
    '#########',
    '#######.#',
    '######.##',
    '#.###.###',
    '##.#.####',
    '.##.####.',
    '..#####..',
    '...###...',
    '....#....',
  ],
  bug: [
    '#.....#',
    '.#####.',
    '###.###',
    '.#####.',
    '###.###',
    '.#####.',
    '#.....#',
  ],
  warning: [
    '...#...',
    '..###..',
    '..#.#..',
    '.##.##.',
    '.#####.',
    '###.###',
    '#######',
  ],
} as const;

export type PixelIconName = keyof typeof BITMAPS;

interface PixelIconProps {
  name: PixelIconName;
  /** Total icon size in px (rounded down to a whole number of pixels per cell). */
  size?: number;
  color: string;
  /**
   * Trim the bitmap's empty edges and centre the drawing in a size×size box.
   * Icons are drawn on different grids (7×7, 9×9) and some leave a blank row,
   * so without this they sit slightly off-centre next to each other (badges).
   */
  fit?: boolean;
}

export const PixelIcon = memo(function PixelIcon({ name, size = 22, color, fit = false }: PixelIconProps) {
  const full = BITMAPS[name] as readonly string[];
  // fit: crop to the filled pixels' bounding box
  const bitmap = useMemo(() => {
    if (!fit) return full;
    const rows = full.map((r, y) => ({ r, y })).filter(({ r }) => r.includes('#'));
    if (!rows.length) return full;
    const top = rows[0].y;
    const bottom = rows[rows.length - 1].y;
    let left = Infinity;
    let right = -1;
    for (const r of full) {
      const a = r.indexOf('#');
      if (a >= 0) {
        left = Math.min(left, a);
        right = Math.max(right, r.lastIndexOf('#'));
      }
    }
    return full.slice(top, bottom + 1).map((r) => r.slice(left, right + 1));
  }, [full, fit]);
  const cols = bitmap[0].length;
  const rowCount = bitmap.length;
  // whole pixels keep edges crisp; in fit mode the larger side decides
  const cell = Math.max(1, Math.floor(size / (fit ? Math.max(cols, rowCount) : cols)));
  const dim = cell * cols;

  // Path in bitmap cells (viewBox), scaled up by the SVG
  const d = useMemo(() => {
    let out = '';
    bitmap.forEach((row, y) => {
      let start = -1;
      for (let x = 0; x <= row.length; x++) {
        const on = row[x] === '#';
        if (on && start < 0) start = x;
        if (!on && start >= 0) {
          out += `M${start} ${y}h${x - start}v1h${start - x}z`;
          start = -1;
        }
      }
    });
    return out;
  }, [bitmap]);

  const svg = (
    <Svg width={dim} height={cell * rowCount} viewBox={`0 0 ${cols} ${rowCount}`}>
      <Path d={d} fill={color} />
    </Svg>
  );
  if (!fit) return svg;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>{svg}</View>
  );
});
