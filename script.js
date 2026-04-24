/*
 * script.js — Disk Scheduling Simulator
 * Algorithms: FCFS, SSTF, SCAN, C-SCAN, LOOK, C-LOOK
 * Author: Tharun | OS Lab Project
 */

// ============================================================
// GLOBAL STATE
// ============================================================
let allResults    = {};   // { algoKey: { result, label, head, requests, maxTrack } }
let headChart     = null; // Chart.js instance
let currentAlgo   = '';   // algo being visualized on canvas

// ============================================================
// CONSTANTS
// ============================================================
const ALGO_LABELS = {
  FCFS:  'FCFS — First Come First Serve',
  SSTF:  'SSTF — Shortest Seek Time First',
  SCAN:  'SCAN — Elevator Algorithm',
  CSCAN: 'C-SCAN — Circular SCAN',
  LOOK:  'LOOK',
  CLOOK: 'C-LOOK'
};

const ALGO_COLORS = {
  FCFS:  '#a78bfa',
  SSTF:  '#00d4aa',
  SCAN:  '#f59e0b',
  CSCAN: '#f87171',
  LOOK:  '#22c55e',
  CLOOK: '#f472b6'
};

// ============================================================
// INPUT HELPERS
// ============================================================

/** Sync queue-size field when sequence changes */
function syncFromSequence() {
  const seq = parseSequenceRaw();
  if (seq) document.getElementById('queue-size').value = seq.length;
}

/** Auto-trim sequence to queue-size if user sets it */
function syncQueueSize() {
  const n   = parseInt(document.getElementById('queue-size').value);
  const raw = document.getElementById('request-sequence').value.trim();
  if (!raw || isNaN(n) || n <= 0) return;
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length > n) {
    document.getElementById('request-sequence').value = parts.slice(0, n).join(', ');
  }
}

function parseSequenceRaw() {
  const raw = document.getElementById('request-sequence').value.trim();
  if (!raw) return null;
  const arr = raw.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0);
  return arr.length ? arr : null;
}

/** Parse and validate all inputs. Returns parsed data or null on error. */
function parseInputs() {
  const head = parseInt(document.getElementById('head-position').value);
  if (isNaN(head) || head < 0) {
    showError('⚠️ Enter a valid Initial Head Position (non-negative integer).');
    return null;
  }
  const requests = parseSequenceRaw();
  if (!requests) {
    showError('⚠️ Enter the Request Queue as comma-separated track numbers (e.g. 98, 183, 37).');
    return null;
  }
  hideError();
  // maxTrack = largest track + a small buffer so SCAN/C-SCAN reach the end
  const maxTrack = Math.max(head, ...requests) + 20;
  return { head, requests, maxTrack };
}

function getDirection() {
  const r = document.querySelector('input[name="direction"]:checked');
  return r ? r.value : 'right'; // 'left' or 'right'
}

function showError(msg) {
  const b = document.getElementById('error-banner');
  b.innerHTML = msg;
  b.style.display = 'flex';
}

function hideError() {
  document.getElementById('error-banner').style.display = 'none';
}

// ============================================================
// ALGORITHM 1 — FCFS
// ============================================================
/**
 * Serves requests in the exact order they arrive.
 * Simple, fair, but can cause high seek times.
 */
function fcfs(head, requests) {
  const seq   = [head, ...requests];
  const moves = [];
  let total = 0, cur = head;
  for (const t of requests) {
    const d = Math.abs(t - cur);
    moves.push({ from: cur, to: t, diff: d, boundary: false });
    total += d;
    cur = t;
  }
  return { sequence: seq, moves, totalSeek: total };
}

// ============================================================
// ALGORITHM 2 — SSTF
// ============================================================
/**
 * Always picks the closest unserviced request.
 * Greedy — minimises immediate seek but may cause starvation.
 */
function sstf(head, requests) {
  const queue = [...requests];
  const seq   = [head];
  const moves = [];
  let total = 0, cur = head;
  while (queue.length) {
    let minD = Infinity, minI = -1;
    for (let i = 0; i < queue.length; i++) {
      const d = Math.abs(queue[i] - cur);
      if (d < minD) { minD = d; minI = i; }
    }
    const next = queue.splice(minI, 1)[0];
    moves.push({ from: cur, to: next, diff: minD, boundary: false });
    total += minD;
    seq.push(next);
    cur = next;
  }
  return { sequence: seq, moves, totalSeek: total };
}

// ============================================================
// ALGORITHM 3 — SCAN (Elevator)
// ============================================================
/**
 * Moves in one direction servicing requests until it reaches
 * the physical disk boundary (0 or maxTrack), then reverses.
 */
