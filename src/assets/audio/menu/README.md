# Menu music

Drop audio files here (`.mp3`, `.m4a`, `.aac` or `.wav`) — as many as you like.
The app picks them all up automatically and plays them in random order on the
menus (every track once before any repeats, never the same track twice in a
row), with the volume easing out at the end of each track and back in at the
start of the next.

- The file name is shown as the title in Settings: `Neon Skies - Artist.mp3`
  shows as "Neon Skies - Artist".
- Every file is bundled into the app and its updates, so keep them reasonably
  small (a 3-minute MP3 at 128 kbps is about 3 MB). Many big files make the
  download slower for everyone.
- Only add music you're allowed to use.

## Credits (shown in a pop-up when the song starts)

Put a `.json` file with the **same name** next to the song:
`Jonny Easton - Purpose.mp3` + `Jonny Easton - Purpose.json`

```json
{
  "song": "Purpose",
  "composer": "Jonny Easton",
  "website": "https://www.youtube.com/jonnyeaston",
  "license": "Creative Commons (BY-NC 3.0)",
  "licenseUrl": "https://creativecommons.org/licenses/by-nc/3.0/",
  "poweredBy": "Music powered by BreakingCopyright",
  "poweredByUrl": "https://breakingcopyright.com"
}
```

Only `song` is required; leave out what the licence doesn't ask for. The
pop-up slides in at the top whenever the song starts (tap it to open the
website), and the full credit is also listed in Settings while it plays.

After adding or removing files: commit and push, and the installed app gets
the new playlist with the next update. In development, restart Expo with
`npx expo start -c` so Metro sees the new files.
