#!/usr/bin/env node
/**
 * Draws the TilePulse app icons from one 16×16 pixel design (the same as the
 * website's tab icon): four lanes with bevelled tiles falling onto a coral hit
 * line, on the app's dark navy.
 *
 *   node scripts/generate-app-icons.js
 *
 * Writes (no image libraries needed, plain PNG encoding):
 *   src/assets/images/icon.png              1024×1024, full icon (iOS, web, fallback)
 *   src/assets/images/adaptive-icon.png     1024×1024, Android foreground (transparent,
 *                                           design inside the safe zone; background colour in app.json)
 *   src/assets/images/adaptive-mono.png     1024×1024, Android 13+ themed icon (white silhouette)
 *   src/assets/images/icon-ios.png          1024×1024, iOS App Store icon (RGB: Apple rejects icons
 *                                           with an alpha channel; used by scripts/enable-ios.js)
 *   public/apple-touch-icon.png             180×180, iPhone home screen (web version)
 *   public/icon-192.png, public/icon-512.png             web app icons
 *   public/icon-maskable-512.png            Android can crop it to any shape (design in the safe zone)
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'src', 'assets', 'images');
const BG = '#05070d';

// [x, y, w, h, colour] on a 16×16 grid, drawn in order
const HIT_LINE = '#8e3e2f'; // coral at 55% over the background
const BLUE = { face: '#2f6bff', light: '#7aa4ff', dark: '#123a9e' };
const CORAL = { face: '#ff6b4a', light: '#ffa58f', dark: '#a83a22' };
const tile = (x, y, c) => [
  [x, y, 4, 5, c.face],
  [x, y, 4, 1, c.light],
  [x, y, 1, 5, c.light],
  [x + 3, y + 1, 1, 4, c.dark],
  [x + 1, y + 4, 3, 1, c.dark],
];
const DESIGN = [
  [0, 14, 16, 1, HIT_LINE],
  ...tile(4, 1, BLUE),
  ...tile(0, 7, BLUE),
  ...tile(8, 4, BLUE),
  ...tile(12, 9, CORAL),
];

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** RGBA canvas → PNG bytes. `rgb`: drop the alpha channel (opaque images only). */
function png(size, pixels, rgb = false) {
  const ch = rgb ? 3 : 4;
  const raw = Buffer.alloc((size * ch + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * ch + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * (size * ch + 1) + 1 + x * ch;
      raw[dst] = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      if (!rgb) raw[dst + 3] = pixels[src + 3];
    }
  }
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = rgb ? 2 : 6; // RGB or RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Draws the design. `cell` px per grid square, `offset` px from the top-left;
 * `background` fills the canvas first (null = transparent); `mono` paints
 * every shape white (themed icon).
 */
function draw({ size, cell, offset, background, mono = false, rgb = false }) {
  const px = Buffer.alloc(size * size * 4);
  const fill = (x0, y0, w, h, rgba) => {
    for (let y = Math.max(0, y0); y < Math.min(size, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(size, x0 + w); x++) px.set(rgba, (y * size + x) * 4);
    }
  };
  if (background) fill(0, 0, size, size, [...hex(background), 255]);
  for (const [x, y, w, h, color] of DESIGN) {
    const rgba = mono ? [255, 255, 255, 255] : [...hex(color), 255];
    fill(offset + x * cell, offset + y * cell, w * cell, h * cell, rgba);
  }
  return png(size, px, rgb);
}

fs.mkdirSync(OUT, { recursive: true });
// Full icon: the design fills the square (64 px per grid square)
fs.writeFileSync(path.join(OUT, 'icon.png'), draw({ size: 1024, cell: 64, offset: 0, background: BG }));
// Android adaptive: launchers crop to a circle / squircle and only the middle
// ~61% is always visible, so the design is 608 px (38 per square) centred.
// A dark plate behind it keeps the lanes readable on any launcher shape.
const adaptive = { size: 1024, cell: 38, offset: (1024 - 16 * 38) / 2 };
fs.writeFileSync(path.join(OUT, 'adaptive-icon.png'), draw({ ...adaptive, background: null }));
fs.writeFileSync(path.join(OUT, 'adaptive-mono.png'), draw({ ...adaptive, background: null, mono: true }));
// iOS App Store icon: same art, no alpha channel
fs.writeFileSync(path.join(OUT, 'icon-ios.png'), draw({ size: 1024, cell: 64, offset: 0, background: BG, rgb: true }));

// Web version (public/ is copied as-is into the web build)
const PUB = path.join(__dirname, '..', 'public');
fs.mkdirSync(PUB, { recursive: true });
// Full-bleed icons: 16-pixel design scaled by whole pixels, centred (sizes not divisible by 16 get a navy border)
const full = (size) => {
  const cell = Math.floor(size / 16);
  return draw({ size, cell, offset: Math.floor((size - cell * 16) / 2), background: BG, rgb: true });
};
fs.writeFileSync(path.join(PUB, 'apple-touch-icon.png'), full(180));
fs.writeFileSync(path.join(PUB, 'icon-192.png'), full(192));
fs.writeFileSync(path.join(PUB, 'icon-512.png'), full(512));
// Maskable: design in the central safe zone (~60 %), navy all around
fs.writeFileSync(path.join(PUB, 'icon-maskable-512.png'), draw({ size: 512, cell: 19, offset: (512 - 19 * 16) / 2, background: BG, rgb: true }));
console.log(`Icons written to ${path.relative(process.cwd(), OUT)} and ${path.relative(process.cwd(), PUB)}`);
