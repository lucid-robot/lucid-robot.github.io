// ---------------------------------------------------------------------------
// Hand-rolled SVG charts for LUCID, matched to the paper figures
// (figures/success_violins.py and figures/scaling_binning.py).
// ---------------------------------------------------------------------------
const C = {
  blue:    '#4A7BA6',  // y2r  — LUCID / real-world success
  sage:    '#7FB069',  // alt1 — open-loop planner
  coral:   '#C97B7B',  // alt2 — parallel-jaw gripper
  mustard: '#E8B84A',  // baseline — intent loss
  grid:    '#D8D8D8',
  spine:   '#333333',
  ink:     '#0d1117',
  muted:   '#64748b',
};
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, parent = null) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

// ---- shared hover tooltip ----
let _tip;
let _tipSuppressUntil = 0;
function tip() {
  if (_tip) return _tip;
  _tip = document.createElement('div');
  _tip.style.cssText =
    'position:fixed;z-index:90;pointer-events:none;opacity:0;transition:opacity .12s;' +
    'background:#0d1117;color:#fff;padding:7px 10px;border-radius:8px;font-size:12px;' +
    'line-height:1.35;max-width:min(220px, calc(100vw - 16px));box-shadow:0 6px 20px rgba(0,0,0,.25)';
  document.body.appendChild(_tip);
  bindTipDismiss();
  return _tip;
}
function showTip(html, e) {
  if (Date.now() < _tipSuppressUntil) {
    hideTip();
    return;
  }
  const t = tip();
  t.innerHTML = html;
  t.style.opacity = '1';
  moveTip(e);
}
function moveTip(e) {
  const t = tip();
  const pad = 8;
  let x = e.clientX + 14, y = e.clientY + 14;
  const w = t.offsetWidth, h = t.offsetHeight;
  if (x + w > window.innerWidth - pad) x = e.clientX - w - 14;
  if (y + h > window.innerHeight - pad) y = e.clientY - h - 14;
  x = Math.min(Math.max(x, pad), Math.max(pad, window.innerWidth - w - pad));
  y = Math.min(Math.max(y, pad), Math.max(pad, window.innerHeight - h - pad));
  t.style.left = x + 'px';
  t.style.top = y + 'px';
}
function hideTip() { if (_tip) _tip.style.opacity = '0'; }
function resetChartFocus() {
  document.querySelectorAll('.violin').forEach(v => v.style.opacity = '1');
}
function dismissTip() {
  _tipSuppressUntil = Date.now() + 260;
  resetChartFocus();
  hideTip();
}
let _tipDismissBound = false;
function bindTipDismiss() {
  if (_tipDismissBound) return;
  _tipDismissBound = true;
  // Match the method diagrams: if scrolling moves the chart away, dismiss the
  // fixed tooltip and release any dimmed plot elements.
  window.addEventListener('scroll', dismissTip, { passive: true });
  window.addEventListener('resize', dismissTip, { passive: true });
  window.addEventListener('blur', dismissTip);
}

// =========================== VIOLIN SUCCESS CHART ===========================
// Faithful port of success_violins.py (beta-posterior violins).
function betaPoly(p, n, xc, maxW, nGrid = 400, tail = 0.003) {
  const k = Math.round(p * n), a = k + 1, b = n - k + 1;
  const y = [], lp = []; let mx = -Infinity;
  for (let i = 0; i < nGrid; i++) {
    const yy = 1e-4 + (1 - 2e-4) * i / (nGrid - 1);
    const v = (a - 1) * Math.log(yy) + (b - 1) * Math.log(1 - yy);
    y.push(yy); lp.push(v); if (v > mx) mx = v;
  }
  const dens = lp.map(v => Math.exp(v - mx));
  const keep = [];
  for (let i = 0; i < nGrid; i++) if (dens[i] >= tail) keep.push(i);
  const right = keep.map(i => [xc + dens[i] * (maxW / 2), y[i]]);
  const left = keep.map(i => [xc - dens[i] * (maxW / 2), y[i]]).reverse();
  return right.concat(left);
}

