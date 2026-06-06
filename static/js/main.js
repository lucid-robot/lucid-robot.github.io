// ---------- scroll-triggered sticky bar ----------
// Hidden until the hero scrolls out of view, then slides down (like the
// reference site). No table of contents — just title + authors + buttons.
const stickyBar = document.getElementById('sticky-bar');
const trigger = document.getElementById('hero-divider'); // separator after the paper/code/video links
if (stickyBar && trigger) {
  const obs = new IntersectionObserver(([e]) => {
    // show the bar once the divider has scrolled up past the top of the viewport
    stickyBar.classList.toggle('visible', e.boundingClientRect.top < 0);
  }, { threshold: 0 });
  obs.observe(trigger);
}

// ---------- scroll reveal ----------
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

// ---------- managed video slots ----------
// Any element with data-video="path.mp4" becomes a tiny managed player once the
// file exists. The manager keeps offscreen/carousel-hidden videos paused.
const LucidVideo = (() => {
  const SPEEDS = [4, 8, 1, 2];
  const players = new Set();
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touchish = typeof matchMedia === 'function' && matchMedia('(hover: none), (pointer: coarse)').matches;
  let fullscreenPlayer = null;
  let refreshRaf = 0;

  const icon = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    fullscreen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5"/></svg>',
    volume: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 4V5L8 9H4zm11.5-.7v7.4c1.1-.8 1.8-2.1 1.8-3.7s-.7-2.9-1.8-3.7zm0-3.2v2.1c2.3 1 3.9 3.2 3.9 5.8s-1.6 4.8-3.9 5.8v2.1c3.4-1.1 5.9-4.3 5.9-7.9s-2.5-6.8-5.9-7.9z"/></svg>',
    muted: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 4V5L8 9H4zm12.6 3l2.2-2.2-1.4-1.4-2.2 2.2L13 8.4l-1.4 1.4 2.2 2.2-2.2 2.2 1.4 1.4 2.2-2.2 2.2 2.2 1.4-1.4-2.2-2.2z"/></svg>',
  };

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function visibleRatio(slot) {
    const r = slot.getBoundingClientRect();
    if (!r.width || !r.height) return 0;
    let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
    for (let el = slot.parentElement; el; el = el.parentElement) {
      const style = getComputedStyle(el);
      const er = el.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
        left = Math.max(left, er.left);
        right = Math.min(right, er.right);
      }
      if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
        top = Math.max(top, er.top);
        bottom = Math.min(bottom, er.bottom);
      }
    }
    const width = Math.max(0, Math.min(r.right, right) - Math.max(r.left, left));
    const height = Math.max(0, Math.min(r.bottom, bottom) - Math.max(r.top, top));
    return (width * height) / (r.width * r.height);
  }

  function inViewport(slot) {
    return visibleRatio(slot) >= 0.45;
  }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function canNativeFullscreen(video) {
    if (!video) return false;
    if (video.webkitEnterFullscreen || video.webkitEnterFullScreen) return true;
    return !!(video.webkitSetPresentationMode &&
      video.webkitSupportsPresentationMode &&
      video.webkitSupportsPresentationMode('fullscreen'));
  }

  function canFullscreen(p) {
    return !!(p && (
      (p.slot && (p.slot.requestFullscreen || p.slot.webkitRequestFullscreen)) ||
      canNativeFullscreen(p.video)
    ));
  }

  function beginNativeFullscreen(p) {
    p.nativeFullscreen = true;
    fullscreenPlayer = p;
    p.userPaused = false;
    maybeUnmuteOnFirstFullscreen(p);
    scheduleRefresh();
  }

  function endNativeFullscreen(p) {
    if (p.restoreNativeControls) {
      p.video.controls = false;
      p.restoreNativeControls = false;
    }
    p.nativeFullscreen = false;
    if (fullscreenPlayer === p) fullscreenPlayer = null;
    scheduleRefresh();
  }

  function requestFullscreen(p) {
    const slotFn = p.slot.requestFullscreen || p.slot.webkitRequestFullscreen;
    if (slotFn) return slotFn.call(p.slot);

    const video = p.video;
    const enter = video.webkitEnterFullscreen || video.webkitEnterFullScreen;
    try {
      p.restoreNativeControls = !video.controls;
      video.controls = true;
      beginNativeFullscreen(p);
      if (enter) {
        enter.call(video);
      } else if (video.webkitSetPresentationMode &&
                 video.webkitSupportsPresentationMode &&
                 video.webkitSupportsPresentationMode('fullscreen')) {
        video.webkitSetPresentationMode('fullscreen');
      }
    } catch (_) {
      endNativeFullscreen(p);
    }
    return null;
  }

  function exitFullscreen() {
    const fn = document.exitFullscreen || document.webkitExitFullscreen;
    return fn ? fn.call(document) : null;
  }

  function exitNativeFullscreen(p) {
    const video = p.video;
    const exit = video.webkitExitFullscreen || video.webkitExitFullScreen;
    try {
      if (exit) {
        exit.call(video);
        return true;
      }
      if (video.webkitSetPresentationMode && video.webkitPresentationMode === 'fullscreen') {
        video.webkitSetPresentationMode('inline');
        return true;
      }
    } catch (_) {}
    endNativeFullscreen(p);
    return false;
  }

  function isFullscreen(p) {
    return fullscreenElement() === p.slot ||
      p.nativeFullscreen ||
      p.video.webkitPresentationMode === 'fullscreen';
  }

  function setPausedClass(p) {
    p.slot.classList.toggle('is-paused', p.userPaused || p.video.paused);
    p.playBtn.innerHTML = p.video.paused ? icon.play : icon.pause;
    p.playBtn.setAttribute('aria-label', p.video.paused ? 'Play video' : 'Pause video');
  }

  function syncAudioControls(p) {
    if (!p.showAudio) return;
    const muted = p.video.muted || p.video.volume <= 0;
    p.muteBtn.innerHTML = muted ? icon.muted : icon.volume;
    p.muteBtn.setAttribute('aria-label', muted ? 'Unmute video' : 'Mute video');
    p.volume.value = muted ? '0' : String(Math.round(p.video.volume * 100));
  }

  function maybeUnmuteOnFirstFullscreen(p) {
    if (!p.showAudio || p.fullscreenAudioUnlocked) return;
    p.fullscreenAudioUnlocked = true;
    if (p.userAudioTouched) return;
    const next = clamp(p.lastVolume || Number(p.slot.dataset.videoVolume) || 0.7, 0.05, 1);
    p.video.volume = next;
    p.video.muted = false;
    p.video.removeAttribute('muted');
    p.lastVolume = next;
    syncAudioControls(p);
  }

  function speedIndexFromSlot(slot) {
    const saved = Number(slot.dataset.videoSpeedIndex);
    if (Number.isInteger(saved) && saved >= 0 && saved < SPEEDS.length) return saved;
    const requested = Number(slot.dataset.videoSpeed);
    const idx = SPEEDS.indexOf(requested);
    return idx >= 0 ? idx : 0;
  }

  function sourceSpeedFromSlot(slot, showSpeed) {
    const speed = Number(slot.dataset.videoSourceSpeed);
    if (Number.isFinite(speed) && speed > 0) return speed;
    return showSpeed ? 4 : 1;
  }

  function applySpeed(p) {
    p.video.playbackRate = SPEEDS[p.speedIdx] / p.sourceSpeed;
    if (p.speedBtn) p.speedBtn.textContent = `${SPEEDS[p.speedIdx]}x`;
  }

  function placeSpeedButton(p) {
    if (!p.showSpeed || !p.speedBtn) return;
    if (fullscreenElement() === p.slot) {
      p.speedBtn.classList.add('lucid-speed--inline');
      p.controls.insertBefore(p.speedBtn, p.fullBtn);
    } else {
      p.speedBtn.classList.remove('lucid-speed--inline');
      p.slot.appendChild(p.speedBtn);
    }
  }

  function updateScrub(p) {
    if (p.seeking || !Number.isFinite(p.video.duration) || p.video.duration <= 0) return;
    p.scrub.value = String((p.video.currentTime / p.video.duration) * 1000);
  }

  function stopScrubLoop(p) {
    if (!p.scrubRaf) return;
    cancelAnimationFrame(p.scrubRaf);
    p.scrubRaf = 0;
  }

  function startScrubLoop(p) {
    if (p.scrubRaf) return;
    const tick = () => {
      updateScrub(p);
      p.scrubRaf = p.video.paused ? 0 : requestAnimationFrame(tick);
    };
    p.scrubRaf = requestAnimationFrame(tick);
  }

  function shouldPlay(p) {
    if (!p.ready || p.userPaused || reduceMotion) return false;
    if (!p.loop && p.video.ended) return false;
    if (fullscreenPlayer && fullscreenPlayer !== p) return false;
    return fullscreenPlayer === p || p.visible;
  }

  function updatePlayer(p) {
    p.visible = inViewport(p.slot);
    if (shouldPlay(p)) {
      const pr = p.video.play();
      if (pr && pr.catch) pr.catch(() => {});
    } else {
      p.video.pause();
    }
    setPausedClass(p);
  }

  function refresh() {
    refreshRaf = 0;
    players.forEach(updatePlayer);
  }

  function scheduleRefresh() {
    if (!refreshRaf) refreshRaf = requestAnimationFrame(refresh);
  }

  function revealControls(p, timeout = touchish ? 2600 : 1600) {
    p.slot.classList.add('is-controls');
    clearTimeout(p.controlsTimer);
    p.controlsTimer = setTimeout(() => {
      if (!p.userPaused && !p.video.paused) p.slot.classList.remove('is-controls');
    }, timeout);
  }

  function destroy(slot) {
    const p = slot && slot._lucidPlayer;
    if (!p) return;
    p.video.pause();
    stopScrubLoop(p);
    players.delete(p);
    p.nodes.forEach((n) => n.remove());
    slot._lucidPlayer = null;
    slot.classList.remove('lucid-player', 'is-loading', 'is-ready', 'is-paused', 'is-controls');
  }

  function mount(slot) {
    const src = slot && slot.dataset.video;
    if (!slot || !src) return null;
    if (slot._lucidPlayer && slot._lucidPlayer.src === src) return slot._lucidPlayer;
    destroy(slot);

    slot.classList.add('lucid-player', 'is-loading');
    if (!slot.hasAttribute('tabindex')) slot.setAttribute('tabindex', '0');
    [...slot.children].forEach((child) => child.classList.add('lucid-video-fallback'));

    const video = document.createElement('video');
    video.src = src;
    video.controls = false;
    video.muted = true;
    video.defaultMuted = true;
    video.loop = slot.dataset.videoLoop !== 'false';
    video.playsInline = true;
    video.autoplay = true;
    video.preload = slot.dataset.videoPreload || 'metadata';
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('x5-playsinline', '');
    video.setAttribute('x-webkit-airplay', 'deny');
    video.setAttribute('muted', '');
    video.setAttribute('disableremoteplayback', '');
    video.setAttribute('controlsList', 'nodownload noremoteplayback');
    try { video.disableRemotePlayback = true; } catch (_) {}
    try { video.disablePictureInPicture = true; } catch (_) {}

    const loading = document.createElement('div');
    loading.className = 'lucid-video-loading';

    const speedBtn = document.createElement('button');
    speedBtn.type = 'button';
    speedBtn.className = 'lucid-speed';
    speedBtn.setAttribute('aria-label', 'Change playback speed');
    const showSpeed = slot.dataset.videoSpeedControl !== 'false';
    speedBtn.hidden = !showSpeed;
    speedBtn.disabled = !showSpeed;

    const controls = document.createElement('div');
    controls.className = 'lucid-controls';

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'lucid-control-btn';

    const scrub = document.createElement('input');
    scrub.type = 'range';
    scrub.className = 'lucid-scrub';
    scrub.min = '0';
    scrub.max = '1000';
    scrub.step = 'any';
    scrub.value = '0';
    scrub.setAttribute('aria-label', 'Scrub video');

    const showAudio = slot.dataset.videoAudio === 'true';
    const muteBtn = document.createElement('button');
    muteBtn.type = 'button';
    muteBtn.className = 'lucid-control-btn';

    const volume = document.createElement('input');
    volume.type = 'range';
    volume.className = 'lucid-volume';
    volume.min = '0';
    volume.max = '100';
    volume.step = '1';
    volume.value = '0';
    volume.setAttribute('aria-label', 'Video volume');

    const fullBtn = document.createElement('button');
    fullBtn.type = 'button';
    fullBtn.className = 'lucid-control-btn';
    fullBtn.setAttribute('aria-label', 'Fullscreen');
    fullBtn.innerHTML = icon.fullscreen;

    controls.append(playBtn, scrub);
    if (showAudio) controls.append(muteBtn, volume);
    controls.append(fullBtn);

    const nodes = [loading, video, controls];
    if (showSpeed) nodes.push(speedBtn);
    let tag = null;
    if (slot.dataset.videoLabel) {
      tag = document.createElement('div');
      tag.className = 'lucid-video-tag';
      tag.textContent = slot.dataset.videoLabel;
      nodes.push(tag);
    }
    slot.append(...nodes);

    const p = {
      slot, src, video, loading, speedBtn, playBtn, scrub, muteBtn, volume, fullBtn, controls, tag,
      nodes, showSpeed, showAudio, loop: video.loop, sourceSpeed: sourceSpeedFromSlot(slot, showSpeed),
      speedIdx: speedIndexFromSlot(slot), lastVolume: clamp(Number(slot.dataset.videoVolume) || 0.7, 0.05, 1),
      ready: false, visible: false, userPaused: false, seeking: false, scrubRaf: 0,
      nativeFullscreen: false, restoreNativeControls: false,
      fullscreenAudioUnlocked: false, userAudioTouched: false,
    };
    slot._lucidPlayer = p;
    players.add(p);
    if (!canFullscreen(p)) {
      fullBtn.hidden = true;
      fullBtn.disabled = true;
    }
    applySpeed(p);
    placeSpeedButton(p);
    setPausedClass(p);
    syncAudioControls(p);

        video.addEventListener('loadedmetadata', () => {
          p.ready = true;
          updateScrub(p);
          updatePlayer(p);
        });
        video.addEventListener('loadeddata', () => {
          slot.classList.remove('is-loading');
          slot.classList.add('is-ready');
          updatePlayer(p);
        });
        video.addEventListener('play', () => { startScrubLoop(p); setPausedClass(p); syncAudioControls(p); });
        video.addEventListener('pause', () => { stopScrubLoop(p); updateScrub(p); setPausedClass(p); syncAudioControls(p); });
        video.addEventListener('ended', () => {
          if (!p.loop) p.userPaused = true;
          stopScrubLoop(p);
          updateScrub(p);
          setPausedClass(p);
        });
        video.addEventListener('waiting', () => slot.classList.add('is-loading'));
        video.addEventListener('canplay', () => slot.classList.remove('is-loading'));
        video.addEventListener('error', () => {
          if (slot.dataset.video !== src) return;
          slot.classList.remove('is-loading');
          slot.classList.add('is-ready');
        });
        video.addEventListener('webkitbeginfullscreen', () => beginNativeFullscreen(p));
        video.addEventListener('webkitendfullscreen', () => endNativeFullscreen(p));
        video.addEventListener('webkitpresentationmodechanged', () => {
          if (video.webkitPresentationMode === 'fullscreen') beginNativeFullscreen(p);
          else endNativeFullscreen(p);
        });

        speedBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!p.showSpeed) return;
          p.speedIdx = (p.speedIdx + 1) % SPEEDS.length;
          slot.dataset.videoSpeedIndex = String(p.speedIdx);
          applySpeed(p);
        });
        playBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (p.video.paused) {
            if (p.video.ended && !p.loop) p.video.currentTime = 0;
            p.userPaused = false;
          } else {
            p.userPaused = true;
          }
          updatePlayer(p);
          revealControls(p);
        });
        muteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!p.showAudio) return;
          p.userAudioTouched = true;
          const muted = p.video.muted || p.video.volume <= 0;
          if (muted) {
            p.video.volume = p.lastVolume;
            p.video.muted = false;
            p.video.removeAttribute('muted');
          } else {
            p.lastVolume = p.video.volume || p.lastVolume;
            p.video.muted = true;
            p.video.volume = 0;
            p.video.setAttribute('muted', '');
          }
          syncAudioControls(p);
          revealControls(p);
        });
        volume.addEventListener('input', () => {
          if (!p.showAudio) return;
          p.userAudioTouched = true;
          const next = clamp(Number(volume.value) / 100, 0, 1);
          p.video.volume = next;
          p.video.muted = next <= 0;
          if (next > 0) p.video.removeAttribute('muted');
          else p.video.setAttribute('muted', '');
          if (next > 0) p.lastVolume = next;
          syncAudioControls(p);
          revealControls(p);
        });
        scrub.addEventListener('input', () => {
          p.seeking = true;
          if (Number.isFinite(video.duration) && video.duration > 0) {
            video.currentTime = (Number(scrub.value) / 1000) * video.duration;
            if (p.video.ended && !p.loop) p.userPaused = false;
          }
          revealControls(p);
        });
        scrub.addEventListener('change', () => {
          p.seeking = false;
          updateScrub(p);
          updatePlayer(p);
        });
        fullBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isFullscreen(p)) {
            if (fullscreenElement() === slot) exitFullscreen();
            else exitNativeFullscreen(p);
          } else if (canFullscreen(p)) {
            maybeUnmuteOnFirstFullscreen(p);
            fullscreenPlayer = p;
            players.forEach(updatePlayer);
            const fs = requestFullscreen(p);
            if (fs && fs.catch) fs.catch(() => { fullscreenPlayer = null; scheduleRefresh(); });
          }
        });
        slot.addEventListener('click', (e) => {
          if (controls.contains(e.target) || speedBtn.contains(e.target)) return;
          if (touchish && !slot.classList.contains('is-controls') && !p.video.paused) {
            revealControls(p);
            return;
          }
          if (p.video.paused) {
            if (p.video.ended && !p.loop) p.video.currentTime = 0;
            p.userPaused = false;
          } else {
            p.userPaused = true;
          }
          updatePlayer(p);
          revealControls(p);
        });

        scheduleRefresh();
    return null;
  }

  function handleFullscreenChange() {
    const activeElement = fullscreenElement();
    const active = [...players].find((p) => p.slot === activeElement);
    fullscreenPlayer = active || null;
    if (fullscreenPlayer) fullscreenPlayer.userPaused = false;
    players.forEach(placeSpeedButton);
    scheduleRefresh();
  }
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
  window.addEventListener('scroll', scheduleRefresh, { passive: true });
  window.addEventListener('resize', scheduleRefresh);

  return { mount, destroy, refresh: scheduleRefresh, players };
})();

