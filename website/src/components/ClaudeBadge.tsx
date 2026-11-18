import { builtWith } from '@/content/site';
import styles from './ClaudeBadge.module.css';

/**
 * "Built with Claude" credit. The spark is a pixel-art sparkle drawn for this
 * site in Claude's orange (not Anthropic's official logo file). To use the
 * official mark instead, follow Anthropic's brand guidelines.
 */
function Spark({ size }: { size: number }) {
  // 9×9 pixel grid: an eight-pointed spark
  const px = [
    [4, 0], [4, 1], [4, 2], [4, 3], [4, 5], [4, 6], [4, 7], [4, 8], // vertical ray
    [0, 4], [1, 4], [2, 4], [3, 4], [5, 4], [6, 4], [7, 4], [8, 4], // horizontal ray
    [1, 1], [2, 2], [3, 3], [5, 5], [6, 6], [7, 7], // diagonal ↘
    [7, 1], [6, 2], [5, 3], [3, 5], [2, 6], [1, 7], // diagonal ↙
    [4, 4], // centre
  ];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 9 9"
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={styles.spark}
    >
      {px.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={x === 4 && y === 4 ? '#f5c4ad' : '#d97757'} />
      ))}
    </svg>
  );
}

export function ClaudeBadge({ variant = 'pill' }: { variant?: 'pill' | 'card' }) {
  if (variant === 'card') {
    return (
      <a href={builtWith.url} target="_blank" rel="noreferrer" className={styles.card}>
        <Spark size={36} />
        <span className={styles.cardText}>
          <span className={styles.cardTitle}>Built with Claude</span>
          <span className={styles.cardBody}>{builtWith.note}</span>
        </span>
      </a>
    );
  }
  return (
    <a href={builtWith.url} target="_blank" rel="noreferrer" className={styles.pill}>
      <Spark size={18} />
      <span>
        Built with <strong className={styles.name}>Claude</strong>
      </span>
    </a>
  );
}