function scan(head, requests, direction, maxTrack) {
  const sorted = [...requests].sort((a, b) => a - b);
  const left   = sorted.filter(t => t < head).reverse(); // descending
  const right  = sorted.filter(t => t >= head);           // ascending

  let order;
  if (direction === 'right') {
    order = [...right, maxTrack, ...left];
  } else {
    order = [...left, 0, ...right];
  }

  const seq   = [head];
  const moves = [];
  let total = 0, cur = head;
  for (const t of order) {
    const d = Math.abs(t - cur);
    const isBoundary = !requests.includes(t); // maxTrack or 0
    moves.push({ from: cur, to: t, diff: d, boundary: isBoundary });
    total += d;
    seq.push(t);
    cur = t;
  }
  return { sequence: seq, moves, totalSeek: total };
}

// ============================================================
// ALGORITHM 4 — C-SCAN (Circular SCAN)
// ============================================================
/**
 * Like SCAN, but after reaching the end it jumps (without
 * servicing) back to the beginning and continues in the
 * SAME direction.
 */
function cscan(head, requests, direction, maxTrack) {
  const sorted = [...requests].sort((a, b) => a - b);
  const left   = sorted.filter(t => t < head);  // ascending left
  const right  = sorted.filter(t => t >= head); // ascending right

  let order;
  if (direction === 'right') {
    // right → maxTrack → 0 (jump) → remaining on left ascending
    order = [...right, maxTrack, 0, ...left];
  } else {
    // left (desc) → 0 → maxTrack (jump) → remaining on right (desc)
    order = [...left.reverse(), 0, maxTrack, ...right.reverse()];
  }

  const seq   = [head];
  const moves = [];
  let total = 0, cur = head;
  for (const t of order) {
    const d = Math.abs(t - cur);
    const isBoundary = !requests.includes(t);
    moves.push({ from: cur, to: t, diff: d, boundary: isBoundary });
    total += d;
    seq.push(t);
    cur = t;
  }
  return { sequence: seq, moves, totalSeek: total };
}

// ============================================================
// ALGORITHM 5 — LOOK
// ============================================================
/**
 * Like SCAN but does NOT go to the physical disk boundary.
 * Reverses at the last request in the current direction.
 */
function look(head, requests, direction) {
  const sorted = [...requests].sort((a, b) => a - b);
  const left   = sorted.filter(t => t < head).reverse(); // descending
  const right  = sorted.filter(t => t >= head);           // ascending

  const order = direction === 'right'
    ? [...right, ...left]
    : [...left, ...right];

  const seq   = [head];
  const moves = [];
  let total = 0, cur = head;
  for (const t of order) {
    const d = Math.abs(t - cur);
    moves.push({ from: cur, to: t, diff: d, boundary: false });
    total += d;
    seq.push(t);
    cur = t;
  }
  return { sequence: seq, moves, totalSeek: total };
}

// ============================================================
// ALGORITHM 6 — C-LOOK (Circular LOOK)
// ============================================================
/**
 * Like C-SCAN but jumps to the first actual request (not disk
 * boundary) after reaching the last request in one direction.
 */
function clook(head, requests, direction) {
  const sorted = [...requests].sort((a, b) => a - b);
  const left   = sorted.filter(t => t < head);  // ascending left side
  const right  = sorted.filter(t => t >= head); // ascending right side

  let order;
  if (direction === 'right') {
    // Service right ascending, jump to smallest left, service left ascending
    order = [...right, ...left];
  } else {
    // Service left descending, jump to largest right, service right descending
    order = [...left.slice().reverse(), ...right.slice().reverse()];
  }

  const seq   = [head];
  const moves = [];
  let total = 0, cur = head;
  for (const t of order) {
    const d = Math.abs(t - cur);
    moves.push({ from: cur, to: t, diff: d, boundary: false });
    total += d;
    seq.push(t);
    cur = t;
  }
  return { sequence: seq, moves, totalSeek: total };
}

// ============================================================
// RUN SINGLE ALGORITHM
// ============================================================
function runAlgorithm(key) {
  const parsed = parseInputs();
  if (!parsed) return;
  const { head, requests, maxTrack } = parsed;
  const dir = getDirection();

  const result = computeAlgo(key, head, requests, dir, maxTrack);
  allResults[key] = { result, label: ALGO_LABELS[key], head, requests, maxTrack };

  renderCard(key, result);
  visualizeOnCanvas(key);
  drawHeadGraph(result.sequence, ALGO_LABELS[key], key);
  document.getElementById('graph-switcher').style.display = 'none';

  if (Object.keys(allResults).length > 1) renderComparison();
}

