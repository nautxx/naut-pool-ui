/* naut x Public Pool — vanilla JS SPA, no build step.
   Talks directly to the Public-Pool REST API (see /api/info, /api/pool,
   /api/network, /api/client/:address...) — schema taken from
   benjamin-wilson/public-pool's src/app.controller.ts and
   src/controllers/client/client.controller.ts. */

const API_BASE = '/api';

// ---------------------------------------------------------------- utils --

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function shortAddr(a) {
  if (!a) return '';
  if (a.length <= 14) return a;
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

function formatHashrate(hps) {
  hps = Number(hps);
  if (!hps || hps <= 0 || isNaN(hps)) return '0 H/s';
  const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s', 'ZH/s'];
  let i = 0, v = hps;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

function formatHashrateParts(hps) {
  const [num, unit] = formatHashrate(hps).split(' ');
  return `${num}<span class="unit"> ${unit}</span>`;
}

function formatDifficulty(n) {
  n = Number(n);
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toFixed(2);
}

function formatNumberFull(n) {
  n = Number(n);
  if (isNaN(n)) return '';
  return n.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

function formatDuration(fromDate) {
  const diffMs = Date.now() - new Date(fromDate).getTime();
  if (isNaN(diffMs) || diffMs < 0) return '—';
  const sec = Math.floor(diffMs / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatRelativeTime(input) {
  const d = new Date(input);
  const diffMs = Date.now() - d.getTime();
  if (isNaN(diffMs)) return '—';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 10) return 'Just now';
  if (sec < 60) return `${sec} seconds`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'}`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? '' : 's'}`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} month${month === 1 ? '' : 's'}`;
  const year = Math.floor(month / 12);
  return `${year} year${year === 1 ? '' : 's'}`;
}

function formatHourLabel(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${h}${ampm}`;
}

function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

function movingAverage(values, window) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    out.push(avg(values.slice(start, i + 1)));
  }
  return out;
}

function pickTicks(series, n) {
  if (!series.length) return [];
  const ticks = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i / (n - 1)) * (series.length - 1));
    ticks.push(formatHourLabel(series[idx].label));
  }
  return ticks;
}

function errorHTML(msg) { return `<div class="loading">${esc(msg)}</div>`; }

// ---------------------------------------------------------------- api ---

async function apiGet(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json();
}

// -------------------------------------------------------------- charts --

let chartUid = 0;

function toPathScaled(values, w, h, max, min, area, pad = 6) {
  if (!values.length) return '';
  const range = (max - min) || 1;
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  let d = '';
  values.forEach((v, i) => {
    const x = i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    d += (i === 0 ? `M${x.toFixed(2)},${y.toFixed(2)}` : ` L${x.toFixed(2)},${y.toFixed(2)}`);
  });
  if (area) d += ` L${w},${h} L0,${h} Z`;
  return d;
}

function areaChartSVG(values, { w = 800, h = 260, lineColor = 'var(--text)', areaColor = 'var(--text)' } = {}) {
  const uid = 'c' + (chartUid++);
  const max = Math.max(...values), min = Math.min(...values);
  const lineD = toPathScaled(values, w, h, max, min, false);
  const areaD = toPathScaled(values, w, h, max, min, true);
  // The dot grid is a CSS background (real pixels) rather than an SVG <pattern>,
  // because the chart SVG uses preserveAspectRatio="none" to stretch to the
  // container's width — that stretch is non-uniform (width scales, height
  // doesn't), which would squish SVG-drawn circles into ellipses.
  return `<div class="chart-canvas" style="height:${h}px;">
    <div class="chart-dots-fade-h"><div class="chart-dots-fade-v"><div class="chart-dots" style="background-image:radial-gradient(circle, ${lineColor} 1.3px, transparent 1.3px);"></div></div></div>
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;display:block;height:${h}px;position:relative;">
      <defs>
        <linearGradient id="areaFade-${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style="stop-color:${areaColor};stop-opacity:0.14"/>
          <stop offset="100%" style="stop-color:${areaColor};stop-opacity:0"/>
        </linearGradient>
      </defs>
      <path d="${areaD}" fill="url(#areaFade-${uid})"/>
      <path d="${lineD}" fill="none" style="stroke:${lineColor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>
  </div>`;
}

function dualChartSVG(raw, smoothed) {
  const w = 800, h = 260;
  const all = raw.concat(smoothed);
  const max = Math.max(...all), min = Math.min(...all);
  const rawD = toPathScaled(raw, w, h, max, min, false);
  const smoothD = toPathScaled(smoothed, w, h, max, min, false);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;display:block;height:${h}px;">
    <path d="${smoothD}" fill="none" style="stroke:var(--accent2)" stroke-width="2.5" stroke-linecap="round" id="path-2h"/>
    <path d="${rawD}" fill="none" style="stroke:var(--text)" stroke-width="1.5" id="path-10m"/>
  </svg>`;
}

// --------------------------------------------------------------- theme --

function initTheme() {
  const saved = localStorage.getItem('pp-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('pp-theme', next);
  render();
}

function themeToggleHTML() {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const label = theme === 'dark' ? 'Dark' : 'Light';
  return `<button class="btn theme-toggle" id="theme-toggle-btn"><span class="dot"></span>${label}</button>`;
}

// -------------------------------------------------------------- router --

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'workers' && parts[1]) {
    if (parts[2] && parts[3]) {
      return { view: 'detail', address: parts[1], workerName: parts[2], sessionId: parts[3] };
    }
    return { view: 'workers', address: parts[1] };
  }
  return { view: 'dashboard' };
}

function go(hash) { location.hash = hash; }
function navWorkers(address) { go(`#/workers/${encodeURIComponent(address)}`); }
function navDetail(address, workerName, sessionId) { go(`#/workers/${encodeURIComponent(address)}/${encodeURIComponent(workerName)}/${encodeURIComponent(sessionId)}`); }
function navDashboard() { go('#/'); }

function submitAddress() {
  const input = document.getElementById('address-input');
  const val = input.value.trim();
  if (!val) return;
  localStorage.setItem('pp-address', val);
  navWorkers(val);
}

function renderTopbar(route) {
  const actions = document.getElementById('topbar-actions');
  if (route.view === 'dashboard') {
    const savedAddr = localStorage.getItem('pp-address') || '';
    actions.innerHTML = `
      <div class="field-group">
        <input type="text" id="address-input" placeholder="Address (bc1...)" value="${esc(savedAddr)}" />
        <button id="my-workers-btn">MY WORKERS</button>
      </div>
      ${themeToggleHTML()}
    `;
    document.getElementById('my-workers-btn').addEventListener('click', submitAddress);
    document.getElementById('address-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitAddress(); });
  } else {
    actions.innerHTML = `<button class="btn" id="back-btn">← BACK</button>${themeToggleHTML()}`;
    document.getElementById('back-btn').addEventListener('click', () => {
      if (route.view === 'detail') navWorkers(route.address);
      else navDashboard();
    });
  }
  document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
}

async function render() {
  const route = parseHash();
  renderTopbar(route);
  const app = document.getElementById('app');
  if (route.view === 'workers') return renderWorkersView(app, route.address);
  if (route.view === 'detail') return renderDetailView(app, route.address, route.workerName, route.sessionId);
  return renderDashboard(app);
}

// ------------------------------------------------------------ dashboard --

async function renderDashboard(root) {
  root.innerHTML = `<div class="page page-narrow" id="dash-root"><div class="loading">Loading pool data…</div></div>`;

  let info, pool, chart;
  try {
    [info, pool, chart] = await Promise.all([
      apiGet('/info'),
      apiGet('/pool'),
      apiGet('/info/chart'),
    ]);
  } catch (err) {
    document.getElementById('dash-root').innerHTML = errorHTML('Could not load pool data.');
    return;
  }

  const values = chart.map(p => Number(p.data));
  const headline = pool.totalHashRate || (values.length ? values[values.length - 1] : 0);
  const recentAvg = avg(values.slice(-6));
  const overallAvg = avg(values);
  const deltaPct = overallAvg ? ((recentAvg - overallAvg) / overallAvg) * 100 : 0;
  const deltaSign = deltaPct >= 0 ? '▲' : '▼';
  const uptimeStr = info.uptime ? formatDuration(info.uptime) : '—';

  const highScores = info.highScores || [];
  const topDiff = highScores.length ? Math.max(...highScores.map(h => h.bestDifficulty)) : 0;
  const devices = info.userAgents || [];
  const blocks = info.blockData || [];

  document.getElementById('dash-root').innerHTML = `
    <div class="hero-row">
      <div class="hero-identity">
        <img class="hero-avatar" src="assets/avatar.png" alt="naut" />
        <div>
          <h1 class="hero-title">${esc(SITE_CONFIG.siteName)}</h1>
          <div class="hero-sub mono">${esc(SITE_CONFIG.tagline)} · ${esc(SITE_CONFIG.topbarDomain)}</div>
          <div class="hero-social">
            <a href="${esc(SITE_CONFIG.social.x)}" target="_blank" rel="noopener">X</a>
            <a href="${esc(SITE_CONFIG.social.discord)}" target="_blank" rel="noopener">Discord</a>
            <a href="${esc(SITE_CONFIG.social.github)}" target="_blank" rel="noopener">GitHub</a>
          </div>
        </div>
      </div>
      <div class="hr"></div>
      <div class="hero-conn">
        <div class="hero-conn-box mono">
          stratum+tcp://${esc(SITE_CONFIG.stratumHost)}:${esc(SITE_CONFIG.stratumPort)}<br/>
          username: &lt;BTC address&gt;.&lt;worker&gt;, password: x
        </div>
        <div class="hero-nofees mono">NO FEES — ONLYFRIENDS.</div>
      </div>
    </div>

    <div class="panel panel-pad">
      <div class="chart-panel-head">
        <div>
          <div class="chart-kicker mono">POOL HASHRATE</div>
          <div class="chart-value mono">${formatHashrateParts(headline)}</div>
        </div>
        <div>
          <div class="chart-delta mono">${deltaSign} ${Math.abs(deltaPct).toFixed(1)}% vs 24h avg</div>
          <div class="chart-delta-sub mono">Uptime: ${uptimeStr}</div>
        </div>
      </div>
      ${values.length ? areaChartSVG(values, { h: 280 }) : '<div class="chart-empty">No chart data yet.</div>'}
      <div class="chart-axis mono">${pickTicks(chart, 6).map(t => `<span>${t}</span>`).join('')}</div>
    </div>

    <div class="panel">
      <div class="tabs-head">
        <button class="active" id="tab-highscores">HIGH SCORES</button>
        <button id="tab-devices">ONLINE DEVICES</button>
      </div>
      <div class="tabs-body" id="tabs-body">${renderHighScores(highScores, topDiff)}</div>
    </div>

    <div class="panel-dashed panel-pad center">
      <div style="font-size:15px;font-weight:800;margin-bottom:6px;">FOUND BLOCKS</div>
      ${blocks.length ? renderBlocksTable(blocks) : '<div class="empty-note">None yet — keep hashing.</div>'}
    </div>

    <div class="donate-row">
      <div class="donate-heading">Like the project? Consider a donation.</div>
      <div class="donate-tiles">
        <div class="donate-tile">
          <img class="donate-tile-qr" src="assets/qr-code-onchain.svg" alt="Bitcoin donation QR code" />
          <div class="donate-tile-label mono">${esc(SITE_CONFIG.donationAddress)}</div>
        </div>
        <a class="donate-tile" href="${esc(SITE_CONFIG.social.koFi)}" target="_blank" rel="noopener">
          <img class="donate-tile-qr" src="assets/qr-code-kofi.svg" alt="Ko-fi donation QR code" />
          <div class="donate-tile-label">Ko-fi ↗</div>
        </a>
      </div>
    </div>
  `;

  document.getElementById('tab-highscores').addEventListener('click', () => setTab('highscores', highScores, topDiff, devices));
  document.getElementById('tab-devices').addEventListener('click', () => setTab('devices', highScores, topDiff, devices));
}

function setTab(which, highScores, topDiff, devices) {
  document.getElementById('tab-highscores').classList.toggle('active', which === 'highscores');
  document.getElementById('tab-devices').classList.toggle('active', which === 'devices');
  document.getElementById('tabs-body').innerHTML = which === 'highscores'
    ? renderHighScores(highScores, topDiff)
    : renderDevicesTable(devices);
}

function renderHighScores(list, topDiff) {
  if (!list.length) return '<div class="empty-note">No scores yet.</div>';
  return list.map((hs, i) => `
    <div class="highscore-row">
      <div class="highscore-rank mono">${i + 1}</div>
      <div class="highscore-diff">${formatDifficulty(hs.bestDifficulty)}</div>
      <div class="highscore-bar"><div class="highscore-bar-fill" style="width:${topDiff ? Math.max(2, (hs.bestDifficulty / topDiff) * 100) : 0}%"></div></div>
      <div class="highscore-device">${esc(hs.bestDifficultyUserAgent)}</div>
      <div class="highscore-when">${formatRelativeTime(hs.updatedAt)} ago</div>
    </div>
  `).join('');
}

function renderDevicesTable(devices) {
  if (!devices.length) return '<div class="empty-note">No devices online.</div>';
  return `<table class="data-table"><thead><tr><th>Device</th><th>Working</th><th>Hash Rate</th><th>Best Diff.</th></tr></thead><tbody>
    ${devices.map(d => `<tr><td style="font-family:'Manrope',sans-serif;font-weight:600;">${esc(d.userAgent)}</td><td>${esc(d.count)}</td><td>${formatHashrate(d.totalHashRate)}</td><td>${formatDifficulty(d.bestDifficulty)}</td></tr>`).join('')}
  </tbody></table>`;
}

function renderBlocksTable(blocks) {
  return `<table class="data-table"><thead><tr><th>Height</th><th>Address</th><th>Worker</th><th>Session</th></tr></thead><tbody>
    ${blocks.map(b => `<tr><td>${esc(b.height)}</td><td>${esc(shortAddr(b.minerAddress))}</td><td>${esc(b.worker || '')}</td><td>${esc(b.sessionId || '')}</td></tr>`).join('')}
  </tbody></table>`;
}

// -------------------------------------------------------------- workers --

const expandedGroups = new Set();

function groupWorkers(workers) {
  const map = new Map();
  for (const w of workers) {
    if (!map.has(w.name)) map.set(w.name, []);
    map.get(w.name).push(w);
  }
  return Array.from(map.entries()).map(([name, rows]) => {
    rows.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
    const hashrate = rows.reduce((sum, r) => sum + Number(r.hashRate || 0), 0);
    const bestDifficulty = rows.reduce((m, r) => Math.max(m, Number(r.bestDifficulty || 0)), 0);
    return { name, rows, hashrate, bestDifficulty };
  }).sort((a, b) => b.hashrate - a.hashrate);
}

function renderGroups(groups) {
  return groups.map(g => {
    const expanded = expandedGroups.has(g.name);
    return `
      <div class="group-header" data-group="${esc(g.name)}">
        <div class="group-name"><span class="group-arrow">${expanded ? '▾' : '▸'}</span>${esc(g.name)}</div>
        <div>${g.rows.length} Session${g.rows.length === 1 ? '' : 's'}</div>
        <div>${formatHashrate(g.hashrate)}</div>
        <div>${formatDifficulty(g.bestDifficulty)}</div>
        <div></div>
        <div></div>
      </div>
      ${expanded ? g.rows.map(r => `
        <div class="group-row" data-worker="${esc(g.name)}" data-session="${esc(r.sessionId)}">
          <div></div>
          <div>${esc(r.sessionId)}</div>
          <div>${formatHashrate(r.hashRate)}</div>
          <div>${formatDifficulty(r.bestDifficulty)}</div>
          <div>${formatDuration(r.startTime)}</div>
          <div>${formatRelativeTime(r.lastSeen)}</div>
        </div>
      `).join('') : ''}
    `;
  }).join('');
}

function workersLayoutShell(address, bodyHTML) {
  return `
    <div class="page page-narrow">
      <div class="workers-layout">
        <div class="workers-sidebar">
          <div class="sidebar-kicker mono">ACCOUNT</div>
          <div class="sidebar-nav">
            <div class="sidebar-nav-item active mono">Dashboard</div>
            <div class="sidebar-nav-item mono">Settings</div>
          </div>
        </div>
        <div class="workers-main">
          <div class="breadcrumb mono">${esc(shortAddr(address))}</div>
          <div id="workers-main-body">${bodyHTML}</div>
        </div>
      </div>
    </div>
  `;
}

async function renderWorkersView(root, address) {
  root.innerHTML = workersLayoutShell(address, '<div class="loading">Loading workers…</div>');

  let client, network;
  try {
    [client, network] = await Promise.all([
      apiGet(`/client/${encodeURIComponent(address)}`),
      apiGet('/network'),
    ]);
  } catch (err) {
    document.getElementById('workers-main-body').innerHTML = errorHTML('Could not load worker data for this address.');
    return;
  }

  let chartData = [];
  try { chartData = await apiGet(`/client/${encodeURIComponent(address)}/chart`); } catch (e) { /* leave empty */ }

  const groups = groupWorkers(client.workers || []);
  const bestDiffFormatted = client.bestDifficulty != null ? formatDifficulty(client.bestDifficulty) : '0';
  const bestDiffFull = client.bestDifficulty != null ? formatNumberFull(client.bestDifficulty) : '';
  const values = chartData.map(p => Number(p.data));
  const smoothed = movingAverage(values, 12);

  document.getElementById('workers-main-body').innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Your Best Difficulty <span class="stat-badge" title="Best share difficulty you've submitted">★</span></div>
        <div class="stat-value mono">${bestDiffFormatted}</div>
        <div class="stat-detail mono">${bestDiffFull}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Network Difficulty</div>
        <div class="stat-value mono">${formatDifficulty(network.difficulty)}</div>
        <div class="stat-detail mono">${formatNumberFull(network.difficulty)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Network Hash Rate</div>
        <div class="stat-value mono">${formatHashrate(network.networkhashps)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Block Height</div>
        <div class="stat-value mono">${esc(network.blocks)}</div>
      </div>
    </div>

    <div class="panel">
      <div class="group-header-cols"><div>Name</div><div>Session ID</div><div>Hash Rate</div><div>Best Diff.</div><div>Uptime</div><div>Last Seen</div></div>
      <div id="worker-groups">${groups.length ? renderGroups(groups) : '<div class="empty-note">No workers found for this address.</div>'}</div>
    </div>

    <div class="panel panel-pad">
      <div class="chart-panel-head">
        <div style="font-size:15px;font-weight:800;">YOUR HASHRATE</div>
        <div class="chart-legend">
          <button id="toggle-2h"><span class="swatch solid"></span>2 Hour</button>
          <button id="toggle-10m"><span class="swatch outline"></span>10 Minute</button>
        </div>
      </div>
      ${values.length ? dualChartSVG(values, smoothed) : '<div class="chart-empty">No chart data yet.</div>'}
      <div class="chart-axis mono">${pickTicks(chartData, 6).map(t => `<span>${t}</span>`).join('')}</div>
    </div>
  `;

  const groupsContainer = document.getElementById('worker-groups');
  groupsContainer.addEventListener('click', (e) => {
    const rowEl = e.target.closest('.group-row');
    if (rowEl) { navDetail(address, rowEl.dataset.worker, rowEl.dataset.session); return; }
    const headerEl = e.target.closest('.group-header');
    if (headerEl) {
      const name = headerEl.dataset.group;
      if (expandedGroups.has(name)) expandedGroups.delete(name); else expandedGroups.add(name);
      groupsContainer.innerHTML = renderGroups(groups);
    }
  });

  const path2h = document.getElementById('path-2h');
  const path10m = document.getElementById('path-10m');
  const btn2h = document.getElementById('toggle-2h');
  const btn10m = document.getElementById('toggle-10m');
  if (btn2h && path2h) {
    btn2h.addEventListener('click', () => {
      const hidden = path2h.style.display === 'none';
      path2h.style.display = hidden ? '' : 'none';
      btn2h.style.opacity = hidden ? '1' : '0.35';
    });
    btn10m.addEventListener('click', () => {
      const hidden = path10m.style.display === 'none';
      path10m.style.display = hidden ? '' : 'none';
      btn10m.style.opacity = hidden ? '1' : '0.35';
    });
  }
}

// --------------------------------------------------------------- detail --

async function renderDetailView(root, address, workerName, sessionId) {
  root.innerHTML = `<div class="page page-narrow"><div class="loading">Loading worker…</div></div>`;

  let detail;
  try {
    detail = await apiGet(`/client/${encodeURIComponent(address)}/${encodeURIComponent(workerName)}/${encodeURIComponent(sessionId)}`);
  } catch (err) {
    document.querySelector('#app .page').innerHTML = errorHTML('Could not load this worker.');
    return;
  }

  const chartData = detail.chartData || [];
  const values = chartData.map(p => Number(p.data));
  const current = values.length ? values[values.length - 1] : 0;

  document.querySelector('#app .page').innerHTML = `
    <div class="breadcrumb mono">${esc(shortAddr(address))}.${esc(workerName)}</div>
    <div class="detail-layout">
      <div class="detail-main">
        <div class="chart-kicker mono">CURRENT HASHRATE</div>
        <div class="chart-value mono">${formatHashrateParts(current)}</div>
        <div style="margin-top:18px;">
          ${values.length ? areaChartSVG(values, { h: 240 }) : '<div class="chart-empty">No chart data yet.</div>'}
        </div>
        <div class="chart-axis mono">${pickTicks(chartData, 6).map(t => `<span>${t}</span>`).join('')}</div>
      </div>
      <div class="detail-side">
        <div class="detail-stat">
          <div class="detail-stat-label">Best Difficulty</div>
          <div class="detail-stat-value mono">${formatDifficulty(detail.bestDifficulty)}</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-label">Uptime</div>
          <div class="detail-stat-value mono">${detail.startTime ? formatDuration(detail.startTime) : '—'}</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-label">Session ID</div>
          <div class="detail-stat-value mono">${esc(detail.sessionId)}</div>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------- init --

function applyBranding() {
  document.title = SITE_CONFIG.siteName;
  document.getElementById('topbar-domain').textContent = SITE_CONFIG.topbarDomain;
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', () => { initTheme(); applyBranding(); render(); });