function probeVideoSlot(slot) {
  LucidVideo.mount(slot);
}
document.querySelectorAll('[data-video]').forEach(probeVideoSlot);
window.LucidVideo = LucidVideo;

function attachHorizontalSwipe(el, onPrev, onNext) {
  if (!el || !window.PointerEvent) return;
  let startX = 0, startY = 0, tracking = false, suppressClick = false;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || e.button) return;
    startX = e.clientX;
    startY = e.clientY;
    tracking = true;
  }, { passive: true });
  el.addEventListener('pointercancel', () => { tracking = false; }, { passive: true });
  el.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    suppressClick = true;
    if (dx < 0) onNext();
    else onPrev();
    setTimeout(() => { suppressClick = false; }, 0);
  }, { passive: true });
  el.addEventListener('click', (e) => {
    if (!suppressClick) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClick = false;
  }, true);
}

// ---------- real-world rollouts: 3 web tasks x 3 scenarios ----------
// Drop static/videos/<task>_<scenario>.mp4 and each cell auto-fills.
const ROLLOUTS = [
  { task: 'Stirring', id: 'stirring' },
  { task: 'Wiping',   id: 'wiping' },
  { task: 'Binning',  id: 'binning' },
];
const rgrid = document.getElementById('rollout-grid');
if (rgrid) {
  ROLLOUTS.forEach((t) => {
    let cells = '';
    for (let s = 1; s <= 3; s++) {
      const src = `static/videos/${t.id}_${s}.mp4`;
      cells +=
        `<div class="rollout-card rounded-lg overflow-hidden video-placeholder aspect-video bg-slate-100 flex items-center justify-center relative" data-video="${src}" data-video-label="${t.task} · Sc. ${s}">
           <div class="text-center px-2">
             <span class="text-[10px] font-semibold text-slate-500 block">${t.task} · Sc. ${s}</span>
           </div>
         </div>`;
    }
    const row = document.createElement('div');
    row.className = 'reveal';
    row.innerHTML =
      `<div class="rollout-head mb-2">
         <div class="text-sm font-bold text-ink">${t.task}
           <span class="text-[11px] font-normal text-slate-400">· 3 scenarios</span></div>
         <div class="rollout-controls" aria-label="${t.task} scenario controls">
           <button class="rollout-arrow" type="button" data-rollout-prev aria-label="Previous ${t.task} scenario">&#8249;</button>
           <button class="rollout-arrow" type="button" data-rollout-next aria-label="Next ${t.task} scenario">&#8250;</button>
         </div>
       </div>
       <div class="rollout-viewport">
         <div class="rollout-track">${cells}</div>
       </div>`;
    rgrid.appendChild(row);
    io.observe(row);

    const mq = window.matchMedia('(max-width: 767px)');
    const track = row.querySelector('.rollout-track');
    const prev = row.querySelector('[data-rollout-prev]');
    const next = row.querySelector('[data-rollout-next]');
    let ri = 0;
    function layoutRollout() {
      const maxIdx = mq.matches ? 1 : 0;
      ri = Math.min(ri, maxIdx);
      if (mq.matches) {
        const card = track.querySelector('.rollout-card');
        const cs = getComputedStyle(track);
        const gap = parseFloat(cs.columnGap) || parseFloat(cs.gap) || 0;
        const step = card ? card.getBoundingClientRect().width + gap : 0;
        track.style.transform = `translate3d(${-ri * step}px,0,0)`;
      } else {
        track.style.transform = '';
      }
      prev.disabled = ri <= 0;
      next.disabled = ri >= maxIdx;
      if (window.LucidVideo) window.LucidVideo.refresh();
    }
    prev.addEventListener('click', () => { ri = Math.max(0, ri - 1); layoutRollout(); });
    next.addEventListener('click', () => { ri = Math.min(1, ri + 1); layoutRollout(); });
    attachHorizontalSwipe(
      track,
      () => { ri = Math.max(0, ri - 1); layoutRollout(); },
      () => { ri = Math.min(1, ri + 1); layoutRollout(); },
    );
    track.addEventListener('transitionend', (e) => {
      if (e.propertyName === 'transform' && window.LucidVideo) window.LucidVideo.refresh();
    });
    window.addEventListener('resize', layoutRollout);
    if (mq.addEventListener) mq.addEventListener('change', layoutRollout);
    requestAnimationFrame(layoutRollout);
  });
  rgrid.querySelectorAll('[data-video]').forEach(probeVideoSlot);
}

