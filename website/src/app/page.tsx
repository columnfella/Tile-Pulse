import { Logo } from '@/components/Logo';
import { TileRain } from '@/components/TileRain';
import { pillars, principles, site } from '@/content/site';
import styles from './page.module.css';

export default function Home() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a href="#top" className={styles.homeLink} aria-label={`${site.name} home`}>
            <Logo />
          </a>
          <nav aria-label="Sections" className={styles.nav}>
            <a href="#philosophy">Philosophy</a>
            <a href="#game">The game</a>
            <a href={site.github} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <span className={styles.badge}>{site.status}</span>
            <h1 className={styles.title}>
              Your music.
              <br />
              <span className={styles.coral}>Your charts.</span>
            </h1>
            <p className={styles.lead}>{site.tagline}</p>
            <p className={styles.intro}>{site.intro}</p>
            <div className={styles.actions}>
              <a href="#philosophy" className={styles.primaryBtn}>
                Read the philosophy
              </a>
              <a href={site.github} target="_blank" rel="noreferrer" className={styles.secondaryBtn}>
                View on GitHub
              </a>
            </div>
            <p className={styles.platforms}>{site.platforms}</p>
          </div>
          <div className={styles.heroArt}>
            <TileRain />
          </div>
        </section>

        {/* Philosophy */}
        <section id="philosophy" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionKicker}>{'// Philosophy'}</span>
            Built around the people who play it
          </h2>
          <p className={styles.sectionLead}>
            Most rhythm games hand you a fixed song list and charts made by a studio. TilePulse turns that
            around: the players bring the songs, make the levels and decide what&rsquo;s good.
          </p>
          <ul className={styles.principles}>
            {principles.map((p) => (
              <li key={p.title} className={`${styles.principle} ${p.accent === 'coral' ? styles.edgeCoral : styles.edgeBlue}`}>
                <h3 className={styles.principleTitle}>{p.title}</h3>
                <p className={styles.principleBody}>{p.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* The game */}
        <section id="game" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionKicker}>{'// The game'}</span>
            Play, create, share
          </h2>
          <div className={styles.pillars}>
            {pillars.map((p) => (
              <article key={p.title} className={styles.pillar}>
                <span className={styles.pillarLabel}>{p.label}</span>
                <h3 className={styles.pillarTitle}>{p.title}</h3>
                <ul className={styles.pillarList}>
                  {p.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <Logo />
          <p>Please only share audio you have the right to use.</p>
          <p className={styles.faint}>
            No license has been chosen yet — all rights reserved by the author.
          </p>
        </div>
      </footer>
    </>
  );
}
