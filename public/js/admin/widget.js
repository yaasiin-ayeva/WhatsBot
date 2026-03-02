// Widget Settings

async function loadWidgetSettings() {
  try {
    const s = await apiFetch('/crm/widget-settings');
    renderWidgetSettings(s);
  } catch {
    showToast('Failed to load widget settings', 'error');
  }
}

function renderWidgetSettings(s) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
  const setChecked = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
  const setSelected = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };

  set('widget-primary-color', s.primaryColor);
  set('widget-primary-color-text', s.primaryColor);
  set('widget-secondary-color', s.secondaryColor);
  set('widget-secondary-color-text', s.secondaryColor);
  set('widget-header-text', s.headerText);
  set('widget-operator-name', s.operatorName);
  set('widget-welcome-message', s.welcomeMessage);
  set('widget-online-message', s.onlineMessage);
  set('widget-offline-message', s.offlineMessage);
  set('widget-placeholder', s.placeholderText);
  set('widget-logo-url', s.logoUrl);
  set('widget-wa-number', s.whatsappNumber);
  set('widget-allowed-domains', (s.allowedDomains || []).join(', '));
  setSelected('widget-button-style', s.buttonStyle);
  setSelected('widget-position', s.displayPosition);
  setChecked('widget-enabled', s.enabled);
  setChecked('widget-track-ip', s.trackVisitorIp);
  setChecked('widget-wa-mode', s.whatsappMode);

  toggleWaMode(s.whatsappMode);
  renderWidgetSnippet(s.widgetId);
  updateWidgetPreview();
}

function toggleWaMode(on) {
  const waWrap = document.getElementById('widget-wa-wrap');
  if (waWrap) waWrap.classList.toggle('hidden', !on);
}

function renderWidgetSnippet(widgetId) {
  const origin = window.location.origin;
  const snippet = `<script src="${origin}/public/js/widget.js" data-widget-id="${widgetId}"><\/script>`;
  const el = document.getElementById('widget-snippet');
  if (el) el.textContent = snippet;
}

