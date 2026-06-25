/**
 * Drone Control — shared core module
 * Handles: socket connection, API calls, telemetry updates, console logging
 */
const Drone = (() => {
  let socket = null;

  /* ── Init ────────────────────────────────────────────── */
  function init() {
    const saved = getSavedUrl();
    const inp = document.getElementById('drone-url');
    if (inp && saved) inp.value = saved;
    toggleBanner(!saved);
    if (saved) connect(saved);

    document.getElementById('url-save')?.addEventListener('click', saveUrl);
    document.getElementById('drone-url')?.addEventListener('keydown', e => { if (e.key === 'Enter') saveUrl(); });
    document.getElementById('conn-badge')?.addEventListener('click', () => toggleBanner());
  }

  /* ── URL helpers ─────────────────────────────────────── */
  function getSavedUrl() { return localStorage.getItem('droneUrl') || ''; }

  function saveUrl() {
    const inp = document.getElementById('drone-url');
    let url = (inp?.value || '').trim().replace(/\/+$/, '');
    if (!url) return;
    localStorage.setItem('droneUrl', url);
    toggleBanner(false);
    connect(url);
  }

  function toggleBanner(show) {
    const banner = document.getElementById('url-banner');
    if (!banner) return;
    if (show === undefined) {
      banner.classList.toggle('hidden');
    } else {
      banner.classList.toggle('hidden', !show);
    }
  }

  /* ── Socket ──────────────────────────────────────────── */
  function connect(url) {
    if (socket) { socket.disconnect(); socket = null; }
    log('Connecting to ' + url, 'info');

    socket = io(url, {
      transports: ['websocket'],
      upgrade: false,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 10000,
    });

    socket.on('connect',       () => { setStatus(true);  log('Uplink established', 'success'); });
    socket.on('disconnect',    r  => { setStatus(false); log('Uplink lost: ' + r, 'warn'); });
    socket.on('connect_error', e  => { log('Error: ' + e.message, 'error'); });
    socket.on('telemetry',     d  => { applyTel(d); document.dispatchEvent(new CustomEvent('drone:tel', { detail: d })); });
  }

  function setStatus(ok) {
    document.getElementById('conn-dot')?.classList.toggle('connected', ok);
    const lbl = document.getElementById('conn-label');
    if (lbl) { lbl.textContent = ok ? 'CONNECTED' : 'DISCONNECTED'; lbl.classList.toggle('connected', ok); }
    document.getElementById('conn-badge')?.classList.toggle('connected', ok);
  }

  /* ── Telemetry ───────────────────────────────────────── */
  function applyTel(d) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const cls = (id, c) => { const el = document.getElementById(id); if (el) el.className = c; };

    set('tel-mode',   d.mode ?? '--');
    set('tel-range',  d.rangefinder != null ? d.rangefinder.toFixed(2) + ' m'   : '--');
    set('tel-alt',    d.altitude    != null ? d.altitude.toFixed(2)    + ' m'   : '--');
    set('tel-spd',    d.groundspeed != null ? d.groundspeed.toFixed(1) + ' m/s' : '--');
    set('tel-airspd', d.airspeed    != null ? d.airspeed.toFixed(1)    + ' m/s' : '--');
    set('tel-sats',   d.satellites ?? '--');
    set('tel-ekf',    d.ekf_ok    != null ? (d.ekf_ok    ? 'OK'  : 'FAIL') : '--');
    set('tel-arm2',   d.is_armable != null ? (d.is_armable ? 'YES' : 'NO')  : '--');
    set('tel-lat',    d.lat != null ? d.lat.toFixed(6) : '--');
    set('tel-lon',    d.lon != null ? d.lon.toFixed(6) : '--');
    set('tel-vx',     d.vibe_x != null ? d.vibe_x.toFixed(3) : '--');
    set('tel-vy',     d.vibe_y != null ? d.vibe_y.toFixed(3) : '--');
    set('tel-vz',     d.vibe_z != null ? d.vibe_z.toFixed(3) : '--');

    const r2d = 180 / Math.PI;
    set('tel-pitch', d.pitch != null ? (d.pitch * r2d).toFixed(2) + '°' : '--');
    set('tel-roll',  d.roll  != null ? (d.roll  * r2d).toFixed(2) + '°' : '--');
    if (d.yaw != null) {
      let y = d.yaw * r2d; if (y < 0) y += 360;
      set('tel-yaw', y.toFixed(1) + '°');
    }

    // Armed — color
    const aEl = document.getElementById('tel-armed');
    if (aEl) { aEl.textContent = d.armed ? 'ARMED' : 'SAFE'; aEl.className = 'tel-val ' + (d.armed ? 'r' : 'g'); }

    // GPS fix — color
    const gEl = document.getElementById('tel-gps');
    if (gEl) { gEl.textContent = d.gps_fix >= 3 ? '3D FIX' : 'NO FIX'; gEl.className = 'tel-val sm ' + (d.gps_fix >= 3 ? 'g' : 'r'); }

    // Battery — color threshold
    const bEl = document.getElementById('tel-bat');
    if (bEl && d.battery != null) {
      bEl.textContent = d.battery.toFixed(1) + 'V';
      bEl.className = 'tel-val ' + (d.battery < 13.2 ? 'r' : d.battery < 14.0 ? 'a' : 'g');
    }
    set('tel-batpct', d.battery_level != null ? d.battery_level + '%' : '');

    // Status pills
    set('pill-mode', d.mode ?? '--');
    set('pill-alt',  d.altitude    != null ? d.altitude.toFixed(1) + 'm'    : '--');
    const pbEl = document.getElementById('pill-bat');
    if (pbEl && d.battery != null) {
      pbEl.textContent = d.battery.toFixed(1) + 'V';
      pbEl.className = 'pill-val ' + (d.battery < 13.2 ? 'red' : d.battery < 14.0 ? 'amber' : 'green');
    }
    const paEl = document.getElementById('pill-armed');
    if (paEl) { paEl.textContent = d.armed ? 'ARMED' : 'SAFE'; paEl.className = 'pill-val ' + (d.armed ? 'red' : 'green'); }
    const pgEl = document.getElementById('pill-gps');
    if (pgEl) { pgEl.textContent = d.gps_fix >= 3 ? '3D' : 'NO FIX'; pgEl.className = 'pill-val ' + (d.gps_fix >= 3 ? 'green' : 'red'); }
  }

  /* ── API ─────────────────────────────────────────────── */
  async function api(endpoint, body = null) {
    const url = getSavedUrl();
    if (!url) { log('No server URL — click connection badge to configure', 'error'); return null; }

    const isGet = body === null && (endpoint.includes('?') || ['/status', '/health', '/queue/status'].includes(endpoint));
    const opts = { method: isGet ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);

    try {
      log('→ ' + endpoint, 'cmd');
      const res = await fetch(url + endpoint, opts);
      const ct  = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        log('Non-JSON response — server may be down', 'error');
        return null;
      }
      const data = await res.json();
      if (data.success === false || data.error) {
        log('✗ ' + (data.error || data.message || 'Command failed'), 'error');
      } else {
        log('✓ ' + (data.message || 'OK'), 'success');
      }
      return data;
    } catch (e) {
      log('Network error: ' + e.message, 'error');
      return null;
    }
  }

  /* ── Console ─────────────────────────────────────────── */
  function log(msg, type = 'info') {
    const box = document.getElementById('console-log');
    if (!box) return;
    const colors = { info: 'var(--text2)', success: 'var(--green)', error: 'var(--red)', cmd: 'var(--blue)', warn: 'var(--amber)' };
    const t   = new Date().toLocaleTimeString('en', { hour12: false });
    const row = document.createElement('div');
    row.className = 'log-row';
    row.innerHTML = `<span class="log-time">${t}</span><span class="log-msg" style="color:${colors[type] || colors.info}">${esc(String(msg))}</span>`;
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
    while (box.children.length > 300) box.removeChild(box.firstChild);
  }

  function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* ── Public ──────────────────────────────────────────── */
  return { init, api, log, getSavedUrl };
})();

window.addEventListener('DOMContentLoaded', () => Drone.init());
