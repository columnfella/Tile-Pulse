import styles from './Logo.module.css';

/** The 2×2 pixel mark and wordmark from the app's Songs tab. */
export function Logo() {
  return (
    <span className={styles.logo}>
      <span className={styles.mark} aria-hidden="true">
        <span style={{ background: '#2f6bff' }} />
        <span style={{ background: '#FF6B4A' }} />
        <span style={{ background: '#1a3d99' }} />
        <span style={{ background: '#2f6bff' }} />
      </span>
      <span className={styles.word}>
        TILE<span className={styles.accent}>PULSE</span>
      </span>
    </span>
  );
}