// data: [{task,a,b,n,noteA,noteB}]; series:[{key,color,label,note}]; opts:{groupLabel}
function drawViolinChart(svg, data, series, opts = {}) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const nT = data.length;
  const ml = 46, mr = 14, mt = 40, mb = 30, pw = 104, gap = 26, ph = 142;
  const W = ml + nT * pw + (nT - 1) * gap + mr;
  const H = mt + ph + mb;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const PL = i => ml + i * (pw + gap);
  const X = (i, dx) => PL(i) + (dx + 0.55) / 1.1 * pw;
  const Y = yd => mt + (1 - yd / 1.05) * ph;
  const W_ = 0.24, POS = [-0.22, 0.22];

  // sharp drop shadow (SimplePatchShadow offset (2.5,-2.5))
  const defs = el('defs', {}, svg);
  const f = el('filter', { id: svg.id + '-sh', x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs);
  el('feDropShadow', { dx: 1.8, dy: 1.8, stdDeviation: 0.5, 'flood-color': '#222222', 'flood-opacity': 0.5 }, f);

  // legend (top center)
  const lg = el('g', {}, svg);
  let lw = 0; const items = series.map(s => { const t = s.label; lw += 16 + t.length * 5.6 + 18; return t; });
  let lx = W / 2 - lw / 2;
  series.forEach((s) => {
    el('rect', { x: lx, y: 8, width: 11, height: 11, rx: 2.5, fill: s.color, stroke: C.ink, 'stroke-width': 0.5 }, lg);
    el('text', { x: lx + 15, y: 17.5, 'font-size': 11, fill: C.ink, 'font-weight': 600 }, lg).textContent = s.label;
    lx += 16 + s.label.length * 5.6 + 18;
  });

  // per-panel: y-grid + bottom spine + violins + tick + task label
  data.forEach((d, i) => {
    for (let g = 0; g <= 4; g++) {
      const yd = g * 0.25, yy = Y(yd);
      el('line', { x1: X(i, -0.55), y1: yy, x2: X(i, 0.55), y2: yy, stroke: C.grid, 'stroke-width': 0.5 }, svg);
    }
    // bottom spine bar
    el('line', { x1: X(i, -0.55), y1: Y(0), x2: X(i, 0.55), y2: Y(0), stroke: C.spine, 'stroke-width': 0.8 }, svg);

    series.forEach((s, si) => {
      const p = d[s.key] / d.n, pos = POS[si];
      const pts = betaPoly(p, d.n, pos, W_).map(([x, y]) => [X(i, x), Y(y)]);
      const dpath = pts.map((q, j) => (j ? 'L' : 'M') + q[0].toFixed(2) + ',' + q[1].toFixed(2)).join(' ') + ' Z';
      const grp = el('g', { class: 'violin', style: 'cursor:pointer;transition:opacity .12s' }, svg);
      el('path', { d: dpath, fill: s.color, stroke: C.ink, 'stroke-width': 0.7, filter: `url(#${svg.id}-sh)` }, grp);
      // point-estimate tick
      el('line', { x1: X(i, pos - W_ * 0.18), y1: Y(p), x2: X(i, pos + W_ * 0.18), y2: Y(p), stroke: C.ink, 'stroke-width': 0.9 }, grp);

      const note = (si === 0 ? d.noteA : d.noteB) || s.note || '';
      const html = `<b>${d.task} · ${s.label}</b><br>${Math.round(p * 100)}% &nbsp;(${d[s.key]}/${d.n})` +
                   (note ? `<br><span style="opacity:.75">${note}</span>` : '');
      grp.addEventListener('mouseenter', (e) => {
        svg.querySelectorAll('.violin').forEach(v => v.style.opacity = v === grp ? '1' : '0.28');
        showTip(html, e);
      });
      grp.addEventListener('mousemove', moveTip);
      grp.addEventListener('mouseleave', () => {
        svg.querySelectorAll('.violin').forEach(v => v.style.opacity = '1');
        hideTip();
      });
    });
    // task label
    el('text', { x: X(i, 0), y: Y(0) + 17, 'text-anchor': 'middle', 'font-size': 10.5, fill: C.ink }, svg)
      .textContent = d.task;
  });

  // y tick labels + ylabel (first panel only)
  for (let g = 0; g <= 4; g++) {
    el('text', { x: PL(0) - 6, y: Y(g * 0.25) + 3, 'text-anchor': 'end', 'font-size': 9, fill: C.muted }, svg)
      .textContent = `${g * 25}%`;
  }
  el('text', { x: 11, y: mt + ph / 2, 'text-anchor': 'middle', 'font-size': 9.5, fill: C.muted,
               transform: `rotate(-90 11 ${mt + ph / 2})` }, svg).textContent = 'Success rate';
}

