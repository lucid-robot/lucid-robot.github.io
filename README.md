# LUCID project page

Static single-page site (Tailwind via CDN + vanilla JS). No build step.

## Preview locally
```
cd website
python3 -m http.server 8910
# open http://localhost:8910
```
Use a server, not `file://` — the task grid probes for videos with `fetch`.

## Add videos
Drop web-encoded clips into `static/videos/` and they auto-swap in for the
placeholders (no HTML edits — any element with `data-video` is probed on load):
- `teaser.mp4` — hero
- `closed_loop.mp4`, `open_loop.mp4` — comparison
- `stirring.mp4`, `wiping.mp4`, `binning.mp4`, `push_t.mp4`, `cable.mp4` — task grid
- `emergent_recovery.mp4`, `emergent_reapproach.mp4`, `emergent_compose.mp4` — emergent behaviors

Optional logos: `static/images/logo_uiuc.png`, `static/images/logo_cmu.png`
(hidden automatically if absent).

Encode for web (silent, looping, ~720p):
```
ffmpeg -i raw.mov -an -vf "scale=-2:720" -c:v libx264 -crf 24 -movflags +faststart static/videos/stirring.mp4
```

## Fill in links
Edit `LINKS` at the bottom of `static/js/main.js` (arXiv, code, video).
Author name links are `href="#"` in `index.html` — point them at homepages.

## Deploy to GitHub Pages
1. Push this `website/` content to a repo (or its own repo root).
2. Settings → Pages → deploy from branch, `/` (root) or `/docs`.
3. To use root, move these files to the repo root or set Pages source to `website/`
   via a `gh-pages` branch / GitHub Action.
