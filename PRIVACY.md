# STRATA — Privacy Policy

_Last updated: 2 November 2026_

STRATA is a browser extension (also available as a userscript) that turns YouTube into a curated electronic music radio. This policy explains exactly what it does with data. The short version: **STRATA does not collect, sell or share any personal data. Everything it knows about you stays in your own browser.**

## What STRATA stores, and where

STRATA keeps the following in your own browser, on your device only (in the extension's storage, or in Tampermonkey's storage if you use the userscript):

- the music catalogue (track list) it plays from
- your favourites and play history (used to avoid repeats)
- your settings (skin, visual style, panel position and similar)
- tempo and key results it has worked out for tracks you have played

STRATA also keeps a backup copy of your favourites in youtube.com's local storage in your browser, so that reinstalling STRATA restores them. This copy also stays on your device.

None of this is ever sent to the developer or to anyone else. Uninstalling STRATA deletes its storage. To remove the favourites backup as well, clear youtube.com's site data in your browser settings.

If you are moving from the old "STRATA Beta" userscript, your favourites and settings are passed across once through YouTube's local page storage in your own browser, and deleted from there as soon as STRATA has imported them. They never leave your device.

## Audio analysis

STRATA's tempo, key and visualiser features analyse the sound of the video you are playing, inside your browser, using the browser's built-in Web Audio features. No audio is recorded, saved or transmitted.

## Network requests STRATA makes

STRATA only ever contacts these sites, and only to fetch public information:

- **raw.githubusercontent.com** — to download the public STRATA music catalogue (a list of YouTube tracks) from the project's GitHub repository.
- **bandcamp.com** — to look up the public release page for the track that is playing (release date, label, digital and vinyl formats). Bandcamp now asks browsers to pass a verification check before it shows release pages, so these requests carry your browser's existing Bandcamp cookies, exactly as visiting bandcamp.com yourself would. STRATA does not read, store or pass on those cookies.
- **soundcloud.com** — to look up the public release page for the track that is playing.
- **youtube.com** — STRATA runs on YouTube pages and reads the current video's public details (such as its description) to find release links. It plays videos through YouTube's own player.

Like any website visit, these services receive the standard technical information every browser request includes (such as your IP address). STRATA adds no identifiers, tracking or personal information to these requests.

## Links you choose to open

STRATA's panels include links you can click, such as release pages on Bandcamp, SoundCloud and Discogs, the Bandcamp verification notice, the developer's contact page and a "Support STRATA via PayPal" button. These open in a new tab only when you click them. STRATA does not contact those sites otherwise, and anything you do on them is covered by their own privacy policies.

## What STRATA does not do

- no analytics, telemetry or tracking
- no advertising
- no accounts or sign-in
- no selling or sharing of data with third parties
- no remote code: all of STRATA's code ships inside the extension

## Diagnostics

STRATA's About panel has a "Copy diagnostics" button. It copies a short technical report (version, settings and recent log lines) to your clipboard **only when you click it**, so you can choose to paste it into a bug report. Nothing is sent automatically.

## Related documents

STRATA's terms of use and copyright are set out in [LICENSE](LICENSE). An overview of STRATA is in the [README](README.md).

## Contact

Questions about this policy: open an issue at https://github.com/colman909/strata-seed/issues

If this policy changes, the updated version will be published at this address with a new date.
