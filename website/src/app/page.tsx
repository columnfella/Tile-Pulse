import { ClaudeBadge } from '@/components/ClaudeBadge';
import { Logo } from '@/components/Logo';
import { PixelIcon } from '@/components/PixelIcon';
import { TileRain } from '@/components/TileRain';
import { earlyTester, pillars, principles, site, testBuild } from '@/content/site';
import { gameVersion } from '@/content/gameVersion';
import styles from './page.module.css';

export default function Home() {
  const versionLabel = gameVersion ? `v${gameVersion}` : null;

  return (
    <>
      {earlyTester.open ? (
        <a href="#download" className={styles.fomoBar}>
          <span className={styles.fomoPulse} aria-hidden="true" />
          <span className={styles.fomoText}>{earlyTester.banner}</span>
          <span className={styles.fomoCta}>
            {earlyTester.bannerCta}
            <PixelIcon name="arrow" px={2} />
          </span>
        </a>
      ) : null}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a href="#top" className={styles.homeLink} aria-label={`${site.name} home`}>
            <Logo />
          </a>
          <nav aria-label="Sections" className={styles.nav}>
            <a href="#philosophy" className={styles.navSection}>
              Philosophy
            </a>
            <a href="#game" className={styles.navSection}>
              The game
            </a>
            <a href="#download" className={styles.navDownload}>
              Download
            </a>
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
            <span className={styles.badge}>
              {site.status}
              {versionLabel && <> · {versionLabel}</>}
            </span>
            <h1 className={styles.title}>
              Your music.
              <br />
              <span className={styles.coral}>Your charts.</span>
            </h1>
            <p className={styles.lead}>{site.tagline}</p>
            <p className={styles.intro}>{site.intro}</p>
            <div className={styles.actions}>
              <a href="#download" className={styles.primaryBtn}>
                {earlyTester.open ? 'Get the Early Tester badge' : 'Try the test build'}
              </a>
              <a href="#philosophy" className={styles.secondaryBtn}>
                Read the philosophy
              </a>
            </div>
            <p className={styles.platforms}>{site.platforms}</p>
            <ClaudeBadge />
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
                    <li key={point}>
                      <span className={styles.listIcon}>
                        <PixelIcon name="bullet" px={4} />
                      </span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {/* Download */}
        <section id="download" className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionKicker}>{'// Download'}</span>
            {testBuild.title}
          </h2>
          {earlyTester.open ? (
            <div className={styles.fomoCard}>
              <div className={styles.fomoBadge} aria-hidden="true">
                <PixelIcon name="star" px={5} className={styles.fomoStar} />
                <span>EARLY TESTER</span>
              </div>
              <div className={styles.fomoBody}>
                <p className={styles.fomoKicker}>LIMITED — ENDS AT LAUNCH</p>
                <h3 className={styles.fomoTitle}>{earlyTester.title}</h3>
                <p>{earlyTester.body}</p>
                <ul className={styles.fomoList}>
                  {earlyTester.points.map((p) => (
                    <li key={p}>
                      <span className={styles.listIcon}>
                        <PixelIcon name="star" px={2} />
                      </span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
          <div className={styles.download}>
            <div className={styles.downloadMain}>
              <p className={styles.sectionLead}>{testBuild.body}</p>
              <div className={styles.downloadMeta}>
                <span className={styles.metaTag}>Android</span>
                {versionLabel && <span className={styles.metaTag}>Version {versionLabel}</span>}
                <span className={styles.metaTag}>Test build</span>
              </div>
              <div className={styles.actions}>
                <a href={testBuild.pageUrl} target="_blank" rel="noreferrer" className={styles.primaryBtn}>
                  Download on Expo
                </a>
              </div>
              <div className={styles.disclaimer} role="note">
                <strong className={styles.disclaimerTitle}>Heads up: it might still be buggy</strong>
                <p>{testBuild.disclaimer}</p>
                <p>
                  Found a bug or have an idea?{' '}
                  <a href={`${site.github}/issues`} target="_blank" rel="noreferrer">
                    Report it on GitHub
                  </a>
                  .
                </p>
              </div>
            </div>
            <ol className={styles.steps}>
              {testBuild.steps.map((step, i) => (
                <li key={step}>
                  <span className={styles.stepNum}>{String(i + 1).padStart(2, '0')}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <Logo />
          {versionLabel && <p className={styles.faint}>Game version {versionLabel}</p>}
          <ClaudeBadge variant="card" />
          <p>Please only share audio you have the right to use.</p>
          <p className={styles.faint}>
            No license has been chosen yet — all rights reserved by the author.
          </p>
        </div>
      </footer>
    </>
  );
}