// ---------- tabs (method, etc.) ----------
document.querySelectorAll('[data-tabs]').forEach((group) => {
  const btns = group.querySelectorAll('[data-tab]');
  const panels = group.querySelectorAll('[data-panel]');
  btns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.tab;
      btns.forEach((b) => b.classList.toggle('is-active', b === btn));
      panels.forEach((p) => (p.hidden = p.dataset.panel !== key));
    });
  });
});

// ---------- method diagram: inline SVG + element-level hover highlighting ----------
// Hovering any real part of the figure greys out (not fades) everything except the
// genuine SVG elements that make up that concept: the colored chip, its matching
// tokens in the transformer, the flow lines AND their query points in the scene,
// the wrist-depth thumbnail, etc. Matching is by the SVG's own fill/stroke colors
// and Figma group ids — no eyeballed rectangles.
(function () {
  const lc = (s) => (s || '').toLowerCase();
  const anyId = (ids, names) => names.some((n) => ids.has(n));
  const fillIn = (i, cols) => cols.indexOf(lc(i.fill)) >= 0;
  const strokeIn = (i, cols) => cols.indexOf(lc(i.stroke)) >= 0;

  // Each concept: a predicate over a leaf's {ids:Set of ancestor group ids, fill, stroke}.
  const CONCEPTS = {
    // ---- Stage 1: intent model. Each concept is its own named Figma group (claude_*).
    // The central transformer block wasn't grouped, so it keeps its original id. ----
    'method_intent.svg': [
      { t: 'Observation history', d: 'A short stack of the most recent RGB-D (color and depth) frames, the only input at deploy. No object mesh, no motion capture, just what the camera sees right now.', g: 'claude_obs_hist', noTrigBig: true, col: '#94A3B8' },
      { t: 'Query points', d: 'Points sampled on the target object in the current frame. The model is asked where each one goes next, and together they form the object-flow query.', g: 'claude_query_point', col: '#FF8400', hitPad: 14 },
      { t: 'Palm pose', d: 'The current 6-DoF pose (position and orientation) of the palm, fed in as a coarse anchor for the hand.', g: 'claude_palm_pose', col: '#7C00F0', hitPad: 16 },
      { t: 'Intent model', d: 'A point-token transformer (CoTracker3 backbone over frozen DINOv3 features) that predicts the next ~1 s of motion. Trained only on human video, with the demonstrator hand augmented away so it keys on the object.', g: 'claude_intent_model', col: '#4A7BA6' },
      { t: 'Object flow', d: 'The predicted 3D path of each query point over the next ~1 s, meaning where the object should move. It says nothing about fingers, so any embodiment can chase it.', g: 'claude_object_flow', col: '#FF8400', hitPad: 14 },
      { t: 'Reference palm pose', d: 'The predicted palm-pose trajectory, roughly where the hand should be and how it should be oriented to drive that motion.', g: 'claude_reference_palm', col: '#7C00F0', hitPad: 16 },
    ],
    // ---- Stage 2: tracking policy. Every concept is its own named Figma group
    // (claude_*), so matching is a pure name lookup — no colors, no heuristics. ----
    'method_tracking.svg': [
      { t: 'Occluded object flow', d: 'Object flow sampled over the full object surface, including points the camera cannot see. Only the simulator can supply this, so it is a privileged input the teacher alone receives.', g: 'claude_occluded_flow', col: '#0088FF', hitPad: 14 },
      { t: 'Visible object flow', d: 'Object flow restricted to the surface an external camera can see. Both policies get it, and it is all the student ever sees of the object.', g: 'claude_visible_flow', col: '#FF8400', hitPad: 14 },
      { t: 'Palm-pose reference', d: 'The palm-pose trajectory handed over by the intent model, the bridge between the two stages. The policy follows it loosely, deviating where its own embodiment needs to.', g: 'claude_palm_pose', col: '#7C00F0', hitPad: 16 },
      { t: 'Proprioception', d: 'The robot\'s own joint angles and previous joint targets, its sense of where its body currently is.', g: 'claude_proprioception', col: '#94A3B8' },
      { t: 'Wrist depth image', d: 'A wrist-mounted depth camera giving close-range geometry near the fingers. Student-only, and what lets it resolve contact the external camera misses.', g: 'claude_wrist_depth', col: '#C99A00' },
      { t: 'Teacher policy', d: 'Trained from scratch in simulation with PPO, reading privileged state (full-surface flow) no real robot could provide. Strong, but not yet deployable.', g: 'claude_teacher', col: '#E8806B' },
      { t: 'Teacher action', d: 'The teacher\'s command, arm motion plus a structured grasp, optimized against the PPO reward.', g: 'claude_teacher_action', col: '#E8806B' },
      { t: 'Student policy', d: 'Distilled from the teacher but reading only onboard sensing (visible flow and wrist depth). A hybrid objective, DAgger-style on-policy distillation plus a PPO term, lets it exploit its own inputs rather than just imitate. This is what deploys.', g: 'claude_student', col: '#4A7BA6' },
      { t: 'Student action', d: 'The action that actually runs on hardware, from cameras and proprioception alone.', g: 'claude_student_action', col: '#4A7BA6' },
      { t: 'Reward', d: 'One task-agnostic reward that tracks the object flow (the main signal), with palm-pose following and finger contact as shaping terms. No per-task tuning.', g: 'claude_rewards', col: '#0056C7', tipOnly: true },
      // The two training stages: just the description on hover, no pipeline highlight.
      { t: 'Stage 1 · Teacher RL', d: 'Train the teacher with PPO on privileged simulator state, namely full-surface object flow, the palm-pose reference, and proprioception. A curriculum ramps gravity, random perturbations, and success tolerances as it improves, so it never meets the full difficulty cold.',
        g: 'claude_stage_1', tipOnly: true, col: '#E8806B' },
      { t: 'Stage 2 · Student RL + DAgger', d: 'Distill the teacher into the student with a hybrid objective, a PPO term plus DAgger-style on-policy distillation. The privileged inputs are swapped for camera-visible flow and a wrist depth image, and realistic sensor noise is added so the policy survives the jump to a real robot.',
        g: 'claude_stage_2', tipOnly: true, col: '#4A7BA6' },
    ],
  };
  // A concept matches by `g` (one named group), `gs` (any of several), or its own `m`.
  Object.values(CONCEPTS).flat().forEach((cn) => {
    if (cn.g) cn.m = (i) => i.ids.has(cn.g);
    else if (cn.gs) cn.m = (i) => cn.gs.some((n) => i.ids.has(n));
  });

  const HINT_ANCHORS = {
    'method_intent.svg': { selector: '#claude_palm_pose [id="Ellipse 9"]' },
    'method_tracking.svg': { selector: '#claude_occluded_flow [id="Rectangle 2"]' },
  };
  const TOUCHISH = typeof matchMedia === 'function' && matchMedia('(hover: none), (pointer: coarse)').matches;

  // The tooltip follows the cursor with a tiny eased lag. That keeps it attached to
  // the pointer without amplifying every sub-pixel hand jitter.
  let tipEl, tipX = 0, tipY = 0, tipTx = 0, tipTy = 0, tipRaf = 0, tipPrimed = false, tipActive = false;
  function tip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement('div');
    tipEl.style.cssText = 'position:fixed;z-index:95;pointer-events:none;opacity:0;left:0;top:0;will-change:transform;' +
      'transition:opacity .16s ease;' +
      'background:#fff;border-radius:12px;width:max-content;max-width:min(256px, calc(100vw - 20px));padding:11px 14px 12px;' +
      'border:1px solid rgba(15,23,42,.06);box-shadow:0 1px 1px rgba(15,23,42,.04), 0 8px 16px -6px rgba(15,23,42,.16), 0 24px 40px -16px rgba(15,23,42,.22);' +
      "font-family:'Inter',system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;";
    document.body.appendChild(tipEl);
    return tipEl;
  }
  function showTip(title, desc, col) {
    const t = tip();
    t.innerHTML =
      `<div style="font-size:9.5px;font-weight:700;letter-spacing:0;text-transform:uppercase;color:${col || '#94A3B8'};margin-bottom:4px">${title}</div>` +
      `<div style="font-size:12.5px;line-height:1.5;color:#1e293b;font-weight:450">${desc}</div>`;
    tipActive = true;
    t.style.opacity = '1';
  }
  function paintTip() {
    tip().style.transform = `translate3d(${Math.round(tipX)}px, ${Math.round(tipY)}px, 0)`;
  }
  function animateTip() {
    const dx = tipTx - tipX, dy = tipTy - tipY;
    tipX += dx * 0.24;
    tipY += dy * 0.24;
    if (Math.abs(dx) < 0.45 && Math.abs(dy) < 0.45) {
      tipX = tipTx;
      tipY = tipTy;
      paintTip();
      tipRaf = 0;
      return;
    }
    paintTip();
    tipRaf = tipActive ? requestAnimationFrame(animateTip) : 0;
  }
  function moveTip(e) {
    const t = tip();
    const tw = t.offsetWidth, th = t.offsetHeight;
    const pad = 10;
    let x = e.clientX + 18, y = e.clientY + 18;
    if (x + tw > innerWidth - pad) x = e.clientX - tw - 18;   // flip left near the right edge
    if (y + th > innerHeight - pad) y = e.clientY - th - 18;  // flip up near the bottom
    x = Math.min(Math.max(x, pad), Math.max(pad, innerWidth - tw - pad));
    y = Math.min(Math.max(y, pad), Math.max(pad, innerHeight - th - pad));
    tipTx = x;
    tipTy = y;
    if (!tipPrimed) {
      tipX = tipTx;
      tipY = tipTy;
      tipPrimed = true;
      paintTip();
      return;
    }
    if (!tipRaf) tipRaf = requestAnimationFrame(animateTip);
  }
  function hideTip() {
    tipActive = false;
    tipPrimed = false;
    if (tipRaf) cancelAnimationFrame(tipRaf);
    tipRaf = 0;
    if (tipEl) tipEl.style.opacity = '0';
  }

  const SVGNS = 'http://www.w3.org/2000/svg';
  const LEAF = 'path,rect,circle,ellipse,image,line,polygon,polyline';
  const POP = 'scale(1.035)';  // hovered shapes enlarge slightly in place (around their own centre)
  const VEIL = 0.62;           // white wash opacity: blacks fade to grey, whites stay white
  // nearest ancestor <g> that carries the Figma drop-shadow filter — the self-contained
  // shape unit (rect+border, dot+ring, ...) we clone to the top so the pop never clips.
  function filterGroup(el, svg) {
    let p = el.parentNode;
    while (p && p !== svg) { if (p.tagName && String(p.tagName).toLowerCase() === 'g' && p.getAttribute('filter')) return p; p = p.parentNode; }
    return null;
  }
  function svgBox(el) {
    try {
      const b = el.getBBox();
      if (Number.isFinite(b.x) && Number.isFinite(b.y)) return b;
    } catch (e) {}
    const shape = (el.matches && el.matches('rect,circle,ellipse')) ? el : (el.querySelector && el.querySelector('rect,circle,ellipse'));
    if (!shape) return null;
    const tag = shape.tagName.toLowerCase();
    if (tag === 'rect') {
      return {
        x: parseFloat(shape.getAttribute('x') || '0'),
        y: parseFloat(shape.getAttribute('y') || '0'),
        width: parseFloat(shape.getAttribute('width') || '0'),
        height: parseFloat(shape.getAttribute('height') || '0'),
      };
    }
    const cx = parseFloat(shape.getAttribute('cx') || '0');
    const cy = parseFloat(shape.getAttribute('cy') || '0');
    const rx = parseFloat(shape.getAttribute(tag === 'circle' ? 'r' : 'rx') || '0');
    const ry = parseFloat(shape.getAttribute(tag === 'circle' ? 'r' : 'ry') || '0');
    return { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
  }
  function positionHint(hint, svg, key) {
    const anchor = HINT_ANCHORS[key];
    const target = anchor && svg.querySelector(anchor.selector);
    const box = target && svgBox(target);
    const vb = svg.viewBox.baseVal;
    if (!box || !vb || !vb.width || !vb.height) return;
    const x = box.x + box.width * (anchor.fx || 0.5);
    const y = box.y + box.height * (anchor.fy || 0.5);
    hint.style.setProperty('--hint-x', `${((x - vb.x) / vb.width) * 100}%`);
    hint.style.setProperty('--hint-y', `${((y - vb.y) / vb.height) * 100}%`);
  }

  function setup(c, svgText) {
    c.innerHTML = svgText;
    const svg = c.querySelector('svg');
    if (!svg) return;
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.style.width = '100%'; svg.style.height = 'auto'; svg.style.display = 'block';
    svg.style.overflow = 'visible';   // let an edge box's pop spill past the viewBox instead of clipping
    const concepts = CONCEPTS[c.dataset.key];
    if (!concepts) return;

    // content layer = the root frame group; we desaturate + veil THIS while the
    // hovered shapes ride above it as crisp, coloured clones.
    const frame = svg.querySelector('g');
    if (frame) frame.style.transition = 'filter .18s ease';

    const vbArea = (svg.viewBox.baseVal ? svg.viewBox.baseVal.width * svg.viewBox.baseVal.height : 0) || 1;
    const leaves = [...svg.querySelectorAll(LEAF)];
    const meta = new Map();
    leaves.forEach((el) => {
      el.classList.add('mleaf');
      const ids = new Set(); let p = el.parentNode;
      while (p && p !== svg) { if (p.tagName && String(p.tagName).toLowerCase() === 'g' && p.id) ids.add(p.id); p = p.parentNode; }
      let area = 0, bb = null; try { bb = el.getBBox(); area = (bb.width * bb.height) / vbArea; } catch (e) {}
      meta.set(el, { ids, fill: el.getAttribute('fill') || '', stroke: el.getAttribute('stroke') || '', area, bb });
    });

    // Each concept -> the set of shape-groups (clone units) that make it up.
    // A leaf can be in the highlight set but excluded as a hover *trigger* (e.g. the
    // big scene photo: it lights up with obs-history but shouldn't grab the hover,
    // so the query points / palm pose drawn on top stay reachable).
    const leafConcept = new Map();
    const solid = (f) => { f = (f || '').toLowerCase(); return f && f !== 'none' && f !== 'transparent' && f.indexOf('url(') < 0; };
    const thinTags = new Set(['path', 'line', 'polyline', 'polygon']);
    function shouldBoostHit(el, m) {
      const tag = el.tagName.toLowerCase();
      if (!m || !m.bb || tag === 'image') return false;
      const minDim = Math.min(m.bb.width || 0, m.bb.height || 0);
      const maxDim = Math.max(m.bb.width || 0, m.bb.height || 0);
      if (thinTags.has(tag)) return solid(m.stroke) && (m.area < 0.045 || minDim < 22);
      if (tag === 'circle' || tag === 'ellipse') return m.area < 0.012 || maxDim < 48;
      if (tag === 'rect') return m.area < 0.012 && maxDim < 92;
      return false;
    }
    function addHitPad(el, ci, pad) {
      const tag = el.tagName.toLowerCase();
      const hr = el.cloneNode(false);
      hr.removeAttribute('id');
      hr.removeAttribute('filter');
      hr.setAttribute('aria-hidden', 'true');
      hr.setAttribute('focusable', 'false');
      hr.classList.add('mleaf', 'mhit-pad');
      hr.dataset.mconcept = String(ci);
      if (thinTags.has(tag)) {
        const sw = parseFloat(el.getAttribute('stroke-width') || '0') || 0;
        hr.setAttribute('fill', 'none');
        hr.setAttribute('stroke', 'transparent');
        hr.setAttribute('stroke-width', String(Math.max(sw + pad * 2, pad * 2)));
        if (!hr.getAttribute('stroke-linecap')) hr.setAttribute('stroke-linecap', 'round');
        if (!hr.getAttribute('stroke-linejoin')) hr.setAttribute('stroke-linejoin', 'round');
        hr.style.pointerEvents = 'stroke';
      } else {
        if (tag === 'circle') {
          const r = parseFloat(el.getAttribute('r') || '0') || 0;
          hr.setAttribute('r', String(r + pad));
        } else if (tag === 'ellipse') {
          const rx = parseFloat(el.getAttribute('rx') || '0') || 0;
          const ry = parseFloat(el.getAttribute('ry') || '0') || 0;
          hr.setAttribute('rx', String(rx + pad));
          hr.setAttribute('ry', String(ry + pad));
        } else if (tag === 'rect') {
          const x = parseFloat(el.getAttribute('x') || '0') || 0;
          const y = parseFloat(el.getAttribute('y') || '0') || 0;
          const w = parseFloat(el.getAttribute('width') || '0') || 0;
          const h = parseFloat(el.getAttribute('height') || '0') || 0;
          hr.setAttribute('x', String(x - pad));
          hr.setAttribute('y', String(y - pad));
          hr.setAttribute('width', String(w + pad * 2));
          hr.setAttribute('height', String(h + pad * 2));
        }
        hr.setAttribute('fill', 'transparent');
        hr.setAttribute('stroke', 'none');
        hr.style.pointerEvents = 'all';
      }
      el.parentNode.appendChild(hr);
      leafConcept.set(hr, ci);
    }
    concepts.forEach((cn, ci) => {
      const groups = new Set();
      const hitPads = [];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, any = false;
      let boxLeaf = null, boxArea = -1;
      leaves.forEach((el) => {
        const m = meta.get(el);
        let hit = false; try { hit = cn.m(m); } catch (e) {}
        if (!hit) return;
        groups.add(filterGroup(el, svg) || el);    // clone the shape group (or the leaf if loose)
        // the "main box" = the biggest solid-filled rect (chip / bar / block); only IT enlarges
        if (el.tagName.toLowerCase() === 'rect' && solid(m.fill) && m.area > boxArea) { boxArea = m.area; boxLeaf = el; }
        if (m.bb) { any = true; x0 = Math.min(x0, m.bb.x); y0 = Math.min(y0, m.bb.y); x1 = Math.max(x1, m.bb.x + m.bb.width); y1 = Math.max(y1, m.bb.y + m.bb.height); }
        if (cn.noTrigBig && m.area > 0.08) return;   // highlight-only, not a trigger
        if (!leafConcept.has(el)) {
          leafConcept.set(el, ci);
          el.dataset.mconcept = String(ci);
        }
        if (cn.hitPad && shouldBoostHit(el, m)) hitPads.push(el);
      });
      cn._groups = [...groups];
      cn._box = boxLeaf ? (filterGroup(boxLeaf, svg) || boxLeaf) : null;
      hitPads.forEach((el) => addHitPad(el, ci, cn.hitPad));
      // tip-only concepts are thin text labels — give them a transparent hit-rect over
      // the whole label so the pointer doesn't have to land exactly on a glyph.
      if (cn.tipOnly && any) {
        const pad = 8, hr = document.createElementNS(SVGNS, 'rect');
        hr.setAttribute('x', x0 - pad); hr.setAttribute('y', y0 - pad);
        hr.setAttribute('width', (x1 - x0) + 2 * pad); hr.setAttribute('height', (y1 - y0) + 2 * pad);
        hr.setAttribute('fill', 'transparent'); hr.style.pointerEvents = 'all';
        hr.classList.add('mleaf'); hr.dataset.mconcept = String(ci); svg.appendChild(hr); leafConcept.set(hr, ci);
      }
    });

    // A single flat white veil over everything: a uniform wash (no per-element
    // transparency, so nothing ghosts through), painted above the frame.
    const vb = svg.viewBox.baseVal;
    const veil = document.createElementNS(SVGNS, 'rect');
    veil.setAttribute('x', vb ? vb.x : 0); veil.setAttribute('y', vb ? vb.y : 0);
    veil.setAttribute('width', vb ? vb.width : '100%'); veil.setAttribute('height', vb ? vb.height : '100%');
    veil.setAttribute('fill', '#ffffff');
    veil.style.cssText = 'opacity:0;pointer-events:none;transition:opacity .18s ease';
    svg.appendChild(veil);

    // A playful nudge on the diagram edge. It feels more like a tiny "try me"
    // callout than a generic cursor badge, and it disappears on first interaction.
    const hint = document.createElement('div');
    hint.className = 'method-hint';
    hint.innerHTML =
      '<span class="method-hint__icon" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3l6.5 16 2.3-6.9L19.5 9.5z"/></svg>' +
      '</span>' +
      `<span class="method-hint__text">${TOUCHISH ? 'Tap me' : 'Try me'}</span>`;
    c.appendChild(hint);
    positionHint(hint, svg, c.dataset.key);

    let hintDismissed = false;
    function dismissHint() {
      if (hintDismissed) return;
      hintDismissed = true;
      hint.classList.add('popout');
      setTimeout(() => hint.classList.add('gone'), 360);
    }

    let clones = [];
    function dropClones() { clones.forEach((n) => n.remove()); clones = []; }
    function activate(ci) {
      dropClones();
      dismissHint();                                    // first interaction dismisses the hint
      if (concepts[ci].tipOnly) {                        // stage labels: description only, no dimming
        if (frame) frame.style.filter = '';
        veil.style.opacity = '0';
        return;
      }
      if (frame) frame.style.filter = 'grayscale(1)';   // de-colour the underlying diagram
      veil.style.opacity = String(VEIL);                // ...and fade it toward white
      const box = concepts[ci]._box;
      concepts[ci]._groups.forEach((g) => {             // re-draw the hovered shapes on top, crisp
        const cl = g.cloneNode(true);
        cl.style.cssText = 'pointer-events:none;transform-box:fill-box;transform-origin:center;transition:transform .18s ease';
        svg.appendChild(cl); clones.push(cl);
        if (g === box) { void cl.getBoundingClientRect(); cl.style.transform = POP; }   // only the main box enlarges (reflow first so it animates)
      });
    }
    function clearAll() {
      dropClones();
      if (frame) frame.style.filter = '';
      veil.style.opacity = '0';
    }

    // Which concept is under (or near) the pointer.
    //
    // Important detail: inflated transparent hit pads make tiny dots/lines easier to
    // enter, but they must never beat a real painted SVG shape. We inspect the whole
    // element stack, prefer visible originals, and only then fall back to pads. When
    // the current concept is still within a small comfort radius, keep it active so
    // dashed flow lines and palm-pose arrows don't chatter as the cursor skims them.
    function conceptStackAt(x, y) {
      const stack = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [document.elementFromPoint(x, y)];
      const originals = [], pads = [];
      stack.forEach((el) => {
        const m = el && el.closest ? el.closest('.mleaf') : null;
        if (!m || !svg.contains(m) || !leafConcept.has(m)) return;
        const ci = leafConcept.get(m);
        (m.classList.contains('mhit-pad') ? pads : originals).push(ci);
      });
      return { original: originals[0], pad: pads[0], pads };
    }
    function pointHitsCurrent(x, y, current) {
      const h = conceptStackAt(x, y);
      return h.original === current || h.pads.indexOf(current) >= 0;
    }
    function conceptAt(x, y, current = -1) {
      const direct = conceptStackAt(x, y);
      if (direct.original !== undefined) return direct.original;          // real pixels win
      if (current !== -1 && direct.pads.indexOf(current) >= 0) return current;

      // Stickiness only preserves the active concept; it does not let neighboring
      // inflated pads steal hover from a visually separate target.
      const STICK_RING = [[0, 0], [10, 0], [-10, 0], [0, 10], [0, -10], [8, 8], [8, -8], [-8, 8], [-8, -8], [16, 0], [-16, 0], [0, 16], [0, -16]];
      if (current !== -1) {
        for (const [dx, dy] of STICK_RING) {
          if (pointHitsCurrent(x + dx, y + dy, current)) return current;
        }
      }

      if (direct.pad !== undefined) return direct.pad;

      // For a new concept, use a smaller ring than before and still prefer real
      // painted shapes before pads. This keeps dots/lines approachable without
      // creating invisible overlap between adjacent concepts.
      const ENTER_RING = [[8, 0], [-8, 0], [0, 8], [0, -8], [6, 6], [6, -6], [-6, 6], [-6, -6]];
      for (const [dx, dy] of ENTER_RING) {
        const h = conceptStackAt(x + dx, y + dy);
        if (h.original !== undefined) return h.original;
      }
      for (const [dx, dy] of ENTER_RING) {
        const h = conceptStackAt(x + dx, y + dy);
        if (h.pad !== undefined) return h.pad;
      }
      return undefined;
    }

    // Leaving a concept onto neutral space ends the hover after a short grace period.
    // The timer is armed once and NOT reset by further neutral moves, so it fires even
    // while the cursor keeps moving (only landing on a concept cancels it) — a brief
    // skim across a gap on the way to another part won't flicker.
    let cur = -1, timer = 0, pending = false;
    c.addEventListener('mousemove', (e) => {
      const ci = conceptAt(e.clientX, e.clientY, cur);
      if (ci === undefined) {
        c.style.cursor = '';
        if (cur !== -1 && !pending) { pending = true; timer = setTimeout(() => { cur = -1; pending = false; clearAll(); hideTip(); }, 220); }
        return;
      }
      if (pending) { clearTimeout(timer); pending = false; }
      c.style.cursor = 'pointer';
      if (ci !== cur) { cur = ci; activate(ci); showTip(concepts[ci].t, concepts[ci].d, concepts[ci].col); }
      moveTip(e);   // follow the cursor
    });
    c.addEventListener('click', (e) => {
      if (!TOUCHISH) return;
      const ci = conceptAt(e.clientX, e.clientY, cur);
      clearTimeout(timer);
      pending = false;
      if (ci === undefined) {
        cur = -1;
        c.style.cursor = '';
        clearAll();
        hideTip();
        return;
      }
      cur = ci;
      c.style.cursor = 'pointer';
      activate(ci);
      showTip(concepts[ci].t, concepts[ci].d, concepts[ci].col);
      moveTip(e);
    });
    c.addEventListener('mouseleave', () => { clearTimeout(timer); pending = false; cur = -1; c.style.cursor = ''; clearAll(); hideTip(); });
    // scrolling moves the diagram out from under the cursor without firing mousemove,
    // so the highlight + anchored tooltip would be left stranded — just dismiss on scroll.
    window.addEventListener('scroll', () => {
      if (cur !== -1 || pending) { clearTimeout(timer); pending = false; cur = -1; c.style.cursor = ''; clearAll(); hideTip(); }
    }, { passive: true });
  }

  document.querySelectorAll('.method-svg').forEach((c) => {
    fetch('static/images/' + c.dataset.key, { cache: 'no-cache' })  // always revalidate so updated diagrams load
      .then((r) => r.text())
      .then((t) => setup(c, t))
      .catch(() => {});  // file:// fallback: the <img> already in the container stays visible
  });
})();

