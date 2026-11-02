# Changelog

thomasgrim.com / GRIM/OS. Versions follow semver from 1.3.0 on: **major** = redesign, **minor** = new features, **patch** = fixes.
Versions before 1.3.0 were assigned retroactively from the git history, so their grouping is approximate.

## 1.3.6 — 2026-11-02
- SEO: clearer page title and description (tomGRIM / Tom Grim, downtempo, breakbeat, electro); name variants, genres and keywords added to the artist data; genres on each Spotify track.

## 1.3.5 — 2026-11-02
- SEO: artist profile now links Spotify, YouTube, TikTok and Instagram for search engines; the 8 Spotify tracks are listed as recordings; Spotify added to share metadata; sitemap refreshed.

## 1.3.4 — 2026-11-01
- Fix: the fullscreen icon next to weather now uses a pixel icon and follows the bar colours in every theme (it showed a pale box in some themes).

## 1.3.3 — 2026-11-01
- The theme picker is now a **THEME** dropdown styled exactly like **DISPLAY** (same box height, font, panel and keyboard controls). Both menus use all-uppercase labels.

## 1.3.2 — 2026-11-01
- Compact menu bar: one line on desktop, two on phones. New **DISPLAY** menu holds CRT, flicker, fullscreen and install app; a fullscreen icon sits next to weather; shorter theme box ("nightshift" is shown as "night").

## 1.3.1 — 2026-11-01
- Menu bar: FULLSCREEN and INSTALL moved to the left with icon + label; Spotify is now a "ᯤ SPOTIFY" text link (small uppercase), still last on the right. Clear tooltips and labels on all three.
- Titlebar, grimsh banner, uname/neofetch/motd/os-release and the /stats login now all show the real site version (v1.3.1) from one constant; the old month-based 6.x stamp is retired.

## 1.3.0 — 2026-11-01
- **Listen@Spotify** button on the now-playing line for tracks that are on Spotify (opens the song on Spotify with tomGRIM's artist page as the play context).
- Menu bar: pixel Spotify icon (artist page), **install** button (PWA install, or Add to Home Screen steps), **fullscreen** toggle ("best viewed in fullscreen, F11").
- **Background broadcast mode**: while the tab is hidden and music plays, the tab title becomes a scrolling "▶ now playing" ticker and the favicon shows a playing indicator; both restore when you come back.
- Media Session: title / artist / album / artwork and play, pause, next, previous, seek on lock screens and media keys.
- "Updated" line in sysinfo, driven by one version constant.
- grimfetch portrait fades to black at every edge and sits closer to the right border.
- This changelog (`changelog` command, link in sysinfo, CHANGELOG.md).
- IRC chat removed from the menu, links, help and man pages (code kept behind a flag for later).

## 1.2.2 — 2026-10-31
- Private /stats dashboard: privacy-safe visit logging, human vs bot classification, socials snapshots (YouTube, TikTok), passphrase login.
- Night Signals: Disappear and Eyes On You re-mastered from the source WAVs.

## 1.2.1 — 2026-10-27
- Man window with two pages (man tomgrim · ls -la ~/links); BBS takes over panel [4].
- Liked hearts are solid white; terminal echoes likes, BBS posts and new messages with quips.
- rm -rf / now holds the kernel panic, types a Hackers-quoted boot log and reboots back to the site, resuming the track.

## 1.2.0 — 2026-10-26 → 10-27
- BPM for every track (shown in the tracklist and ID3 tags); MIXES & SETS section.
- GRIMAMP: auto-visuals eye toggle (off by default), horizontal oscilloscope, title marquee, now-playing status line.
- Clickable theme swatches, clickable help and man cross-references, coloured man pages and status values, screensaver command.
- Installable app (PWA) and `install` command; Walking Green weather link (/weather).
- Likes (hearts + `like`) and the anonymous feedback BBS.
- "Ninety-Six Something" renamed to Passing High.
- Fixes: mobile keyboard covering the prompt, sticky hover fills on touch.

## 1.1.1 — 2026-10-25
- Performance: no layout shift on webfont swap, deferred scripts, optimised images, cheaper ring rendering on phones.
- Android and background playback fixes; never auto-starts audio.

## 1.1.0 — 2026-10-25
- GRIM/WX: 90s "local on the 8s" weather channel with live data, regional map, radar and satellite while Walking Green plays.
- Share links that cue a track and time (?t=&at=).
- grimfetch ASCII portrait; clickable fun commands in the motd.

## 1.0.0 — 2026-10-24 (launch)
- GRIM/OS retro terminal redesign: GRIMAMP ASCII player with spectrum, scope, waveform and FX knobs; themes and CRT filter; pixel-icon menu.
- Music library: Ember Hours, Night Signals, ELEMENTS, Phosphor Cache loops, singles, soundtracks, remixes; free downloads (`get`).
- grimsh terminal with a fake filesystem, system commands, ANSI colours and effects (fire, matrix, plasma and more), idle screensaver.
- Photo album, contact form, IRC chat, GoatCounter analytics, SEO / social cards, rm -rf / easter egg.
