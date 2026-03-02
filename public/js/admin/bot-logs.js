// ── Bot Status ──────────────────────────────────────────────────────────────

window.loadBotStatus = async function () {
  const AS = window.AdminState;
  try {
    const data    = await apiFetch('/crm/bot/status');
    const dot     = document.getElementById('bot-status-dot');
    const text    = document.getElementById('bot-status-text');
    const details = document.getElementById('bot-status-details');
    const qrWrap  = document.getElementById('qr-container-wrap');
    const qrEl    = document.getElementById('qr-container');

    dot.className  = `status-dot ${data.status}`;
    text.textContent = data.status === 'connected' ? 'Connected'
                     : data.status === 'scanning'  ? 'Scanning QR Code'
                     : 'Disconnected';

    let html = '';
    if (data.phone)    html += `<div><span class="text-gray-400">Phone:</span> <span class="font-medium">${escHtml(data.phone)}</span></div>`;
    if (data.pushName) html += `<div><span class="text-gray-400">Name:</span> <span class="font-medium">${escHtml(data.pushName)}</span></div>`;
    details.innerHTML = html;

    if (data.uptime !== undefined) {
      const h = Math.floor(data.uptime / 3600);
      const m = Math.floor((data.uptime % 3600) / 60);
      const s = data.uptime % 60;
      document.getElementById('bot-uptime').textContent = `${h}h ${m}m ${s}s`;
    }

    if (data.status === 'scanning' && data.qrCode) {
      qrWrap.classList.remove('hidden');
      qrEl.innerHTML = '';
      if (AS.qrInstance) { try { AS.qrInstance.clear(); } catch (_) {} }
      if (typeof QRCode !== 'undefined') {
        AS.qrInstance = new QRCode(qrEl, { text: data.qrCode, width: 200, height: 200 });
      } else {
        qrEl.textContent = 'QR library not available';
      }
    } else {
      qrWrap.classList.add('hidden');
      if (AS.qrInstance) { try { AS.qrInstance.clear(); } catch (_) {} AS.qrInstance = null; }
    }
  } catch {
    showToast('Failed to load bot status', 'error');
  }
};

window.reconnectBot = async function () {
  try {
    await apiFetch('/crm/bot/reconnect', 'POST');
    showToast('Reconnecting bot…', 'info');
    setTimeout(loadBotStatus, 3000);
  } catch {
    showToast('Reconnect failed', 'error');
  }
};

// ── Live Logs (SSE) ────────────────────────────────────────────────────────

function startLogStream() {
  const AS = window.AdminState;
  if (AS.logEventSource) return;
  const token = localStorage.getItem('token');
  AS.logEventSource = new EventSource(`/crm/logs/stream?token=${encodeURIComponent(token)}`);
  AS.logEventSource.onmessage = e => {
    try {
      const entry = JSON.parse(e.data);
      AS.logEntries.push(entry);
      if (AS.logEntries.length > 500) AS.logEntries.shift();
      appendLogLine(entry);
    } catch (_) {}
  };
}

function stopLogStream() {
  const AS = window.AdminState;
  if (AS.logEventSource) { AS.logEventSource.close(); AS.logEventSource = null; }
}

function appendLogLine(entry) {
  const AS = window.AdminState;
  const el = document.getElementById('log-output');
  if (!el) return;
  if (AS.logFilter !== 'all' && entry.level !== AS.logFilter) return;
  const colors = { error: '#f87171', warn: '#fbbf24', info: '#60a5fa', debug: '#a78bfa', verbose: '#6ee7b7' };
  const span = document.createElement('span');
  span.dataset.level = entry.level;
  span.style.color   = colors[entry.level] || '#cbd5e1';
  span.textContent   = `[${entry.timestamp}] ${(entry.level || '').toUpperCase()}: ${entry.message}\n`;
  el.appendChild(span);
  const autoScroll = document.getElementById('auto-scroll');
  if (!autoScroll || autoScroll.checked) el.scrollTop = el.scrollHeight;
}

window.setLogFilter = function (level) {
  const AS = window.AdminState;
  AS.logFilter = level;
  document.querySelectorAll('.log-filter-btn').forEach(btn => {
    const active = btn.dataset.level === level;
    btn.classList.toggle('bg-slate-700', active);
    btn.classList.toggle('text-white',   active);
    btn.classList.toggle('bg-gray-100',  !active);
    btn.classList.toggle('text-gray-600', !active);
  });
  const el = document.getElementById('log-output');
  if (!el) return;
  el.innerHTML = '';
  AS.logEntries.forEach(entry => appendLogLine(entry));
};

window.clearLogs = function () {
  const AS = window.AdminState;
  AS.logEntries = [];
  const el = document.getElementById('log-output');
  if (el) el.innerHTML = '';
};
