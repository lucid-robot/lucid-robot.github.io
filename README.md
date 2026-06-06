# LUCID project page

Static single-page site, **self-contained** (compiled Tailwind + self-hosted fonts,
vanilla JS). No runtime CDN — works offline, in preview sandboxes, and on GitHub Pages.

Published from the `main` branch at https://lucid-robot.github.io.
Development happens on the `dev` branch (this is where the full site lives until publish).

## Preview locally
```
python3 -m http.server 8910      # from this folder
# open http://localhost:8910
```
Use a server, not `file://` — the video slots probe with `fetch`.

## Styling / build step
Tailwind is compiled to `static/css/style.css`. If you add or change Tailwind
classes in `index.html` or `static/js/main.js`, recompile:
```
npx tailwindcss@3 -c tailwind.config.js -i src/input.css -o static/css/style.css --minify
```
Custom colors/fonts are defined in `tailwind.config.js`. Fonts are self-hosted in
`static/fonts/` (`static/css/fonts.css`).

## Add videos
Drop web-encoded clips into `static/videos/` — any element with `data-video`
auto-swaps the placeholder for a managed video on load (no HTML edits):
- `teaser.mp4` — hero
- `closed_loop.mp4`, `open_loop.mp4` — comparison
- `stirring.mp4`, `wiping.mp4`, `binning.mp4`, `push_t.mp4`, `cable.mp4` — task grid
- `emergent_recovery.mp4`, `emergent_reapproach.mp4`, `emergent_compose.mp4` — emergent

Hero-style videos can opt into sound with `data-video-audio="true"` and opt out
of looping with `data-video-loop="false"`. They still start muted for browser
autoplay, and the volume slider unmutes on user interaction.

Encode for web (silent, looping, ~720p):
```
ffmpeg -i raw.mov -an -vf "scale=-2:720" -c:v libx264 -crf 24 -movflags +faststart static/videos/stirring.mp4
```

The compiler preserves audio for `video_sources/hero/` and the closed/open
comparison clips. The hero writes to `static/videos/teaser.mp4` at normal speed;
other result videos stay silent and 4x-compressed for lightweight looping playback.

## Fill in links
Edit `LINKS` at the bottom of `static/js/main.js` (arXiv, code, video URLs).
Author/affiliation links are already wired in `index.html`.

## Publish (dev -> live)
```
git checkout dev
gh auth switch --user lucid-robot
git push -f origin dev:main
gh auth switch --user hgupt3
```
Pages rebuilds in ~30-60s. Until then, `main` shows the "work in progress" page.