// ---------- interactive scaling (slider -> chart marker + checkpoint video) ----------
(function () {
  const slider = document.getElementById('scale-slider');
  const chart = document.getElementById('scale-chart');
  const vbox = document.getElementById('scale-video');
  if (!slider || !chart || !vbox || !window.LucidCharts) return;

  const ro = document.getElementById('scale-readout');
  const CK = [
    { label: '2k',  clips: 2000,  video: 'static/videos/scale_2k.mp4' },
    { label: '5k',  clips: 5000,  video: 'static/videos/scale_5k.mp4' },
    { label: '20k', clips: 20000, video: 'static/videos/scale_20k.mp4' },
  ];

  function placeholder(c) {
    if (window.LucidVideo) window.LucidVideo.destroy(vbox);
    delete vbox.dataset.video;
    delete vbox.dataset.videoLabel;
    delete vbox.dataset.videoLabelVisible;
    vbox.innerHTML =
      `<div class="text-center px-4">
         <div class="text-xs font-semibold text-slate-500 mb-1">Binning · ${c.label} clips</div>
         <div class="text-[11px] font-mono text-slate-400">${c.video}</div>
       </div>`;
  }

  function setVideo(c) {
    if (vbox.dataset.video === c.video && vbox._lucidPlayer) return;
    const currentSpeedIdx = vbox._lucidPlayer
      ? vbox._lucidPlayer.speedIdx
      : Number(vbox.dataset.videoSpeedIndex);
    if (window.LucidVideo) window.LucidVideo.destroy(vbox);
    vbox.innerHTML = '';
    vbox.dataset.video = c.video;
    vbox.dataset.videoLabel = `${c.label} clips`;
    vbox.dataset.videoLabelVisible = 'always';
    if (Number.isInteger(currentSpeedIdx) && currentSpeedIdx >= 0) {
      vbox.dataset.videoSpeedIndex = String(currentSpeedIdx);
    }
    probeVideoSlot(vbox);
  }

  const SCALING = window.LucidCharts.SCALING, COL = window.LucidCharts.C;
  // continuous clips for an arbitrary slider value (log-interpolated between checkpoints)
  function clipsFor(v) {
    const seg = Math.min(1, Math.floor(v)), f = v - seg;
    const A = CK[seg], B = CK[seg + 1] || CK[seg];
    return Math.pow(10, Math.log10(A.clips) + f * (Math.log10(B.clips) - Math.log10(A.clips)));
  }
  let curIdx = -1;
  function setContent(idx) {           // video + readout latch to the nearest checkpoint
    const c = CK[idx], d = SCALING.find((x) => x.clips === c.clips);
    setVideo(c);
    if (ro && d) ro.innerHTML =
      `<span style="color:${COL.ink}">${c.label} clips</span>` +
      ` <span style="color:#cbd5e1">·</span> ` +
      `<span style="color:${COL.blue}">${Math.round(d.success * 100)}% success</span>` +
      ` <span style="color:#cbd5e1">·</span> ` +
      `<span style="color:${COL.mustard}">loss ${d.loss.toFixed(2)}</span>`;
  }
  window.LucidCharts.drawScalingChart(chart, CK[0].clips);   // draw the chart once

  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    window.LucidCharts.updateScalingMarker(chart, clipsFor(v));  // dashed marker glides
    const idx = Math.round(v);
    if (idx !== curIdx) { curIdx = idx; setContent(idx); }       // content latches
  });
  // on release, glide both the thumb AND the marker to the nearest checkpoint
  let raf = 0;
  slider.addEventListener('change', () => {
    const target = Math.round(parseFloat(slider.value));
    const start = parseFloat(slider.value), t0 = performance.now();
    cancelAnimationFrame(raf);
    (function step(now) {
      const p = Math.min(1, (now - t0) / 260);
      const e = 1 - Math.pow(1 - p, 3);           // easeOutCubic
      const v = start + (target - start) * e;
      slider.value = String(v);
      window.LucidCharts.updateScalingMarker(chart, clipsFor(v));
      if (p < 1) raf = requestAnimationFrame(step);
    })(performance.now());
  });
  curIdx = 0; setContent(0); slider.value = 0;
})();

