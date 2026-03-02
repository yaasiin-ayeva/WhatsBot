// ── Toast notifications ───────────────────────────────────────────────────────
window.showToast = function (message, type = 'success') {
  const colors = { success: 'bg-green-600', error: 'bg-red-600', warning: 'bg-amber-500', info: 'bg-blue-600' };
  const icons  = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
  const toast  = document.createElement('div');
  toast.className = `toast pointer-events-auto flex items-center gap-3 ${colors[type] || colors.success} text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium`;
  toast.innerHTML = `<i class="fas ${icons[type] || icons.success}"></i><span>${escHtml(String(message))}</span>`;
  document.getElementById('toast-container').appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    toast.style.opacity    = '0';
    toast.style.transform  = 'translateX(16px)';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
};

// ── Pagination ────────────────────────────────────────────────────────────────
function renderPagination(meta, loadFn, containerId) {
  const div = document.getElementById(containerId);
  if (!div) return;
  div.innerHTML = '';
  if (!meta || meta.pages <= 1) return;

  const btn = (label, page, disabled, active) => {
    const b = document.createElement('button');
    b.innerHTML = label;
    b.className = `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
      active   ? 'bg-indigo-600 text-white border-indigo-600' :
      disabled ? 'text-gray-300 border-gray-200 cursor-not-allowed' :
                 'text-gray-600 border-gray-200 hover:bg-gray-50'
    }`;
    b.disabled = disabled;
    if (!disabled) b.addEventListener('click', () => loadFn(page));
    return b;
  };

  div.appendChild(btn('<i class="fas fa-chevron-left text-xs"></i>', meta.page - 1, meta.page === 1, false));
  const start = Math.max(1, meta.page - 2), end = Math.min(meta.pages, start + 4);
  for (let i = start; i <= end; i++) div.appendChild(btn(i, i, false, i === meta.page));
  div.appendChild(btn('<i class="fas fa-chevron-right text-xs"></i>', meta.page + 1, meta.page === meta.pages, false));
}

// ── Generic utilities ─────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function langBadge(lang) {
  if (lang === 'en') return '<span class="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">🇬🇧 English</span>';
  if (lang === 'fr') return '<span class="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full">🇫🇷 French</span>';
  return '<span class="inline-flex items-center text-xs bg-gray-100 text-gray-600 font-semibold px-2 py-0.5 rounded-full">Other</span>';
}

function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function redirect(path) { window.location.href = path; }

// ── Chat / message helpers ────────────────────────────────────────────────────
function avatarColor(str) {
  const colors = ['#128C7E','#25D366','#075E54','#34B7F1','#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#ef4444'];
  let h = 0; for (let i = 0; i < (str||'').length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
  return colors[h % colors.length];
}

function avatarInitials(name) {
  const parts = (name || '?').split(' ').filter(Boolean);
  return parts.length >= 2 ? (parts[0][0]+parts[1][0]).toUpperCase() : (name||'?').slice(0,2).toUpperCase();
}

function fmtMsgTime(ts) {
  if (!ts) return '';
  const d = new Date(ts); const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  return isToday
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function buildBubble(m) {
  const isOut = m.direction === 'out';
  const rowCls    = isOut ? 'msg-row-out' : 'msg-row-in';
  const bubbleCls = isOut ? 'msg-bubble msg-bubble-out' : 'msg-bubble msg-bubble-in';
  const timeColor = isOut ? '#5a7a5c' : '#999';
  return `<div class="${rowCls}">
    <div class="${bubbleCls}">
      ${escHtml(m.body)}
      <div class="msg-time" style="color:${timeColor}">${fmtMsgTime(m.timestamp)}</div>
    </div>
  </div>`;
}

function buildDateSeparator(label) {
  return `<div class="date-sep"><span>${escHtml(label)}</span></div>`;
}

function renderMsgList(msgs, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  if (!msgs || !msgs.length) {
    el.innerHTML = '<p class="text-center text-xs text-gray-400 mt-10">No messages yet</p>';
    return;
  }
  let lastDate = '';
  msgs.forEach(m => {
    const d = new Date(m.timestamp);
    const dateStr = d.toLocaleDateString([], { weekday:'long', month:'short', day:'numeric' });
    if (dateStr !== lastDate) {
      el.insertAdjacentHTML('beforeend', buildDateSeparator(dateStr));
      lastDate = dateStr;
    }
    el.insertAdjacentHTML('beforeend', buildBubble(m));
  });
  el.scrollTop = el.scrollHeight;
}

function appendBubble(m, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.insertAdjacentHTML('beforeend', buildBubble(m));
  el.scrollTop = el.scrollHeight;
}
