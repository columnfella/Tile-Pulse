import styles from './TileRain.module.css';

/**
 * Decorative four-lane board with tiles falling, like the game. Pure CSS
 * animation (no JavaScript), hidden from screen readers, and frozen for people
 * who prefer reduced motion.
 */
const TILES: { lane: number; delay: number; tall?: boolean }[] = [
  { lane: 0, delay: 0 },
  { lane: 2, delay: 0.6 },
  { lane: 1, delay: 1.2, tall: true },
  { lane: 3, delay: 1.8 },
  { lane: 0, delay: 2.4 },
  { lane: 2, delay: 3.0, tall: true },
  { lane: 3, delay: 3.6 },
  { lane: 1, delay: 4.2 },
];

export function TileRain() {
  return (
    <div className={styles.board} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className={styles.divider} style={{ left: `${(i + 1) * 25}%` }} />
      ))}
      {TILES.map((t, i) => (
        <span
          key={i}
          className={`${styles.tile} ${t.tall ? styles.hold : ''}`}
          style={{ left: `${t.lane * 25}%`, animationDelay: `${t.delay}s` }}
        />
      ))}
      <span className={styles.hitGlow} />
    </div>
  );
}
