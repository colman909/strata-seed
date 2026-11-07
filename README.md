# STRATA

**A curated electronic music radio for YouTube.**

STRATA turns YouTube into a continuous radio that plays from the full upload history of six hand-picked electronic music channels: some of the best of underground and authentic electronic music. There is no algorithm steering it. It doesn't favour views, likes or recommendations, so you discover music naturally, from the channels' earliest uploads to their latest.

As it plays, STRATA shows the release behind each track (including whether it's out on digital, vinyl or both), analyses tempo and key from the audio, and runs audio-reactive visuals alongside the music.

> Desktop browsers only. Free to install and use.

---

## Contents

- [What STRATA does](#what-strata-does)
- [Install](#install)
- [Using STRATA](#using-strata)
- [FAQ](#faq)
- [Troubleshooting](#troubleshooting)
- [Privacy](#privacy)
- [Updating and uninstalling](#updating-and-uninstalling)
- [Reporting a bug](#reporting-a-bug)
- [Licence](#licence)

---

## What STRATA does

- **Continuous radio** from six curated channels: Acidalia, Analogue Network, Indefinite Pitch, MNMT, subsuelorecs and PARADIGMAS. Their entire upload history is in the mix, not just recent releases.
- **Genuine shuffle** that spreads plays across the channels and avoids repeating tracks.
- **Release info for DJs**: artist, label, release date, and whether the release is available on digital, vinyl or both (checked on Bandcamp), with links to Bandcamp and SoundCloud. If the vinyl isn't available, a one-click Discogs link helps you buy it second-hand or add it to your wantlist.
- **Track analysis**: a live estimate of tempo (BPM), key and mode, worked out from the audio as it plays. When the key isn't certain yet, STRATA shows the key it's leaning towards with a **?**, and says **No clear key** only when the music genuinely doesn't have one. Results are remembered, so a track you've heard before shows its analysis straight away.
- **Visual engine**: ten audio-reactive visual styles: Vector, Spectrum, Cascade, Orbit, Phase and Aether, plus Tank, Chladni, Faraday and Voice, which are inspired by sound made visible in water, sand and vibrating plates. Double-click the visuals to go fullscreen.
- **Favourites**: save tracks with one click or the Enter key, then play your favourites back as a playlist.
- **Label and artist radio**: click the label or artist name of the current track to play only their music.
- **Radio options**: an era filter (Fresh, Everything or Deep cuts), and Harmonic mix, which favours tracks whose key and tempo suit what's playing.
- **Skins**: Ink Black (the default) and two skins inspired by classic drum machines, among others.

---

## Install

### Browser extension (recommended)

| Browser | Get STRATA |
|---|---|
| **Chrome / Brave** | [Chrome Web Store](https://chromewebstore.google.com/detail/maccclcgcgddanecmkcbclhlgnioldob) |
| **Edge** | Coming soon to Microsoft Edge Add-ons (Edge can also install from the Chrome Web Store link above) |
| **Firefox** | Coming soon to Firefox Add-ons |

Click **Add to Chrome** (or your browser's equivalent) and confirm. Then go to [youtube.com](https://www.youtube.com): the **STRATA** button appears at the top left, over the YouTube logo.

On first run STRATA starts with a 150-track starter set so music can play straight away, and downloads the full catalogue in the background. A message at the bottom of the screen tells you when the full library is ready.

### Userscript (alternative)

If you'd rather use Tampermonkey, STRATA is also available as a userscript. Install [Tampermonkey](https://www.tampermonkey.net/), then on Chrome, Edge or Brave turn on **Allow User Scripts** in Tampermonkey's extension details (or **Developer mode** on older browsers). Then click:

**[Install STRATA (userscript)](https://raw.githubusercontent.com/colman909/strata-seed/main/STRATA.user.js)**

and click **Install** on the page Tampermonkey opens. Use the extension *or* the userscript, not both.

**Moving from STRATA Beta?** Install STRATA and it imports your favourites, settings, history and track analysis from the Beta automatically. Then delete STRATA Beta from Tampermonkey.

---

## Using STRATA

**Open the player.** Click the STRATA button. The player opens beside the video and covers YouTube's recommendations for a cleaner, more immersive view. Click the × to fold it back into the button.

**Start the radio.** Press Next (▶|) to jump to a STRATA track. With **Radio** switched on, STRATA moves to a new track every time one ends.

**Move things around.** Drag the STRATA button anywhere and it stays where you leave it. Drag the open player by its header to move it, or by its bottom-right corner to resize it. **Double-click that corner** to snap it back beside the video.

**Keyboard shortcuts** (while a STRATA track is playing):

| Key | Action |
|---|---|
| `+` | Next track |
| `−` | Previous track |
| `Enter` | Add / remove favourite |

The next and previous media keys on your keyboard or headphones work too.

**The tabs along the bottom of the player:**

- **Library**: your favourites, and playing them as a playlist.
- **Stats**: the catalogue and your listening session at a glance.
- **Settings**: radio options (era filter, Harmonic mix), channels, skin, and which visual styles are active.
- **About**: contact, support, and the diagnostics tools.

---

## FAQ

**Is STRATA free?**
Yes. There's an optional "Support STRATA via PayPal" button in the About tab if you'd like to chip in.

**Do I need a YouTube account or YouTube Premium?**
No. STRATA works signed in or out, with or without Premium.

**Does STRATA block ads?**
No. STRATA doesn't touch YouTube's ads. If an ad plays, STRATA waits for it to finish rather than skipping the track behind it. How many ads you see is down to the channels and YouTube, not STRATA.

**Does STRATA download music?**
No. Everything plays through YouTube's normal player, exactly as if you'd clicked the videos yourself.

**Will it work on my phone?**
Not at the moment. STRATA needs a desktop browser.

**Can I add my own channels?**
Not yet. The catalogue is curated and built ahead of time, which keeps STRATA fast and avoids putting extra load on YouTube. You can turn individual channels on or off under **Channels** in Settings.

**How often is the catalogue updated?**
New uploads from the channels are added to the hosted catalogue regularly. STRATA checks for an updated catalogue about once an hour, and only downloads it when something has actually changed.

**How accurate are the BPM and key readings?**
They're estimates worked out live from the audio, so give them a little time. They settle as the track plays. Tracks with long ambient intros or unusual structures can take longer to lock on.

**Will I lose my favourites if I reinstall?**
Normally no. STRATA keeps a backup copy of your favourites in your browser, so a fresh install restores them automatically. They are lost if you clear youtube.com's site data as well as uninstalling, or if you switch to a different browser or browser profile.

**Can I use STRATA in more than one browser?**
Yes. Install it in each one. Settings and favourites are kept separately per browser.

---

## Troubleshooting

**The STRATA button doesn't appear on YouTube.**
Check STRATA is switched on in your browser's extensions page, then reload the YouTube tab. Userscript users: check Tampermonkey is enabled, **STRATA** is switched on in its dashboard, and **Allow User Scripts** (or Developer mode) is on.

**Firefox: the radio stops after each track.**
Firefox blocks autoplay with sound by default, and STRATA shows a notice when this happens. Click the notice to carry on, or allow autoplay permanently: click the icon at the left of the address bar on YouTube, find **Autoplay**, and choose **Allow Audio and Video**.

**Digital / Vinyl information is missing, or STRATA asks you to verify Bandcamp.**
Bandcamp sometimes asks browsers to pass a quick verification check, and until you do, STRATA can't read release pages. Click STRATA's notice (or open any Bandcamp link) and complete the check on Bandcamp. STRATA picks it up from there.

**There's no sound, or the visuals and track analysis don't move.**
Browsers don't let audio start until you've interacted with the page. Click anywhere on the YouTube page or the player once. If the visuals still don't react, click the visual area itself.

**I see "Radio paused — several tracks ended back-to-back".**
STRATA stops itself if several tracks end within a minute, which usually means a run of unavailable videos. This protects against rapid-fire page reloads. Press **Next** to carry on.

**I see "Full library unavailable right now — playing the starter set".**
STRATA couldn't download the full catalogue, usually because of a network hiccup. Music still plays from the starter set, and STRATA tries again in a few minutes.

**I have two copies of STRATA running.**
Only one STRATA runs at a time. Keep either the extension or the userscript, and remove the other, along with any old STRATA Beta.

---

## Privacy

STRATA does not collect, sell or share any personal data. There are no accounts, no analytics, no tracking and no advertising. Your favourites, settings, history and track analysis stay in your own browser, and STRATA only contacts GitHub (for the catalogue), Bandcamp and SoundCloud (for release information) and YouTube itself.

The full details are in the **[Privacy Policy](PRIVACY.md)**.

---

## Updating and uninstalling

**Updates are automatic.** Your browser's extension store updates STRATA for you. Userscript users get updates through Tampermonkey, which checks roughly once a day (or choose **Check for userscript updates** in its dashboard).

**To uninstall,** remove STRATA from your browser's extensions page (or delete it in the Tampermonkey dashboard). To also remove the favourites backup, clear youtube.com's site data in your browser settings.

---

## Reporting a bug

1. Open STRATA and go to the **About** tab.
2. Click **COPY DIAGNOSTICS**.
3. Open an [issue on this repository](https://github.com/colman909/strata-seed/issues) and paste it in, with a short description of what went wrong.

For extra detail, switch **DEBUG LOG** on in the About tab, reproduce the problem, then copy diagnostics again.

---

## Licence

Copyright © 2026 Colman Buckley. All rights reserved.

STRATA is free to install and use from the official sources listed above. Its code, visuals, artwork and documentation may not be copied, modified, redistributed, sold or presented as anyone else's work without written permission. See **[LICENSE](LICENSE)** for the full terms.

---

*STRATA is an independent project and is not affiliated with YouTube, Google, Bandcamp, SoundCloud, Discogs or any of the featured channels. All music remains the property of its respective artists and labels.*
