/**
 * All the words on the site live here, so the text can be edited without
 * touching any layout code.
 */

export const site = {
  name: 'TilePulse',
  tagline: 'A community-driven rhythm game where you bring the music.',
  intro:
    'Load any song from your phone, map it in the built-in beatmap editor, and play it on a fast four-lane tile board. No fixed song list, no paywalled tracks: every song and every chart comes from the players.',
  status: 'Prototype — in active development',
  github: 'https://github.com/columnfella/Tile-Pulse',
  platforms: 'Android app (APK) · iPhone & any browser (web)',
};

/**
 * Early Tester badge campaign. While `open` is true, every account created in
 * the game gets a permanent Early Tester badge (server flag: admin console
 * "release off"). Set `open` to false on release, together with "release on".
 */
export const earlyTester = {
  open: true,
  banner: 'EARLY TESTER BADGE — ONLY UNTIL LAUNCH',
  bannerCta: 'Join now',
  title: 'Join now. Keep the badge forever.',
  body: 'Every account created before TilePulse officially launches gets the Early Tester badge on its profile — permanently. The day the game launches, sign-ups stop getting it — for good.',
  points: [
    'Shown on your profile, forever',
    'New accounts can’t get it once the game launches',
    'Get the Android app or play on iPhone, then create an account',
  ],
};

/** Credit for the AI the game and this site were built with. */
export const builtWith = {
  url: 'https://claude.com/claude-code',
  note: 'TilePulse — the game, its server and this website — was built with Claude Code, the AI coding assistant made by Anthropic.',
};

import latestBuild from './latest-build.json';

/**
 * The newest Android test build: a direct, public APK download hosted by Expo,
 * with its real file size. latest-build.json is kept up to date automatically
 * by .github/workflows/apk-build.yml (scripts/sync-apk-build.mjs) — never edit
 * the link by hand.
 */
export const apk = {
  url: latestBuild.apkUrl,
  /** "54.0 MB" — measured from the actual file */
  size: `${(latestBuild.sizeBytes / 1048576).toFixed(1)} MB`,
  version: latestBuild.appVersion,
};

export const testBuild = {
  title: 'Play the test build',
  body: 'TilePulse is ready for its first testers. Play some levels, make a chart, and enjoy it — then tell us what you think. Pick your phone below.',
  android: {
    title: 'On Android',
    body: 'The APK is the full app, and it installs on Android phones only. It updates itself whenever we fix something.',
  },
  disclaimer:
    'This is an early test version of a prototype. Expect bugs, rough edges and things that change or break between updates. Your levels, scores and account may be reset while the game is being tested.',
  steps: [
    'On your Android phone, tap Download APK (Android only).',
    'Open the file. If Android blocks it, allow installs from your browser.',
    'If Play Protect warns about an unknown app, choose Install anyway.',
    'The app updates itself — just reopen it to get the latest fixes.',
  ],
};

/**
 * iPhone (and any browser): the web version of the game, installable from
 * Safari with "Add to Home Screen". Same account and levels as the Android app.
 */
export const webApp = {
  url: 'https://tilepulse-play.vercel.app',
  host: 'tilepulse-play.vercel.app',
  title: 'On iPhone',
  body: 'There is no App Store version yet, so iPhone players play TilePulse in Safari. Add it to your Home Screen and it opens full screen with its own icon, just like an app — and your account, levels and scores are the same as on Android.',
  steps: [
    'Open tilepulse-play.vercel.app in Safari on your iPhone.',
    'Tap the Share button (the square with an arrow pointing up). On newer iOS it sits in the ••• menu next to the address bar.',
    'Scroll down and tap Add to Home Screen (it can be under Edit Actions or View More).',
    'Keep "Open as Web App" switched on if you see it, then tap Add.',
    'Open TilePulse from your Home Screen and sign in or create an account.',
  ],
  notes: [
    'Sound starts after your first tap: Safari only plays audio once you touch the screen.',
    'The web version is a little lighter than the Android app, and slides may feel less smooth on older iPhones.',
  ],
};

export type Principle = { title: string; body: string; accent: 'blue' | 'coral' };

/** The ideas the game is built on. */
export const principles: Principle[] = [
  {
    title: 'You bring the music',
    body: 'There is no catalogue to buy into. Any song on your phone can become a level: your own tracks, covers, practice pieces, the song stuck in your head.',
    accent: 'coral',
  },
  {
    title: 'Players make the charts',
    body: 'The best beatmaps come from people who love the song. The editor is a first-class part of the game, not an afterthought, so anyone can turn a track into a level.',
    accent: 'blue',
  },
  {
    title: 'No paywalls',
    body: 'No locked songs, no premium charts, no fixed list that decides what you can play. If you can hear it, you can play it.',
    accent: 'coral',
  },
  {
    title: 'The community decides',
    body: 'Levels are shared, liked, commented on and rated by the players who finish them. Difficulty is voted on and set by the community, not by a label.',
    accent: 'blue',
  },
  {
    title: 'Built in the open',
    body: 'New note types, themes, editor tools and fixes are all welcome. TilePulse grows with the people who play it.',
    accent: 'coral',
  },
  {
    title: 'Respect the music',
    body: 'Share only audio you have the right to use. Supporting artists is part of being a community that runs on music.',
    accent: 'blue',
  },
];

export type Pillar = { label: string; title: string; points: string[] };

/** What you do in the game, in three steps. */
export const pillars: Pillar[] = [
  {
    label: '01',
    title: 'Play',
    points: [
      'Four lanes with tap, hold and slide tiles',
      'PERFECT / GREAT / GOOD / MISS timing and an S+ to D rank',
      'Hardcore mode: one miss and the run is over',
    ],
  },
  {
    label: '02',
    title: 'Create',
    points: [
      'Grid editor with snapping, undo / redo and autosave',
      'Tap-along guides to find the rhythm by ear',
      'Your own cover picture, background and BPM',
    ],
  },
  {
    label: '03',
    title: 'Share',
    points: [
      'Upload levels to the community Discover tab',
      'Likes, comments and 1–8 star difficulty votes',
      'Profiles, friends and a global leaderboard',
    ],
  },
];
