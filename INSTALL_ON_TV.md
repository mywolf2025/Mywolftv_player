# Install MyWolf TV Player on Fire TV / Android TV

This guide walks you through installing the APK onto any Fire TV Stick, Fire TV Cube, Chromecast with Google TV, Nvidia Shield, or Android TV box using the **Downloader by AFTVnews** app.

## Step 1 — Allow sideloading

Only needed once per device.

**Fire TV:**
1. Go to **Settings → My Fire TV → Developer Options** (on older firmware: **Device**)
2. Turn on **Install unknown apps** → enable **Downloader**
3. (If available) enable **ADB Debugging** — optional

**Android TV / Google TV:**
1. **Settings → Apps → Security & restrictions → Unknown sources**
2. Enable **Downloader**

## Step 2 — Install the Downloader app

1. Open the Amazon Appstore (Fire TV) or Google Play Store (Android TV)
2. Search for **Downloader by AFTVnews**
3. Install it

## Step 3 — Download & install MyWolf TV Player

Open **Downloader** and enter this URL in the **Home → URL** field:

```
https://github.com/mywolf2025/Mywolftv_player/releases/download/latest/mywolftv-player.apk
```

Tip: you can shorten this with [bit.ly](https://bit.ly) or your own short link (e.g. `mywolftv.com/app`) — then you only have to type a few characters with the remote.

Steps:

1. Type the URL above and press **Go**
2. Downloader will fetch `mywolftv-player.apk`
3. When the install prompt appears, select **Install**
4. After installation → **Done** → **Delete** (remove the APK file to save space)
5. Launch **MyWolf TV** from your home screen / app list

## Step 4 — First-time login

Enter your Xtream Codes credentials:
- **Host**: your server URL (e.g. `http://yourpanel.com:8080`)
- **Username** and **Password**: from your subscription

Or paste an **M3U URL** on the second tab.

## Updating the app

When a new version is released, just open Downloader and re-enter the same URL. The new APK will install over the old one — your saved playlists and favorites are preserved.

## Troubleshooting

- **"App not installed"** — usually means the old version had a different signing key. Uninstall the old version first, then re-install.
- **Nothing plays** — check that your IPTV provider allows browser-style requests; try the stream in VLC first to confirm your credentials.
- **Remote doesn't navigate the UI** — use a Bluetooth mouse, or the Fire TV remote's cursor mode (hold Menu).
- **CORS / cleartext errors** — this APK allows cleartext HTTP and mixed content; if you still see errors, check the IPTV panel's firewall.

---

MyWolf TV © 2026 · [mywolftv.com](https://mywolftv.com)