// ============================================================
// RUN ALL ALGORITHMS
// ============================================================
function runAll() {
  const parsed = parseInputs();
  if (!parsed) return;
  const { head, requests, maxTrack } = parsed;
  const dir = getDirection();

  // Clear previous results
  document.getElementById('results-section').innerHTML = '';
  allResults = {};

  const keys = ['FCFS','SSTF','SCAN','CSCAN','LOOK','CLOOK'];
  for (const key of keys) {
    const result = computeAlgo(key, head, requests, dir, maxTrack);
    allResults[key] = { result, label: ALGO_LABELS[key], head, requests, maxTrack };
    renderCard(key, result);
  }

  renderComparison();

  // Default canvas + graph: FCFS
  visualizeOnCanvas('FCFS');
  drawHeadGraph(allResults['FCFS'].result.sequence, ALGO_LABELS['FCFS'], 'FCFS');
  document.getElementById('graph-switcher').style.display = 'flex';
  setActivePill('FCFS');
}

/** Dispatch to the correct algorithm function */
function computeAlgo(key, head, requests, dir, maxTrack) {
  switch (key) {
    case 'FCFS':  return fcfs(head, requests);
    case 'SSTF':  return sstf(head, requests);
    case 'SCAN':  return scan(head, requests, dir, maxTrack);
    case 'CSCAN': return cscan(head, requests, dir, maxTrack);
    case 'LOOK':  return look(head, requests, dir);
    case 'CLOOK': return clook(head, requests, dir);
  }
}

// ============================================================
// RESET
// ============================================================
function resetAll() {
  document.getElementById('results-section').innerHTML = '';
  document.getElementById('viz-section').style.display    = 'none';
  document.getElementById('graph-section').style.display  = 'none';
  document.getElementById('cmp-section').style.display    = 'none';
  allResults  = {};
  currentAlgo = '';
  hideError();

  if (headChart) { headChart.destroy(); headChart = null; }

  const c = document.getElementById('diskCanvas');
  c.getContext('2d').clearRect(0, 0, c.width, c.height);

  document.getElementById('head-position').value     = '';
  document.getElementById('request-sequence').value  = '';
  document.getElementById('queue-size').value        = '';
}

// ============================================================
// RENDER RESULT CARD
// ============================================================
function renderCard(key, result) {
  const container = document.getElementById('results-section');
  const existing  = document.getElementById('rc-' + key);
  if (existing) existing.remove();

  const card = document.createElement('div');
  card.className = `result-card rc-${key.toLowerCase()}`;
  card.id = 'rc-' + key;

  // --- Sequence HTML ---
  let seqHtml = '';
  for (let i = 0; i < result.sequence.length; i++) {
    const t = result.sequence[i];
    const isBoundary = result.moves[i-1] && result.moves[i-1].boundary && i > 0;
    const isStart    = i === 0;
    const cls = isStart ? 'seq-chip start' : isBoundary ? 'seq-chip boundary' : 'seq-chip';
    seqHtml += `<span class="${cls}">${t}</span>`;
    if (i < result.sequence.length - 1) seqHtml += `<span class="seq-arrow">→</span>`;
  }

  // --- Step movements HTML ---
  let movHtml   = '';
  let calcParts = [];
  for (const m of result.moves) {
    const dir   = m.to > m.from ? '↑' : m.to < m.from ? '↓' : '=';
    const cls   = m.boundary ? 'mv-bnd' : m.to > m.from ? 'mv-fwd' : m.to < m.from ? 'mv-back' : 'mv-eq';
    const bNote = m.boundary ? ' <em style="font-size:0.7rem;">(boundary)</em>' : '';
    movHtml  += `<div><span class="${cls}">${dir} ${m.from} → ${m.to}</span>`
              + ` &nbsp;= <strong>${m.diff}</strong>${bNote}</div>`;
    calcParts.push(`|${m.to}−${m.from}|=${m.diff}`);
  }

  const calcStr = calcParts.join(' + ')
    + ` = <span class="calc-total">${result.totalSeek}</span>`;

  card.innerHTML = `
    <div class="rc-header">
      <span class="rc-name tag-${key.toLowerCase()}">${ALGO_LABELS[key]}</span>
      <button class="rc-viz-btn" onclick="visualizeOnCanvas('${key}')">📊 Visualize</button>
    </div>
    <div class="seek-label">Total Head Movement</div>
    <div class="seek-value">${result.totalSeek}<span class="seek-unit">tracks</span></div>

    <div class="rc-section-label">Service Sequence</div>
    <div class="seq-row">${seqHtml}</div>

    <div class="rc-section-label">Step-by-Step Movements</div>
    <div class="movements-box">${movHtml}</div>

    <div class="calc-line">📐 ${calcStr}</div>
  `;

  container.appendChild(card);
}

