import styles from './Logo.module.css';

/** The 2×2 pixel mark and wordmark from the app's Songs tab. */
export function Logo() {
  return (
    <span className={styles.logo}>
      <span className={styles.mark} aria-hidden="true">
        <span style={{ background: 'var(--primary)' }} />
        <span style={{ background: 'var(--highlight)' }} />
        <span style={{ background: 'var(--secondary)' }} />
        <span style={{ background: 'var(--primary)' }} />
      </span>
      <span className={styles.word}>
        TILE<span className={styles.accent}>PULSE</span>
      </span>
    </span>
  );
}
