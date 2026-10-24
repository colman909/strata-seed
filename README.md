# STRATA

**A curated electronic music radio for YouTube.**

STRATA turns YouTube into a continuous radio that plays from the full back catalogues of hand-picked independent electronic labels. It shuffles across tens of thousands of tracks, avoids repeats, shows release information for what's playing, analyses tempo and key as it plays, and runs audio-reactive visuals alongside the music.

> **Status:** public beta (version 8.5.95). Desktop browsers only.

---

## Contents

- [What STRATA does](#what-strata-does)
- [Install](#install)
  - [Step 1: Install Tampermonkey](#step-1-install-tampermonkey)
  - [Step 2: Let Tampermonkey run scripts (Chrome, Edge, Brave)](#step-2-let-tampermonkey-run-scripts-chrome-edge-brave)
  - [Step 3: Install STRATA](#step-3-install-strata)
  - [Step 4: Open YouTube](#step-4-open-youtube)
- [Using STRATA](#using-strata)
- [FAQ](#faq)
- [Troubleshooting](#troubleshooting)
- [Privacy](#privacy)
- [Updating and uninstalling](#updating-and-uninstalling)
- [Reporting a bug](#reporting-a-bug)

---

## What STRATA does

- **Continuous radio** from six independent labels: Acidalia, Analogue Network, Indefinite Pitch, MNMT, subsuelorecs and PARADIGMAS. Their entire upload history is in the mix, not just recent releases.
- **Smart shuffle** that spreads plays across the labels and avoids repeating tracks.
- **Release info** for the current track: artist, label, release date, digital and vinyl availability, and links to Bandcamp and SoundCloud. If the vinyl is sold out, a one-click Discogs search helps you find it second-hand.
- **Track analysis**: a live estimate of tempo (BPM), key, scale and Camelot code, worked out from the audio as it plays. Results are remembered, so a track you've heard before shows its analysis straight away.
- **Visual engine**: six audio-reactive visual modes (Vector, Spectrum, Cascade, Orbit, Phase and Aether), with Low, Balanced and High reactivity. Double-click the visuals to go fullscreen.
- **Favourites**: save tracks with one click or the Enter key, then play your favourites back as a playlist.
- **Label and artist radio**: click the label or artist name of the current track to play only their music.
- **Radio options**: an era filter (Fresh, Everything or Deep cuts), and Harmonic mix, which favours tracks whose key and tempo suit what's playing.
- **Skins**: several colour themes, including Prism Cycle (the default), which slowly shifts through the colour wheel.

---

## Install

STRATA is a *userscript*: a small program that runs inside YouTube in your browser. To run it you need a free browser extension called **Tampermonkey**. Setup takes about two minutes and you only do it once.

**Works on:** Chrome, Edge, Firefox and Brave on Windows, Mac and Linux.
**Doesn't work on:** phones, tablets or the YouTube app.

### Step 1: Install Tampermonkey

Get Tampermonkey from your browser's official store:

- **Chrome / Brave:** [Chrome Web Store](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- **Edge:** [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
- **Firefox:** [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/tampermonkey/)

Click **Add to Chrome / Get / Add to Firefox**, then confirm.

### Step 2: Let Tampermonkey run scripts (Chrome, Edge, Brave)

**Firefox users can skip this step.**

Newer versions of Chrome-based browsers block userscripts until you allow them. Without this step, STRATA installs but never appears.

1. Right-click the Tampermonkey icon in your toolbar and choose **Manage extension**. Or type `chrome://extensions` (Chrome/Brave) or `edge://extensions` (Edge) in the address bar and click **Details** under Tampermonkey.
2. Turn on **Allow User Scripts**.
3. If you don't see that switch (older browser versions), turn on **Developer mode** at the top of the extensions page instead.

### Step 3: Install STRATA

Click this link:

**[Install STRATA Beta](https://raw.githubusercontent.com/colman909/strata-seed/main/STRATA-beta.user.js)**

Tampermonkey opens an install page showing the script's details. Click **Install**.

### Step 4: Open YouTube

Go to [youtube.com](https://www.youtube.com). The **STRATA** button appears at the top left, over the YouTube logo.

On first run STRATA starts with a 150-track starter set so music can play straight away, and downloads the full catalogue in the background. A message at the bottom of the screen tells you when the full library is ready.

---

## Using STRATA

**Open the player.** Click the STRATA button. The full player opens beside the video and covers YouTube's recommendations for a cleaner, more immersive view. Click the × to fold it back into the button.

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
- **Settings**: radio options (era filter, Harmonic mix), skin, and which visual modes are active.
- **About**: contact, support, and the diagnostics tools.

---

## FAQ

**Is STRATA free?**
Yes. There's an optional support link in the About tab if you'd like to chip in.

**Do I need a YouTube account or YouTube Premium?**
No. STRATA works signed in or out, with or without Premium.

**Does STRATA block ads?**
No. STRATA doesn't touch YouTube's ads. You may see few or none, because the labels in the rotation are small independent channels that often don't run ads. That's down to the channels and YouTube, not STRATA, and it can change. If an ad does play, STRATA waits for it to finish rather than skipping the track behind it.

**Does STRATA download music?**
No. Everything plays through YouTube's normal player, exactly as if you'd clicked the videos yourself.

**Why do I need Tampermonkey?**
It's the standard, trusted way to run small add-ons like STRATA on websites. A standalone browser extension that removes this step is planned.

**Will it work on my phone?**
Not at the moment. STRATA needs a desktop browser with Tampermonkey.

**Can I add my own channels?**
Not yet. The catalogue is curated and built ahead of time, which keeps STRATA fast and avoids putting extra load on YouTube. You can turn individual labels on or off under **Channels**.

**How often is the catalogue updated?**
New uploads from the labels are added to the hosted catalogue regularly. STRATA checks for an updated catalogue about once an hour, and only downloads it when something has actually changed.

**How accurate are the BPM and key readings?**
They're estimates worked out live from the audio, so give them a little time. They settle as the track plays, and a confidence percentage is shown underneath. Tracks with long ambient intros or unusual structures can take longer to lock on.

**Will I lose my favourites if I reinstall?**
Normally no. Favourites are also backed up inside your browser, so a fresh install of STRATA restores them automatically. They are lost if you clear YouTube's site data, or if you switch to a different browser or browser profile.

**Can I use STRATA in more than one browser?**
Yes. Install it in each one. Settings and favourites are kept separately per browser.

---

## Troubleshooting

**The STRATA button doesn't appear on YouTube.**

1. Check Tampermonkey is enabled and that **STRATA Beta** is switched on in its dashboard.
2. Chrome, Edge or Brave: make sure **Allow User Scripts** (or Developer mode) is on. See [Step 2](#step-2-let-tampermonkey-run-scripts-chrome-edge-brave).
3. Reload the YouTube tab.

**There's no sound, or the visuals and track analysis don't move.**
Browsers don't let audio start until you've interacted with the page. Click anywhere on the YouTube page or the player once. If the visuals still don't react, click the visual area itself.

**I see "Radio paused — several tracks ended back-to-back".**
STRATA stops itself if several tracks end within a minute, which usually means a run of unavailable videos. This protects against rapid-fire page reloads. Press **Next** to carry on.

**I see "Full library unavailable right now — playing the starter set".**
STRATA couldn't download the full catalogue, usually because of a network hiccup. Music still plays from the starter set, and STRATA tries again in a few minutes.

**I have two STRATA scripts installed.**
Only one STRATA runs at a time. Keep **STRATA Beta**, and switch off or delete any older copy in the Tampermonkey dashboard.

**The player is in my way, or I've lost track of where I put things.**
Drag the player by its header to wherever suits you; it remembers the new position. Double-click its bottom-right corner to snap it back beside the video.

---

## Privacy

- **No accounts, no tracking, no analytics.** STRATA sends nothing about you or your listening anywhere.
- **Your data stays in your browser.** Favourites, settings, history and track analysis are stored locally by Tampermonkey and your browser.
- **STRATA only contacts:**
  - `raw.githubusercontent.com`, to download the track catalogue (Tampermonkey also uses it to check for STRATA updates)
  - `bandcamp.com` and `soundcloud.com`, to look up release information for the track that's playing
- **STRATA does not crawl YouTube.** The catalogue is built offline and served as a static file, so STRATA never sends extra requests to YouTube behind the scenes.
- **Diagnostics are only shared if you share them.** The *Copy diagnostics* button copies technical details (version, browser, settings, recent log) to your clipboard so you can paste them into a bug report. Nothing is sent automatically.

---

## Updating and uninstalling

**Updates are automatic.** Tampermonkey checks for a new version of STRATA roughly once a day and installs it for you. To check right away, open the Tampermonkey dashboard and choose **Check for userscript updates**.

**To uninstall,** open the Tampermonkey dashboard, find **STRATA Beta**, and delete it. To also remove the favourites backup, clear youtube.com's site data in your browser settings.

---

## Reporting a bug

1. Open STRATA and go to the **About** tab.
2. Click **COPY DIAGNOSTICS**.
3. Send it, with a short description of what went wrong, through the **CONTACT** link in the About tab or by opening an issue on this repository.

For extra detail, switch **DEBUG LOG** on in the About tab, reproduce the problem, then copy diagnostics again.

---

*STRATA is an independent project and is not affiliated with YouTube, Google, Bandcamp, SoundCloud, Discogs or any of the featured labels. All music remains the property of its respective artists and labels.*
