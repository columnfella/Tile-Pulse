'use client';

import { useEffect, useRef } from 'react';
import { bufferSize, createSwirlRenderer } from './renderer';
import styles from './SwirlBackground.module.css';

/**
 * Full-page animated background: the game's blue spiral shader.
 *
 * - The shader runs on the GPU (WebGL).
 * - Where supported, the canvas is transferred to a Web Worker
 *   (OffscreenCanvas), so the animation loop doesn't use the main thread at all.
 *   Otherwise it falls back to a requestAnimationFrame loop on the page.
 * - Pauses while the tab is hidden; shows a still frame for people who prefer
 *   reduced motion; without WebGL the plain dark background stays.
 */
export function SwirlBackground() {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    // A canvas can be handed to a worker only once, so each run of this effect
    // makes its own (React runs effects twice in development)
    const canvas = document.createElement('canvas');
    canvas.className = styles.canvas;
    wrap.prepend(canvas);

    const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const size = () => bufferSize(window.innerWidth, window.innerHeight);
    const show = () => canvas.classList.add(styles.ready);
    const cleanups: (() => void)[] = [() => canvas.remove()];

    if (typeof canvas.transferControlToOffscreen === 'function' && typeof Worker !== 'undefined') {
      // ---- Off the main thread: a worker owns the canvas and the loop ----
      const worker = new Worker(new URL('./swirl.worker.ts', import.meta.url), { type: 'module' });
      const offscreen = canvas.transferControlToOffscreen();
      worker.onmessage = (e: MessageEvent<{ type: string }>) => {
        if (e.data.type === 'ready') show();
      };
      worker.postMessage({ type: 'init', canvas: offscreen, ...size(), animate }, [offscreen]);

      const onResize = () => worker.postMessage({ type: 'resize', ...size() });
      const onVisibility = () => worker.postMessage({ type: 'visible', visible: !document.hidden });
      window.addEventListener('resize', onResize);
      document.addEventListener('visibilitychange', onVisibility);
      cleanups.push(() => {
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVisibility);
        worker.terminate();
      });
    } else {
      // ---- Fallback: WebGL on the main thread (the GPU still does the work) ----
      const renderer = createSwirlRenderer(canvas);
      if (renderer) {
        const start = performance.now();
        let raf = 0;
        const resize = () => {
          const s = size();
          renderer.resize(s.width, s.height);
          renderer.draw(animate ? (performance.now() - start) / 1000 : 12);
        };
        const loop = () => {
          renderer.draw((performance.now() - start) / 1000);
          raf = requestAnimationFrame(loop);
        };
        const onVisibility = () => {
          cancelAnimationFrame(raf);
          if (!document.hidden && animate) raf = requestAnimationFrame(loop);
        };
        resize();
        show();
        if (animate) raf = requestAnimationFrame(loop);
        window.addEventListener('resize', resize);
        document.addEventListener('visibilitychange', onVisibility);
        cleanups.push(() => {
          cancelAnimationFrame(raf);
          window.removeEventListener('resize', resize);
          document.removeEventListener('visibilitychange', onVisibility);
        });
      }
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return (
    <div ref={wrapRef} className={styles.wrap} aria-hidden="true">
      <div className={styles.shade} />
    </div>
  );
}