// =========================== SCALING CHART ===========================
const SCALING = [
  { clips: 1000,  success: 0.0333, lo: 0.0059, hi: 0.1667, loss: 3.1749 },
  { clips: 2000,  success: 0.1000, lo: 0.0346, hi: 0.2562, loss: 3.0795 },
  { clips: 5000,  success: 0.4000, lo: 0.2459, hi: 0.5768, loss: 2.9785 },
  { clips: 10000, success: 0.6333, lo: 0.4551, hi: 0.7813, loss: 2.9003 },
  { clips: 20000, success: 0.7000, lo: 0.5212, hi: 0.8334, loss: 2.8171 },
];
function drawScalingChart(svg, activeClips) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const W = 384, H = 268, m = { l: 50, r: 50, t: 22, b: 44 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const lx0 = Math.log10(1000), lx1 = Math.log10(20000);
  const X = c => m.l + (Math.log10(c) - lx0) / (lx1 - lx0) * iw;
  const Ys = v => m.t + (1 - v) * ih;
  const L0 = 2.75, L1 = 3.25, Yl = v => m.t + (1 - (v - L0) / (L1 - L0)) * ih;

  for (let i = 0; i <= 4; i++) {
    const y = Ys(i / 4);
    el('line', { x1: m.l, y1: y, x2: m.l + iw, y2: y, stroke: C.grid, 'stroke-width': 0.6 }, svg);
    el('text', { x: m.l - 9, y: y + 3.5, 'text-anchor': 'end', 'font-size': 10, fill: C.blue }, svg).textContent = `${i * 25}%`;
  }
  [2.8, 2.9, 3.0, 3.1, 3.2].forEach(v =>
    el('text', { x: m.l + iw + 9, y: Yl(v) + 3.5, 'text-anchor': 'start', 'font-size': 10, fill: C.mustard }, svg).textContent = v.toFixed(2));
  SCALING.forEach(d =>
    el('text', { x: X(d.clips), y: H - 24, 'text-anchor': 'middle', 'font-size': 10, fill: C.muted }, svg).textContent = `${d.clips / 1000}k`);
  el('line', { x1: m.l, y1: Ys(0), x2: m.l + iw, y2: Ys(0), stroke: C.spine, 'stroke-width': 0.8 }, svg);
  el('text', { x: m.l + iw / 2, y: H - 7, 'text-anchor': 'middle', 'font-size': 10.5, fill: C.muted }, svg).textContent = '# of human-video clips';

  // CI band (straight)
  let band = '';
  SCALING.forEach((d, i) => band += `${i ? 'L' : 'M'} ${X(d.clips)} ${Ys(d.hi)} `);
  for (let i = SCALING.length - 1; i >= 0; i--) band += `L ${X(SCALING[i].clips)} ${Ys(SCALING[i].lo)} `;
  el('path', { d: band + 'Z', fill: C.blue, 'fill-opacity': 0.18 }, svg);

  // loss (straight, dashed, square markers)
  let lp = '';
  SCALING.forEach((d, i) => lp += `${i ? 'L' : 'M'} ${X(d.clips)} ${Yl(d.loss)} `);
  el('path', { d: lp, fill: 'none', stroke: C.mustard, 'stroke-width': 2, 'stroke-dasharray': '5 4' }, svg);
  SCALING.forEach(d => el('rect', { x: X(d.clips) - 3, y: Yl(d.loss) - 3, width: 6, height: 6, fill: C.mustard }, svg));

  // success (straight, solid, round markers)
  let sp = '';
  SCALING.forEach((d, i) => sp += `${i ? 'L' : 'M'} ${X(d.clips)} ${Ys(d.success)} `);
  el('path', { d: sp, fill: 'none', stroke: C.blue, 'stroke-width': 2.4 }, svg);
  SCALING.forEach(d => el('circle', { cx: X(d.clips), cy: Ys(d.success), r: 3.4, fill: C.blue }, svg));

  // active marker — interpolated along the line so it glides smoothly while dragging
  const ac = Math.max(1000, Math.min(20000, activeClips));
  let i1 = 0;
  while (i1 < SCALING.length - 2 && SCALING[i1 + 1].clips < ac) i1++;
  const A = SCALING[i1], B = SCALING[i1 + 1];
  const t = (Math.log10(ac) - Math.log10(A.clips)) / (Math.log10(B.clips) - Math.log10(A.clips));
  const sy = A.success + Math.max(0, Math.min(1, t)) * (B.success - A.success);
  const mx = X(ac);
  el('line', { class: 'scale-guide', x1: mx, y1: m.t, x2: mx, y2: m.t + ih, stroke: C.ink, 'stroke-width': 1, 'stroke-dasharray': '3 3', 'stroke-opacity': 0.4 }, svg);
  el('circle', { class: 'scale-dot', cx: mx, cy: Ys(sy), r: 6, fill: 'none', stroke: C.blue, 'stroke-width': 2.4 }, svg);
}

