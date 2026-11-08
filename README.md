# STRATA

**Electronic music radio from curated channels, playing on YouTube.**

STRATA shuffles the full upload history of a hand-picked set of YouTube channels that champion underground and authentic electronic music. There's no algorithm: tracks aren't steered by views, likes or recommendations. You get genuine randomisation across each channel's whole catalogue, from the earliest uploads to the latest.

STRATA is a browser extension. It runs on youtube.com and plays tracks in YouTube's own player.

---

## Install

| Browser | Status |
|---|---|
| **Chrome** | [Chrome Web Store](https://chromewebstore.google.com/detail/maccclcgcgddanecmkcbclhlgnioldob) |
| **Firefox** | [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/strata/) (requires Firefox 140 or later) |
| **Edge** | Coming later. In the meantime, the Chrome Web Store version installs in Edge. |

After installing, open [youtube.com](https://www.youtube.com). The STRATA button appears in the top left. Press it to start the radio.

> **Firefox users:** please read [Firefox setup](#firefox-setup) below. One setting is needed for the radio to move from track to track.

---

## The channels

STRATA draws from six curated channels:

**Acidalia · Analogue Network · Indefinite Pitch · MNMT · subsuelorecs · PARADIGMAS**

The full catalogue (around 40,000 tracks) loads on first run and is kept up to date automatically.

---

## Features

- **True shuffle** across every channel's full upload history, with anti-repetition so you don't hear the same tracks over and over.
- **Release info for every track**: artist, release and label details from Bandcamp and SoundCloud.
- **For DJs: Digital / Vinyl**. Each track shows whether the release is available digitally, on vinyl, or both (checked on Bandcamp). When the vinyl isn't available, there's a Discogs link to buy it or add it to your wantlist.
- **Live track analysis**: BPM and key, worked out in your browser as the track plays.
- **Favourites**: save tracks with the heart button or the Enter key.
- **Artist and label radio**: stay with one artist or label for a while.
- **Era filter**: limit the radio to a period of releases.
- **Harmonic mix**: when on, the radio prefers tracks in a compatible key and tempo.
- **Audio-reactive visuals**: Vector, Spectrum, Cascade, Orbit, Phase, Aether, Tank, Chladni, Faraday and Voice. Several are modelled on real sound phenomena: Chladni plates, Faraday waves, ripple tanks and voice figures.
- **Skins**: Ink Black (default) plus two looks inspired by classic drum machines.

### Keyboard shortcuts

These work on a video page. They're ignored while you're typing in search, comments or any text box.

| Key | Action |
|---|---|
| `Enter` | Favourite the current track |
| `-` | Previous track |
| `+` or `=` | Next track (no Shift needed; numpad works too) |

---

## Firefox setup

**Allow autoplay for YouTube.** Firefox blocks videos with sound from starting on their own. STRATA opens each new track as a new page, so without this setting the radio stops after the first track. STRATA shows a notice when this happens. To fix it for good:

1. On youtube.com, click the icon at the left of the address bar.
2. Find **Autoplay** and choose **Allow Audio and Video**.
3. Reload the page.

**Make sure STRATA can access YouTube.** If STRATA is enabled but the button doesn't appear when you open YouTube:

1. Go to `about:addons` and click **STRATA**.
2. Open the **Permissions** tab.
3. Make sure access to **www.youtube.com** is switched on, then reload YouTube.

---

## FAQ

**The radio stopped after one track (Firefox).**
Autoplay is being blocked. See [Firefox setup](#firefox-setup). Click the STRATA notice to resume straight away, and allow autoplay so it doesn't happen again.

**STRATA is enabled but I can't see it.**
On Firefox, check STRATA's YouTube permission (see [Firefox setup](#firefox-setup)). On any browser, try reloading the YouTube tab. If it still doesn't appear, please [open an issue](https://github.com/colman909/strata-seed/issues) and say which browser and version you're using.

**I'm seeing a notice asking me to verify Bandcamp, or "Formats not checked".**
Bandcamp sometimes shows a "Client Challenge" check to make sure you're a person. While that check is pending, STRATA can't read release formats, so the Digital / Vinyl labels can't be shown. Click the STRATA notice to open Bandcamp, complete the check, and the formats come back. Bandcamp links stay available either way.

**Why does the key sometimes show a "?" or say "No clear key"?**
Key detection runs live on the audio, and some tracks don't have one clear key. Think heavily percussive, atonal or constantly shifting music. When STRATA has a likely answer but isn't certain, it shows the key it's *leaning* towards with a "?". When the music doesn't settle on any key, it says so rather than guessing.

**Will I lose my favourites when STRATA updates?**
No. Favourites, settings and history are kept across updates.

**I used the old STRATA Beta (Tampermonkey script). Can I bring my favourites?**
Yes. Install the extension while the final Beta is still installed and open YouTube. STRATA picks up your favourites, settings and history automatically. After that you can remove the Beta script. STRATA no longer ships as a Tampermonkey script.

**Does STRATA count as a view or like for the channels?**
Tracks play on YouTube itself, in YouTube's own player. Saving a track to STRATA favourites doesn't like it on YouTube. If you enjoy a track, liking it or subscribing on YouTube is the best way to support the channel.

**Does STRATA collect my data?**
No. STRATA doesn't collect, sell or share any personal data. Your favourites and settings stay in your browser. See the [privacy policy](https://github.com/colman909/strata-seed/blob/main/PRIVACY.md).

**Why only these channels? Can you add one?**
The channels are hand-picked as the best of the best for underground electronic music. Suggestions are welcome via [issues](https://github.com/colman909/strata-seed/issues).

**Does it work on mobile or in the YouTube app?**
No. STRATA is a desktop browser extension for youtube.com.

---

## Known issues

- In a narrow browser window, the docked panel can overlap the right edge of the video instead of sitting beside it. Widening the window fixes it for now.

---

## Support STRATA

STRATA is free. If you'd like to support its development: [PayPal](https://paypal.me/COLMANBUCKLEY)

Bug reports and suggestions: [GitHub issues](https://github.com/colman909/strata-seed/issues)

---

## About this repository

This repository hosts STRATA's public files: the track catalogue (`master.json`), the [privacy policy](PRIVACY.md) and this README. STRATA's source code is not published here.

© Colman Buckley. All rights reserved. See [LICENSE](LICENSE).
