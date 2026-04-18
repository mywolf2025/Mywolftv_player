# MyWolf TV Player

Premium IPTV web player for **mywolftv.com** subscriptions.

A browser-based IPTV player inspired by IBO Pro Player, built with vanilla HTML/CSS/JS. No framework, no build step — just open `index.html` and go.

## Features

- **Xtream Codes login** (host + username + password) — full Live TV, Movies (VOD), and Series support
- **M3U URL playlists** — load any standard M3U/M3U8 playlist
- **Live TV / Movies / Series / Favorites / Search** sidebar navigation
- **Category browser** with item counts
- **HLS playback** via hls.js (with native Safari fallback)
- **EPG (TV Guide)** for live channels (short EPG via Xtream API)
- **Favorites** stored per playlist in LocalStorage
- **Global search** across all content types
- **Multiple saved playlists** — switch between providers
- **Dark, modern UI** with MyWolf TV branding (purple / cyan gradient wolf logo)
- **Responsive** — works on desktop, tablet, and mobile browsers

## Quick start

Because the player is 100% static, you can:

```bash
# From the repo root, start any static server:
python3 -m http.server 8080
# or
npx serve .
```

Then open http://localhost:8080 in your browser.

For production, host the files on any static host (Nginx, GitHub Pages, Cloudflare Pages, Netlify, Vercel, or your own mywolftv.com subdomain).

## File layout

```
.
├── index.html          # Login / playlist chooser
├── player.html         # Main player app
├── css/
│   ├── style.css       # Shared styles (login, toasts, brand)
│   └── player.css      # App layout, cards, player modal
├── js/
│   ├── storage.js      # LocalStorage helpers (playlists, favorites, settings)
│   ├── xtream.js       # Xtream Codes API client
│   ├── m3u.js          # M3U parser
│   ├── player.js       # Video player wrapper (HLS + native)
│   ├── login.js        # Login screen logic
│   └── app.js          # Main app logic (views, data, rendering)
└── assets/
    └── logo.svg        # MyWolf TV wolf logo
```

## How it works

1. User enters Xtream credentials or an M3U URL on `index.html`.
2. Credentials are validated and stored in LocalStorage.
3. The app redirects to `player.html`, which:
   - Loads categories and items from the Xtream API (or parses the M3U)
   - Renders a sidebar nav, category list, and items grid
   - Plays streams in a modal player (HLS via hls.js, MP4 natively)

## Notes

- **CORS**: Xtream servers usually allow browser CORS. If your server doesn't, you'll need a small proxy on your backend. Most commercial IPTV panels allow web player access.
- **Security**: Credentials are stored only in the browser's LocalStorage. Never commit real credentials to a public repo.
- **EPG**: Short EPG uses the Xtream API. Full XMLTV EPG import for M3U is not included in this release.

## Branding

The logo (`assets/logo.svg`) is a purple→cyan gradient wolf mask. You can replace it with your own artwork, or recolor via the CSS variables in `css/style.css`:

```css
--primary: #7c5cff;   /* purple */
--primary-2: #22d3ee; /* cyan */
--accent: #ff4d7a;    /* pink (favorites) */
```

---

MyWolf TV © 2026 · [mywolftv.com](https://mywolftv.com)