// Move just the marker (dashed guide + ring) to an arbitrary clips value — cheap,
// so it can glide smoothly on every drag frame without redrawing the chart.
function updateScalingMarker(svg, clips) {
  const W = 384, H = 268, m = { l: 50, r: 50, t: 22, b: 44 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const lx0 = Math.log10(1000), lx1 = Math.log10(20000);
  const ac = Math.max(1000, Math.min(20000, clips));
  const x = m.l + (Math.log10(ac) - lx0) / (lx1 - lx0) * iw;
  let i1 = 0;
  while (i1 < SCALING.length - 2 && SCALING[i1 + 1].clips < ac) i1++;
  const A = SCALING[i1], B = SCALING[i1 + 1];
  const t = (Math.log10(ac) - Math.log10(A.clips)) / (Math.log10(B.clips) - Math.log10(A.clips));
  const sy = A.success + Math.max(0, Math.min(1, t)) * (B.success - A.success);
  const line = svg.querySelector('.scale-guide'), dot = svg.querySelector('.scale-dot');
  if (line) { line.setAttribute('x1', x); line.setAttribute('x2', x); }
  if (dot) { dot.setAttribute('cx', x); dot.setAttribute('cy', m.t + (1 - sy) * ih); }
}

// ---- success data (from the paper's success_violins figure) ----
const SUCCESS_WEB = [
  { task: 'Stirring', a: 19, b: 7,  n: 30 },
  { task: 'Wiping',   a: 26, b: 13, n: 30 },
  { task: 'Binning',  a: 21, b: 5,  n: 30 },
];
const SUCCESS_SELF = [
  { task: 'Push-T',        a: 12, b: 10, n: 15 },
  { task: 'Cable routing', a: 7,  b: 9,  n: 15,
    noteA: 'Fingers struggle to pinch the thin cable.',
    noteB: 'Two opposing jaws suit the thin cable.' },
];

window.LucidCharts = { drawScalingChart, updateScalingMarker, drawViolinChart, SCALING, SUCCESS_WEB, SUCCESS_SELF, C };
