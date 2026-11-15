# 🎹 TilePulse

**A community-driven, piano-tiles-style rhythm game where *you* bring the music.**

Load any song from your phone, map it out in the built-in beatmap editor, and play it on a fast, four-lane tile board. No fixed song list, no paywalled tracks — every song and every chart comes from the players.

> Built with Expo + React Native. Runs on Android, iOS and in the browser.

---

## ✨ Features

### 🎵 Bring your own songs
- **From Storage** scans your phone for audio files — like a music app — after asking for permission.
- Tick the songs you want and add them all at once. Songs you already added are marked.
- Supports common formats: MP3, WAV, M4A, AAC, OGG, FLAC and more.

### 🛠️ Make your own beatmaps
- A strict, grid-based **beatmap editor** with 1/1, 1/2 and 1/4 snapping.
- **Tap** and **Hold** notes — holds can be stretched cell by cell.
- **Undo / redo**, and **autosave** — every change is saved on your device instantly.
- Set the song's **BPM** with a stepper or by typing it in.
- **Test** playback from any point: tap the beat ruler to choose where the preview starts.

### 🎮 Play
- Four lanes, multi-touch input (chords and holds while tapping other lanes).
- **PERFECT / GREAT / GOOD / MISS** timing judgments, combos, accuracy and an end-of-song rank (S+ to D).
- Smooth, audio-synced tile motion that runs on the UI thread.
- Loading screen and a 3 · 2 · 1 countdown before every song.
- Immersive full-screen that respects camera cutouts and notches.

---

## 🌍 Community driven

TilePulse is built around the idea that the best charts come from players:

- **Upload your songs** — your own music, covers, practice tracks.
- **Create beatmaps** for them and fine-tune the timing until it feels right.
- **Contribute** to the game itself — new mechanics, themes, editor tools and fixes are all welcome (see [Contributing](#-contributing)).

Planned community features are listed in the [Roadmap](#-roadmap).

> Please only add audio you have the right to use.

---

## 🚀 Getting started

### Requirements
- [Node.js](https://nodejs.org/) 20+
- The **Expo Go** app on your phone ([Android](https://play.google.com/store/apps/details?id=host.exp.exponent) / [iOS](https://apps.apple.com/app/expo-go/id982107779)), or a browser

### Run it

```bash
git clone https://github.com/columnfella/Tile-Pulse.git
cd Tile-Pulse
npm install
npx expo start
```

Then:
- **Phone:** scan the QR code with Expo Go (Android) or the Camera app (iOS). Your phone must be on the same Wi-Fi as your computer.
- **Browser:** press `w` in the terminal, or run `npx expo start --web`.

> **Tip:** Expo Go runs in development mode, which is slower than a real build. For a performance check use `npx expo start --no-dev --minify`.

### Full music-library scanning on Android

Expo Go isn't allowed to read the phone's music library on recent Android versions, so in Expo Go the **From Storage** button falls back to scanning a folder you choose (e.g. *Music* or *Download*). To scan the whole library automatically, use a development build:

```bash
npx expo run:android            # requires Android Studio
# or
npx eas build --profile development --platform android
```

---

## 🧭 How to make a beatmap

1. On the **Songs** tab, tap **From Storage** and add a song.
2. Open the **Editor** tab and pick the song.
3. Set the **BPM** so the grid lines match the beat.
4. Choose **Tap** or **Hold** and tap grid cells to place notes. Tap a note to select it; tap it again to delete it.
5. Tap the beat numbers on the left to set where **Test** starts, then press **Test** to hear it.
6. Hit **▶ Play** at the top to try your chart. Everything is saved automatically.

---

## 🗂️ Project structure

```
app/                     Screens (expo-router)
  (tabs)/index.tsx       Song library + import
  (tabs)/editor.tsx      Song picker + beatmap editor
  play/[id].tsx          Gameplay
src/
  components/game/       Board, tiles, judgments, countdown
  components/ui/         Shared UI: splash, audio library sheet, motion presets
  game/                  Timing engine (judgments, hold logic) + starter song
  services/              Audio engine, storage, file/library access
  audio/synth.ts         Offline synth for the built-in starter track
  constants/theme.ts     Visual theme (swap colors / sprites here)
```

### Tech stack
- **Expo SDK 58**, React Native, **expo-router**
- **react-native-reanimated** for UI-thread animation and tile motion
- **expo-audio** for playback, **expo-media-library** / **expo-file-system** for importing
- **AsyncStorage** for songs and beatmaps (stored locally on the device)

---

## 🤝 Contributing

Contributions of all sizes are welcome!

1. Fork the repo and create a branch: `git checkout -b feat/my-idea`
2. Make your changes and check types: `npm run lint`
3. Open a pull request describing what you changed and why.

Good first areas: new note types, editor tools (copy/paste, selection), themes in `src/constants/theme.ts`, and accessibility improvements. Bug reports and feature ideas are welcome as issues too.

---

## 🗺️ Roadmap

- [ ] Export / import beatmaps as files
- [ ] Share beatmaps with other players (online chart library)
- [ ] Per-song high scores and stats
- [ ] Adjustable scroll speed and audio offset calibration
- [ ] Custom themes and tile skins
- [ ] More note types (slides, double taps)

---

## 📄 License

No license has been chosen yet — until one is added, all rights are reserved by the author.