function updateWidgetPreview() {
  const color = document.getElementById('widget-primary-color')?.value || '#128C7E';
  const secondary = document.getElementById('widget-secondary-color')?.value || '#25D366';
  const style = document.getElementById('widget-button-style')?.value || 'round';
  const pos = document.getElementById('widget-position')?.value || 'bottom-right';
  const header = document.getElementById('widget-header-text')?.value || 'Chat with us';
  const welcome = document.getElementById('widget-welcome-message')?.value || '';
  const online = document.getElementById('widget-online-message')?.value || '';
  const logoUrl = document.getElementById('widget-logo-url')?.value || '';
  const waMode = document.getElementById('widget-wa-mode')?.checked || false;

  const preview = document.getElementById('widget-live-preview');
  if (!preview) return;

  const posStyle = pos === 'bottom-left' ? 'left:16px' : 'right:16px';
  const btnIcon = waMode
    ? `<svg width="22" height="22" viewBox="0 0 32 32" fill="#fff"><path d="M16 0C7.164 0 0 7.163 0 16c0 2.822.737 5.474 2.027 7.773L0 32l8.469-2.018A15.93 15.93 0 0 0 16 32c8.836 0 16-7.163 16-16S24.836 0 16 0zm8.328 22.663c-.347.975-2.012 1.862-2.77 1.977-.708.106-1.605.151-2.588-.163-.596-.19-1.361-.444-2.342-.87-4.12-1.784-6.813-5.95-7.017-6.224-.203-.274-1.667-2.217-1.667-4.228s1.054-3.002 1.428-3.414c.373-.411.813-.514 1.083-.514s.541.005.779.014c.25.01.584-.095.914.698.347.825 1.18 2.836 1.284 3.04.102.204.17.443.034.714-.136.272-.203.44-.406.677-.203.237-.428.53-.61.712-.203.204-.413.424-.178.832.236.408 1.047 1.726 2.247 2.793 1.543 1.373 2.844 1.798 3.253 2.002.407.203.645.17.882-.102.237-.272 1.015-1.185 1.285-1.592.271-.407.543-.339.915-.204.374.135 2.374 1.12 2.78 1.323.407.204.678.305.779.474.101.169.101.978-.246 1.953z"/></svg>`
    : `<svg width="22" height="22" fill="none" stroke="#fff" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

  const btnBg = waMode ? '#25D366' : color;

  let btnHtml = '';
  if (style === 'round') {
    btnHtml = `<div style="position:absolute;bottom:16px;${posStyle};width:48px;height:48px;border-radius:50%;background:${btnBg};display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.25);cursor:pointer">${btnIcon}</div>`;
  } else {
    btnHtml = `<div style="position:absolute;bottom:0;${posStyle};padding:8px 14px;border-radius:16px 16px 0 0;background:${btnBg};display:flex;align-items:center;gap:6px;cursor:pointer;color:#fff;font-size:12px;font-weight:600;box-shadow:0 -2px 12px rgba(0,0,0,.15)">${btnIcon}<span>${escHtml(header)}</span></div>`;
  }

  const panelOffset = style === 'tab' ? '36px' : '72px';
  const logoHtml = logoUrl ? `<img src="${escHtml(logoUrl)}" style="width:28px;height:28px;border-radius:50%;object-fit:cover" />` : '💬';

  preview.innerHTML = `
    <div style="position:relative;width:100%;height:100%">
      ${btnHtml}
      <div style="position:absolute;bottom:${panelOffset};${posStyle};width:240px;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.18);font-family:-apple-system,sans-serif;">
        <div style="background:${color};padding:10px 12px;display:flex;align-items:center;gap:8px;color:#fff">
          <div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${logoHtml}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:12px;line-height:1.2">${escHtml(header)}</div>
            <div style="font-size:10px;opacity:.85">${escHtml(online)}</div>
          </div>
          <span style="font-size:14px;opacity:.7;cursor:pointer">✕</span>
        </div>
        <div style="background:#ECE5DD;padding:10px;min-height:80px">
          ${welcome ? `<div style="background:#fff;border-radius:6px;padding:6px 10px;font-size:11px;color:#333;border-left:3px solid ${color}">${escHtml(welcome)}</div>` : ''}
        </div>
        <div style="background:#fff;padding:6px 8px;display:flex;gap:4px;align-items:center">
          <div style="flex:1;border:1px solid #ddd;border-radius:16px;padding:5px 10px;font-size:11px;color:#aaa">Type a message…</div>
          <div style="width:28px;height:28px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg width="12" height="12" fill="#fff" viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
          </div>
        </div>
      </div>
    </div>`;
}

window.saveWidgetSettings = async function () {
  const getVal = id => document.getElementById(id)?.value?.trim() ?? '';
  const getChecked = id => document.getElementById(id)?.checked ?? false;

  const domains = getVal('widget-allowed-domains')
    .split(',').map(d => d.trim()).filter(Boolean);

  const body = {
    enabled:        getChecked('widget-enabled'),
    buttonStyle:    getVal('widget-button-style'),
    displayPosition: getVal('widget-position'),
    primaryColor:   getVal('widget-primary-color'),
    secondaryColor: getVal('widget-secondary-color'),
    headerText:     getVal('widget-header-text'),
    operatorName:   getVal('widget-operator-name'),
    welcomeMessage: getVal('widget-welcome-message'),
    onlineMessage:  getVal('widget-online-message'),
    offlineMessage: getVal('widget-offline-message'),
    placeholderText: getVal('widget-placeholder'),
    logoUrl:        getVal('widget-logo-url'),
    trackVisitorIp: getChecked('widget-track-ip'),
    allowedDomains: domains,
    whatsappMode:   getChecked('widget-wa-mode'),
    whatsappNumber: getVal('widget-wa-number'),
  };

  try {
    const s = await apiFetch('/crm/widget-settings', 'PUT', body);
    renderWidgetSettings(s);
    showToast('Widget settings saved', 'success');
  } catch {
    showToast('Failed to save widget settings', 'error');
  }
};

window.rotateWidgetId = async function () {
  if (!confirm('Generate a new widget ID? The old embed snippet will stop working.')) return;
  try {
    const { widgetId } = await apiFetch('/crm/widget-settings/rotate-id', 'POST');
    renderWidgetSnippet(widgetId);
    showToast('Widget ID rotated — update your embed snippet', 'success');
  } catch {
    showToast('Failed to rotate widget ID', 'error');
  }
};

window.copyWidgetSnippet = function () {
  const text = document.getElementById('widget-snippet')?.textContent || '';
  navigator.clipboard.writeText(text).then(() => showToast('Snippet copied!', 'success'));
};
