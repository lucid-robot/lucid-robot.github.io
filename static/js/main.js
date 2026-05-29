// ---------- dark mode ----------
const root = document.documentElement;
const stored = localStorage.getItem('lucid-theme');
if (stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  root.classList.add('dark');
}
document.getElementById('theme-toggle').addEventListener('click', () => {
  root.classList.toggle('dark');
  localStorage.setItem('lucid-theme', root.classList.contains('dark') ? 'dark' : 'light');
});

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

// ---------- copy bibtex ----------
const copyBtn = document.getElementById('copy-bib');
copyBtn.addEventListener('click', async () => {
  const text = document.getElementById('bib-text').innerText;
  try {
    await navigator.clipboard.writeText(text);
    const old = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => (copyBtn.textContent = old), 1500);
  } catch (_) {
    copyBtn.textContent = 'Press ⌘C';
  }
});

// ---------- generic video slots ----------
// Any element with data-video="path.mp4" becomes a looping muted video the
// moment that file exists on disk. No HTML edits needed to add footage.
document.querySelectorAll('[data-video]').forEach((slot) => {
  const src = slot.dataset.video;
  fetch(src, { method: 'HEAD' })
    .then((r) => {
      if (!r.ok) return;
      const v = document.createElement('video');
      v.src = src;
      v.autoplay = v.muted = v.loop = v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.className = 'absolute inset-0 w-full h-full object-cover z-20';
      slot.classList.add('relative');
      slot.appendChild(v);
    })
    .catch(() => {});
});

// ---------- task video grid ----------
// Each task: drop a clip at static/videos/<id>.mp4 and it auto-renders as a
// looping muted video instead of the placeholder.
const TASKS = [
  { id: 'stirring', name: 'Stirring', tag: 'Internet video', color: 'blue' },
  { id: 'wiping',   name: 'Wiping',   tag: 'Internet video', color: 'blue' },
  { id: 'binning',  name: 'Binning',  tag: 'Internet video', color: 'blue' },
  { id: 'push_t',   name: 'Push-T',   tag: 'Smartphone video', color: 'coral' },
  { id: 'cable',    name: 'Cable routing', tag: 'Smartphone video', color: 'coral' },
];

const TAG_COLOR = {
  blue:  'bg-blue-brand',
  coral: 'bg-coral-brand',
  sage:  'bg-sage-brand',
};

const grid = document.getElementById('task-grid');
TASKS.forEach((t) => {
  const card = document.createElement('div');
  card.className = 'reveal group rounded-xl overflow-hidden ring-1 ring-slate-200 dark:ring-white/10 bg-white dark:bg-white/5';
  card.innerHTML = `
    <div class="relative aspect-video video-placeholder bg-slate-100 dark:bg-white/5 flex items-center justify-center">
      <video class="absolute inset-0 w-full h-full object-cover hidden" autoplay muted loop playsinline></video>
      <div class="ph text-center px-4">
        <svg class="w-8 h-8 mx-auto text-slate-300 mb-2" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        <p class="text-xs text-slate-400 font-mono">static/videos/${t.id}.mp4</p>
      </div>
    </div>
    <div class="px-4 py-3 flex items-center justify-between">
      <span class="font-semibold text-sm">${t.name}</span>
      <span class="text-[11px] font-medium text-white ${TAG_COLOR[t.color]} rounded-full px-2.5 py-0.5">${t.tag}</span>
    </div>`;
  grid.appendChild(card);
  io.observe(card);

  // probe for a real video; swap in if present
  const vid = card.querySelector('video');
  const ph = card.querySelector('.ph');
  const src = `static/videos/${t.id}.mp4`;
  fetch(src, { method: 'HEAD' })
    .then((r) => {
      if (r.ok) {
        vid.src = src;
        vid.classList.remove('hidden');
        ph.classList.add('hidden');
      }
    })
    .catch(() => {});
});

// ---------- external links (fill these once live) ----------
const LINKS = {
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
    const badge = document.createElement('span');
    badge.className = 'ml-1 text-[9px] font-bold uppercase tracking-wider opacity-70';
    badge.textContent = 'soon';
    a.appendChild(badge);
  }
});