// ============================================================
// COMPARISON TABLE
// ============================================================
function renderComparison() {
  const section = document.getElementById('cmp-section');
  const tbody   = document.getElementById('cmp-body');
  section.style.display = 'block';
  tbody.innerHTML = '';

  const entries = Object.entries(allResults)
    .map(([key, v]) => ({
      key,
      label:     v.label.split('—')[0].trim(),
      totalSeek: v.result.totalSeek,
      steps:     v.result.moves.length,
      seq:       v.result.sequence
    }))
    .sort((a, b) => a.totalSeek - b.totalSeek);

  const badgeLabels  = ['🥇 Best','🥈 Good','🥉 Average','4th','5th','6th'];
  const badgeClasses = ['badge badge-1','badge badge-2','badge badge-3','badge badge-4','badge badge-5','badge badge-6'];

  entries.forEach((e, idx) => {
    const tr     = document.createElement('tr');
    if (idx === 0) tr.className = 'row-best';
    const preview = e.seq.slice(0, 6).join(' → ') + (e.seq.length > 6 ? ' ...' : '');
    tr.innerHTML = `
      <td><strong>${idx + 1}</strong></td>
      <td><strong style="color:${ALGO_COLORS[e.key]}">${e.label}</strong></td>
      <td><strong>${e.totalSeek}</strong></td>
      <td>${e.steps}</td>
      <td style="font-size:0.74rem;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${preview}</td>
      <td><span class="${badgeClasses[idx] || 'badge badge-6'}">${badgeLabels[idx] || '–'}</span></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('best-banner').innerHTML =
    `✅ Most Efficient: <strong>${entries[0].label}</strong> — ${entries[0].totalSeek} tracks of total head movement`;
}

// ============================================================
// CANVAS TRACK VISUALIZATION
// ============================================================
function visualizeOnCanvas(key) {
  const data = allResults[key];
  if (!data) return;
  currentAlgo = key;

  const section = document.getElementById('viz-section');
  section.style.display = 'block';

  document.getElementById('viz-algo-badge').textContent =
    `${data.label} | Seek: ${data.result.totalSeek} tracks`;
  document.getElementById('viz-info').textContent =
    `Head starts at ${data.head}. Servicing ${data.requests.length} requests.`;

  drawCanvas(data);
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function drawCanvas(data) {
  const canvas = document.getElementById('diskCanvas');
  const ctx    = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const seq    = data.result.sequence;
  const moves  = data.result.moves;
  const maxT   = data.maxTrack;
  const reqs   = data.requests;

  const PAD_L = 52, PAD_R = 52;
  const trkW  = W - PAD_L - PAD_R;
  const lineY = H / 2 + 14;
  const ARC_H = 42;

  const tx = t => PAD_L + (t / maxT) * trkW;

  // -- Grid lines --
  ctx.strokeStyle = '#1a2040';
  ctx.lineWidth   = 1;
  const step = maxT <= 200 ? 20 : maxT <= 500 ? 50 : 100;
  for (let t = 0; t <= maxT; t += step) {
    const x = tx(t);
    ctx.beginPath();
    ctx.moveTo(x, lineY - 80);
    ctx.lineTo(x, lineY + 18);
    ctx.stroke();
    ctx.fillStyle = '#374151';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(t, x, lineY + 30);
  }

  // -- Track baseline --
  ctx.strokeStyle = '#2e3760';
  ctx.lineWidth   = 2.5;
  ctx.beginPath();
  ctx.moveTo(PAD_L, lineY);
  ctx.lineTo(W - PAD_R, lineY);
  ctx.stroke();

  // End labels
  ctx.fillStyle = '#4b5563';
  ctx.font      = '10px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('0', PAD_L, lineY + 42);
  ctx.fillText(maxT, W - PAD_R, lineY + 42);

  // -- Requested track markers --
  for (const r of reqs) {
    const x = tx(r);
    ctx.beginPath();
    ctx.arc(x, lineY, 5, 0, Math.PI * 2);
    ctx.fillStyle   = '#f59e0b';
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth   = 1.5;
    ctx.fill();
    ctx.stroke();
  }

  // -- Movement arcs --
  for (let i = 0; i < moves.length; i++) {
    const m      = moves[i];
    const x1     = tx(m.from), x2 = tx(m.to);
    const fwd    = m.to >= m.from;
    const color  = m.boundary ? '#4b5563' : fwd ? '#22c55e' : '#ef4444';
    const arcY   = lineY - ARC_H - (i % 4) * 18;

    ctx.beginPath();
    ctx.strokeStyle  = color;
    ctx.lineWidth    = m.boundary ? 1.5 : 2;
    ctx.globalAlpha  = m.boundary ? 0.5 : 0.88;
    ctx.setLineDash(m.boundary ? [5, 4] : []);
    ctx.moveTo(x1, lineY);
    ctx.quadraticCurveTo((x1 + x2) / 2, arcY, x2, lineY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Arrowhead at destination
    if (!m.boundary) drawArrow(ctx, x2, lineY, fwd, color);
  }

  // -- Head start marker --
  drawDiamond(ctx, tx(seq[0]), lineY, seq[0], '#f59e0b', '#fde68a');

  // -- Head final marker --
  if (seq.length > 1) {
    drawDiamond(ctx, tx(seq[seq.length - 1]), lineY, seq[seq.length - 1], '#3b82f6', '#93c5fd');
  }
}

function drawArrow(ctx, x, y, fwd, color) {
  const sz  = 7;
  const dir = fwd ? 1 : -1;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - sz * dir, y - sz / 1.8);
  ctx.lineTo(x - sz * dir, y + sz / 1.8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawDiamond(ctx, x, y, label, fill, stroke) {
  const s = 10;
  ctx.beginPath();
  ctx.fillStyle   = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth   = 2;
  ctx.moveTo(x, y - s);
  ctx.lineTo(x + s, y);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x - s, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = stroke;
  ctx.font      = 'bold 10px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y - s - 5);
}

// ============================================================
// CHART.JS HEAD-MOVEMENT GRAPH
// ============================================================
function drawHeadGraph(seq, label, key) {
  if (headChart) { headChart.destroy(); headChart = null; }

  document.getElementById('graph-section').style.display = 'block';
  document.getElementById('graph-subtitle').textContent  =
    `${label}  |  Steps: ${seq.length - 1}`;

  if (key) setActivePill(key);

  const labels = seq.map((_, i) => i === 0 ? 'Start' : `Step ${i}`);

  const chartCtx = document.getElementById('headMovementChart').getContext('2d');
  const grad     = chartCtx.createLinearGradient(0, 0, 0, 320);
  grad.addColorStop(0,   'rgba(108,99,255,0.4)');
  grad.addColorStop(0.6, 'rgba(0,212,170,0.1)');
  grad.addColorStop(1,   'rgba(0,212,170,0)');

  headChart = new Chart(chartCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Track Position',
        data:  seq,
        backgroundColor: grad,
        borderColor:    '#6c63ff',
        borderWidth:    2.5,
        pointBackgroundColor: seq.map((_, i) => i === 0 ? '#f59e0b' : '#00d4aa'),
        pointBorderColor:     '#111527',
        pointBorderWidth: 2,
        pointRadius:      6,
        pointHoverRadius: 9,
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      animation: { duration: 700, easing: 'easeInOutQuart' },
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111527',
          borderColor:     '#252c4a',
          borderWidth:     1,
          titleColor:      '#a5b4fc',
          bodyColor:       '#e2e8f0',
          padding:         12,
          callbacks: {
            title: items => items[0].label,
            label: item  => ` Track: ${item.raw}`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Step', color: '#94a3b8', font: { size: 11 } },
          grid:  { color: '#1a2040' },
          ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono' } }
        },
        y: {
          title: { display: true, text: 'Track Number', color: '#94a3b8', font: { size: 11 } },
          grid:  { color: '#1a2040' },
          ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono' } },
          beginAtZero: false
        }
      }
    }
  });

  document.getElementById('graph-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Switch the graph to a different algorithm (used by pill buttons after Run All) */
function switchGraph(key) {
  const d = allResults[key];
  if (!d) return;
  drawHeadGraph(d.result.sequence, d.label, key);
  visualizeOnCanvas(key);
}

function setActivePill(key) {
  ['FCFS','SSTF','SCAN','CSCAN','LOOK','CLOOK'].forEach(k => {
    const btn = document.getElementById('sw-' + k);
    if (btn) btn.classList.toggle('active', k === key);
  });
}

// ============================================================
// INIT — Pre-fill example values on load
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('queue-size').value       = 8;
  document.getElementById('head-position').value    = 53;
  document.getElementById('request-sequence').value = '98, 183, 37, 122, 14, 124, 65, 67';
});