// ---------- FAQ accordion (smooth) ----------
document.querySelectorAll('.faq-item').forEach((item) => {
  const q = item.querySelector('.faq-q');
  const a = item.querySelector('.faq-a');
  const icon = item.querySelector('.faq-icon');
  q.addEventListener('click', () => {
    const open = a.style.gridTemplateRows === '1fr';
    a.style.gridTemplateRows = open ? '0fr' : '1fr';
    if (icon) icon.style.transform = open ? 'rotate(0deg)' : 'rotate(45deg)';
  });
});

// ---------- violin success charts (embodiment + open/closed) ----------
(function () {
  if (!window.LucidCharts) return;
  const { drawViolinChart, SUCCESS_WEB, SUCCESS_SELF, C } = window.LucidCharts;
  const emb = document.getElementById('emb-chart');
  if (emb) drawViolinChart(emb, SUCCESS_SELF, [
    { key: 'a', color: C.blue,  label: 'Dexterous hand' },
    { key: 'b', color: C.coral, label: 'Parallel-jaw gripper' },
  ], { groupLabel: '(B) Self-collected tasks' });
  const owc = document.getElementById('owc-chart');
  if (owc) drawViolinChart(owc, SUCCESS_WEB, [
    { key: 'a', color: C.blue, label: 'LUCID (closed-loop)' },
    { key: 'b', color: C.sage, label: 'Open-loop planner' },
  ], { groupLabel: '(A) Web-scraped tasks · 3 scenarios each' });
})();

