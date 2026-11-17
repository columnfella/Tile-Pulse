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
  platforms: 'Android · iOS · Browser',
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
