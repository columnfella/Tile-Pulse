# TilePulse website

The project website: what TilePulse is and the ideas behind it. Built with
**Next.js 16** (App Router) and **React 19**, styled with plain CSS modules in the
game's pixel look (Press Start 2P + VT323, black / blue / coral).

It lives next to the game but is completely separate: its own `package.json` and
`node_modules`, and it's excluded from the Expo app's TypeScript and Metro config.

## Run it

```bash
cd website
npm install
npm run dev        # http://localhost:3000
```

```bash
npm run build      # production build (the page is static)
npm run start
npm run lint
```

## Where things are

```
src/
  app/
    layout.tsx       fonts, page title / description
    page.tsx         the home page (hero, philosophy, the game)
    globals.css      colours and base styles
  components/
    Logo.tsx         2×2 pixel mark + wordmark
    TileRain.tsx     decorative falling-tile board (CSS animation)
  content/
    site.ts          all the text — edit this to change the wording
```

## Deploying

The site is fully static, so any static host works. The simplest free option is
Vercel: import the GitHub repo and set the **Root Directory** to `website`.