// ---------- failure cases rail ----------
// Keep this list aligned with the non-empty folders in video_sources/failure_cases.
const FAILURE_TAGS = {
  'Perception loss': 'color:#4A7BA6;background:rgba(74,123,166,.10);border-color:rgba(74,123,166,.22)',
  Unrecoverable: 'color:#C97B7B;background:rgba(201,123,123,.10);border-color:rgba(201,123,123,.22)',
  'Incorrect behavior': 'color:#A97700;background:rgba(232,184,74,.16);border-color:rgba(232,184,74,.34)',
};
const FAILURES = [
  { img: 'stirring_1', task: 'Stirring', tag: 'Perception loss', reason: 'The spoon is occluded by the hand and pot, and SAM 3.1 loses it.' },
  { img: 'wiping_1', task: 'Wiping', tag: 'Unrecoverable', reason: 'The wipe starts, the towel falls out of the hand, and the hand presses into the table.' },
  { img: 'binning_1', task: 'Binning', tag: 'Unrecoverable', reason: 'The grasp slips and the apple falls out.' },
  { img: 'binning_3', task: 'Binning', tag: 'Unrecoverable', reason: 'The grasp slips and the ball falls off the table.' },
  { img: 'cable_routing', task: 'Cable routing', tag: 'Incorrect behavior', reason: 'The dexterous hand is unable to grasp the cable and gets stuck.' },
];
// Responsive carousel with prev/next arrows (non-looping); reason shown as a caption.
const ftrack = document.getElementById('failure-track');
if (ftrack) {
  const GAP = 16;
  const mqFail = window.matchMedia('(max-width: 767px)');
  FAILURES.forEach((f) => {
    const card = document.createElement('div');
    const tagStyle = FAILURE_TAGS[f.tag] || FAILURE_TAGS['Incorrect behavior'];
    const videoSrc = `static/videos/failures/${f.img}.mp4`;
    card.className = 'failure-card shrink-0';
    card.innerHTML =
      `<div class="fc-media failure-video-slot rounded-xl overflow-hidden border border-slate-200 aspect-video flex flex-col items-center justify-center relative" data-video="${videoSrc}" data-video-label="${f.task} · Failure" aria-label="${f.task} failure video">
         <div class="failure-video-play" aria-hidden="true"></div>
         <div class="mt-3 text-center px-4">
           <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">${f.task}</div>
           <div class="text-[11px] font-semibold text-slate-400 mt-0.5">Failure clip</div>
         </div>
         <div class="failure-video-timeline" aria-hidden="true"></div>
       </div>
       <div class="mt-2">
         <div class="flex items-center gap-2 mb-1.5" style="flex-wrap:wrap">
           <div class="text-xs font-bold text-ink" style="min-width:0">${f.task}</div>
           <span class="inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold leading-none" style="${tagStyle};max-width:100%">${f.tag}</span>
         </div>
         <div class="text-[12px] text-slate-500 leading-snug">${f.reason}</div>
       </div>`;
    ftrack.appendChild(card);
  });
  ftrack.querySelectorAll('[data-video]').forEach(probeVideoSlot);
  const prev = document.getElementById('fail-prev'), next = document.getElementById('fail-next');
  let fi = 0;
  function layout() {
    const visible = mqFail.matches ? 2 : 3;
    const maxIdx = Math.max(0, FAILURES.length - visible);
    const cw = ftrack.parentElement.clientWidth;
    const w = (cw - (visible - 1) * GAP) / visible;
    fi = Math.min(fi, maxIdx);
    ftrack.querySelectorAll('.failure-card').forEach((c) => (c.style.width = w + 'px'));
    ftrack.style.transform = `translateX(${-fi * (w + GAP)}px)`;
    if (prev) { prev.disabled = fi <= 0; prev.style.opacity = fi <= 0 ? '0.35' : '1'; }
    if (next) { next.disabled = fi >= maxIdx; next.style.opacity = fi >= maxIdx ? '0.35' : '1'; }
    if (window.LucidVideo) window.LucidVideo.refresh();
  }
  if (prev) prev.addEventListener('click', () => { fi = Math.max(0, fi - 1); layout(); });
  function nextFailure() {
    const visible = mqFail.matches ? 2 : 3;
    fi = Math.min(Math.max(0, FAILURES.length - visible), fi + 1);
    layout();
  }
  if (next) next.addEventListener('click', nextFailure);
  attachHorizontalSwipe(ftrack, () => { fi = Math.max(0, fi - 1); layout(); }, nextFailure);
  window.addEventListener('resize', layout);
  ftrack.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'transform' && window.LucidVideo) window.LucidVideo.refresh();
  });
  if (mqFail.addEventListener) mqFail.addEventListener('change', layout);
  layout();
}

// ---------- external links (fill these once live) ----------
const LINKS = {
  paper: 'static/paper.pdf',
  arxiv: '#',  // e.g. 'https://arxiv.org/abs/XXXX.XXXXX'
  code:  '#',  // e.g. 'https://github.com/hgupt3/lucid'
  video: '#',  // e.g. 'https://youtu.be/XXXXXXXX'
};
document.querySelectorAll('[data-link]').forEach((a) => {
  const url = LINKS[a.dataset.link];
  if (url && url !== '#') {
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
  } else {
    // no link yet: mark as "soon" and stop the jump-to-top
    a.classList.add('opacity-50', 'cursor-not-allowed');
    a.setAttribute('aria-disabled', 'true');
    a.addEventListener('click', (e) => e.preventDefault());
    // only the hero buttons get a "soon" badge; sticky-bar icons stay bare
    if (a.classList.contains('hero-action')) {
      const badge = document.createElement('span');
      badge.className = 'ml-1 text-[9px] font-bold uppercase tracking-wider opacity-70';
      badge.dataset.soonBadge = '';
      badge.textContent = 'soon';
      a.appendChild(badge);
    }
  }
});
