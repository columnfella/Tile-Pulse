/**
 * Runs the swirl background off the main thread: the page hands over its
 * canvas (OffscreenCanvas) and this worker owns the WebGL context and the
 * animation loop. The GPU does the per-pixel work; the page's main thread
 * does nothing per frame, so scrolling and clicks are never slowed down.
 */
import { createSwirlRenderer, type SwirlRenderer } from './renderer';

type Message =
  | { type: 'init'; canvas: OffscreenCanvas; width: number; height: number; animate: boolean }
  | { type: 'resize'; width: number; height: number }
  | { type: 'visible'; visible: boolean };

let renderer: SwirlRenderer | null = null;
let animate = true;
let visible = true;
let running = false;
const start = performance.now();

// Workers have requestAnimationFrame in Chrome, Edge, Firefox and recent Safari; fall back to ~60 fps timers
const raf: (cb: () => void) => void =
  typeof self.requestAnimationFrame === 'function'
    ? (cb) => self.requestAnimationFrame(cb)
    : (cb) => setTimeout(cb, 16);

function frame() {
  if (!renderer || !animate || !visible) {
    running = false;
    return;
  }
  renderer.draw((performance.now() - start) / 1000);
  raf(frame);
}

function startLoop() {
  if (running || !animate || !visible) return;
  running = true;
  raf(frame);
}

self.onmessage = (e: MessageEvent<Message>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    renderer = createSwirlRenderer(msg.canvas);
    if (!renderer) {
      self.postMessage({ type: 'unsupported' });
      return;
    }
    animate = msg.animate;
    renderer.resize(msg.width, msg.height);
    renderer.draw(12); // first frame right away (also the still frame for reduced motion)
    self.postMessage({ type: 'ready' });
    startLoop();
  } else if (msg.type === 'resize' && renderer) {
    renderer.resize(msg.width, msg.height);
    renderer.draw(animate ? (performance.now() - start) / 1000 : 12);
  } else if (msg.type === 'visible') {
    visible = msg.visible;
    startLoop();
  }
};
