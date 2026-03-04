/**
 * WhatsBot Chat Widget — embeddable script
 * Usage: <script src="https://your-domain/public/js/widget.js" data-widget-id="YOUR_ID"></script>
 */
(function () {
  'use strict';

  var scriptEl = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var widgetId = scriptEl.getAttribute('data-widget-id');
  if (!widgetId) { console.warn('[WhatsBot Widget] Missing data-widget-id attribute'); return; }

  // Infer base URL from the script src
  var scriptSrc = scriptEl.getAttribute('src') || '';
  var baseUrl = scriptSrc.replace(/\/public\/js\/widget\.js.*$/, '');
  if (!baseUrl) baseUrl = window.location.origin;

  var SESSION_KEY = 'wbot_session_' + widgetId;
  var POLL_INTERVAL = 4000; // ms between reply polls
  var cfg = null;
  var sessionId = null;
  var phoneNumber = null;
  var pollTimer = null;
  var lastReplyTs = null;
  var open = false;

  // ── Session ID ────────────────────────────────────────────────────
  function getSessionId() {
    var id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  // ── Fetch config ─────────────────────────────────────────────────
  function fetchConfig(cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', baseUrl + '/crm/widget/config/' + widgetId);
    xhr.onload = function () {
      if (xhr.status === 200) {
        try { cb(null, JSON.parse(xhr.responseText)); } catch (e) { cb(e); }
      } else { cb(new Error('status ' + xhr.status)); }
    };
    xhr.onerror = function () { cb(new Error('network error')); };
    xhr.send();
  }

  // ── Build styles ──────────────────────────────────────────────────
  function injectStyles(c) {
    var pos = c.displayPosition === 'bottom-left' ? 'left:24px' : 'right:24px';
    var css = [
      '.wbot-btn{position:fixed;bottom:24px;' + pos + ';z-index:99999;cursor:pointer;border:none;outline:none;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(0,0,0,.25);transition:transform .2s,box-shadow .2s;}',
      '.wbot-btn:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(0,0,0,.3);}',
      '.wbot-btn.round{width:56px;height:56px;border-radius:50%;background:' + c.primaryColor + ';}',
      '.wbot-btn.tab{padding:10px 18px;border-radius:24px 24px 0 0;background:' + c.primaryColor + ';writing-mode:horizontal-tb;bottom:0;font-size:14px;font-weight:600;color:#fff;gap:8px;}',
      '.wbot-panel{position:fixed;bottom:90px;' + pos + ';z-index:99998;width:340px;max-width:calc(100vw - 32px);border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.2);display:none;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '.wbot-panel.tab-style{bottom:44px;}',
      '.wbot-header{background:' + c.primaryColor + ';padding:14px 16px;display:flex;align-items:center;gap:10px;color:#fff;}',
      '.wbot-avatar{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}',
      '.wbot-hinfo{flex:1;min-width:0;}',
      '.wbot-hname{font-weight:700;font-size:15px;line-height:1.2;}',
      '.wbot-hsub{font-size:12px;opacity:.85;margin-top:1px;}',
      '.wbot-close{background:none;border:none;color:#fff;cursor:pointer;font-size:18px;padding:2px;opacity:.8;line-height:1;}',
      '.wbot-close:hover{opacity:1;}',
      '.wbot-body{flex:1;background:#ECE5DD;overflow-y:auto;max-height:320px;min-height:180px;padding:12px;}',
      '.wbot-msg{margin-bottom:8px;display:flex;}',
      '.wbot-msg.in{justify-content:flex-start;}',
      '.wbot-msg.out{justify-content:flex-end;}',
      '.wbot-bubble{max-width:80%;padding:8px 12px;border-radius:8px;font-size:13px;line-height:1.45;word-break:break-word;}',
      '.wbot-msg.in .wbot-bubble{background:#fff;border-radius:0 8px 8px 8px;color:#111;}',
      '.wbot-msg.out .wbot-bubble{background:' + c.secondaryColor + ';border-radius:8px 8px 0 8px;color:#fff;}',
      '.wbot-time{font-size:10px;opacity:.6;margin-top:2px;text-align:right;}',
      '.wbot-footer{background:#fff;padding:8px 10px;display:flex;gap:6px;align-items:flex-end;}',
      '.wbot-input{flex:1;border:1px solid #ddd;border-radius:20px;padding:8px 14px;font-size:13px;resize:none;outline:none;max-height:80px;line-height:1.4;font-family:inherit;}',
      '.wbot-input:focus{border-color:' + c.primaryColor + ';}',
      '.wbot-send{width:36px;height:36px;border-radius:50%;background:' + c.primaryColor + ';border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff;}',
      '.wbot-send:hover{opacity:.85;}',
      '.wbot-welcome{background:#fff;border-radius:8px;padding:10px 14px;font-size:13px;color:#333;text-align:center;margin-bottom:12px;border-left:3px solid ' + c.primaryColor + ';}',
      '.wbot-typing{display:flex;gap:4px;padding:4px 0;}',
      '.wbot-dot{width:6px;height:6px;border-radius:50%;background:#999;animation:wbotbounce 1.2s infinite;}',
      '.wbot-dot:nth-child(2){animation-delay:.2s}',
      '.wbot-dot:nth-child(3){animation-delay:.4s}',
      '@keyframes wbotbounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}',
    ].join('');
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ── Build DOM ─────────────────────────────────────────────────────
  function buildUI(c) {
    // Button
    var btn = document.createElement('button');
    btn.className = 'wbot-btn ' + (c.buttonStyle === 'tab' ? 'tab' : 'round');
    if (c.buttonStyle === 'tab') {
      btn.innerHTML = '<svg width="18" height="18" fill="none" stroke="#fff" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span style="color:#fff">' + esc(c.headerText) + '</span>';
    } else {
      btn.innerHTML = c.logoUrl
        ? '<img src="' + esc(c.logoUrl) + '" style="width:34px;height:34px;border-radius:50%;object-fit:cover" />'
        : '<svg width="26" height="26" fill="none" stroke="#fff" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    }
    document.body.appendChild(btn);

    // Panel
    var panel = document.createElement('div');
    panel.className = 'wbot-panel' + (c.buttonStyle === 'tab' ? ' tab-style' : '');
    panel.innerHTML = [
      '<div class="wbot-header">',
        '<div class="wbot-avatar">' + (c.logoUrl ? '<img src="' + esc(c.logoUrl) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />' : '💬') + '</div>',
        '<div class="wbot-hinfo">',
          '<div class="wbot-hname">' + esc(c.headerText) + '</div>',
          '<div class="wbot-hsub">' + esc(c.onlineMessage) + '</div>',
        '</div>',
        '<button class="wbot-close" onclick="this.closest(\'.wbot-panel\').style.display=\'none\'">✕</button>',
      '</div>',
      '<div class="wbot-body" id="wbot-body-' + widgetId + '">',
        '<div class="wbot-welcome">' + esc(c.welcomeMessage) + '</div>',
      '</div>',
      '<div class="wbot-footer">',
        '<textarea class="wbot-input" id="wbot-input-' + widgetId + '" rows="1" placeholder="' + esc(c.placeholderText) + '"></textarea>',
        '<button class="wbot-send" id="wbot-send-' + widgetId + '" title="Send"><svg width="16" height="16" fill="#fff" viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg></button>',
      '</div>',
    ].join('');
    document.body.appendChild(panel);

    // Toggle
    btn.addEventListener('click', function () {
      open = !open;
      panel.style.display = open ? 'flex' : 'none';
      if (open) {
        var inp = document.getElementById('wbot-input-' + widgetId);
        if (inp) inp.focus();
        startPolling();
      } else {
        stopPolling();
      }
    });

    // Send on Enter (Shift+Enter = newline)
    var inp = document.getElementById('wbot-input-' + widgetId);
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    document.getElementById('wbot-send-' + widgetId).addEventListener('click', sendMessage);
  }

  // ── WhatsApp redirect mode ────────────────────────────────────────
  function buildWaButton(c) {
    var pos = c.displayPosition === 'bottom-left' ? 'left:24px' : 'right:24px';
    var css = [
      '.wbot-wa{position:fixed;bottom:24px;' + pos + ';z-index:99999;cursor:pointer;border:none;outline:none;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(0,0,0,.25);transition:transform .2s;text-decoration:none;}',
      '.wbot-wa:hover{transform:scale(1.08);}',
      '.wbot-wa.round{width:56px;height:56px;border-radius:50%;background:#25D366;}',
      '.wbot-wa.tab{padding:10px 18px;border-radius:24px 24px 0 0;background:#25D366;bottom:0;font-size:14px;font-weight:600;color:#fff;gap:8px;}',
    ].join('');
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);

    var waUrl = 'https://wa.me/' + c.whatsappNumber.replace(/\D/g, '') + '?text=' + encodeURIComponent(c.welcomeMessage || '');
    var a = document.createElement('a');
    a.href = waUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'wbot-wa ' + (c.buttonStyle === 'tab' ? 'tab' : 'round');
    if (c.buttonStyle === 'tab') {
      a.innerHTML = '<svg width="18" height="18" viewBox="0 0 32 32" fill="#fff"><path d="M16 0C7.164 0 0 7.163 0 16c0 2.822.737 5.474 2.027 7.773L0 32l8.469-2.018A15.93 15.93 0 0 0 16 32c8.836 0 16-7.163 16-16S24.836 0 16 0zm8.328 22.663c-.347.975-2.012 1.862-2.77 1.977-.708.106-1.605.151-2.588-.163--.596-.19-1.361-.444-2.342-.87-4.12-1.784-6.813-5.95-7.017-6.224-.203-.274-1.667-2.217-1.667-4.228s1.054-3.002 1.428-3.414c.373-.411.813-.514 1.083-.514s.541.005.779.014c.25.01.584-.095.914.698.347.825 1.18 2.836 1.284 3.04.102.204.17.443.034.714-.136.272-.203.44-.406.677-.203.237-.428.53-.61.712-.203.204-.413.424-.178.832.236.408 1.047 1.726 2.247 2.793 1.543 1.373 2.844 1.798 3.253 2.002.407.203.645.17.882-.102.237-.272 1.015-1.185 1.285-1.592.271-.407.543-.339.915-.204.374.135 2.374 1.12 2.78 1.323.407.204.678.305.779.474.101.169.101.978-.246 1.953z"/></svg><span>' + esc(c.headerText) + '</span>';
    } else {
      a.innerHTML = '<svg width="28" height="28" viewBox="0 0 32 32" fill="#fff"><path d="M16 0C7.164 0 0 7.163 0 16c0 2.822.737 5.474 2.027 7.773L0 32l8.469-2.018A15.93 15.93 0 0 0 16 32c8.836 0 16-7.163 16-16S24.836 0 16 0zm8.328 22.663c-.347.975-2.012 1.862-2.77 1.977-.708.106-1.605.151-2.588-.163-.596-.19-1.361-.444-2.342-.87-4.12-1.784-6.813-5.95-7.017-6.224-.203-.274-1.667-2.217-1.667-4.228s1.054-3.002 1.428-3.414c.373-.411.813-.514 1.083-.514s.541.005.779.014c.25.01.584-.095.914.698.347.825 1.18 2.836 1.284 3.04.102.204.17.443.034.714-.136.272-.203.44-.406.677-.203.237-.428.53-.61.712-.203.204-.413.424-.178.832.236.408 1.047 1.726 2.247 2.793 1.543 1.373 2.844 1.798 3.253 2.002.407.203.645.17.882-.102.237-.272 1.015-1.185 1.285-1.592.271-.407.543-.339.915-.204.374.135 2.374 1.12 2.78 1.323.407.204.678.305.779.474.101.169.101.978-.246 1.953z"/></svg>';
    }
    document.body.appendChild(a);
  }

  // ── Message helpers ───────────────────────────────────────────────
  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function addMessage(body, direction, ts) {
    var bodyEl = document.getElementById('wbot-body-' + widgetId);
    if (!bodyEl) return;
    var time = ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    var div = document.createElement('div');
    div.className = 'wbot-msg ' + direction;
    div.innerHTML = '<div class="wbot-bubble">' + esc(body) + '<div class="wbot-time">' + time + '</div></div>';
    bodyEl.appendChild(div);
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  function sendMessage() {
    var inp = document.getElementById('wbot-input-' + widgetId);
    var msg = inp.value.trim();
    if (!msg) return;
    inp.value = '';
    inp.style.height = '';
    addMessage(msg, 'out', new Date());

    var xhr = new XMLHttpRequest();
    xhr.open('POST', baseUrl + '/crm/widget/chat');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data.phoneNumber) phoneNumber = data.phoneNumber;
          lastReplyTs = lastReplyTs || new Date().toISOString();
        } catch (e) { /* ignore */ }
      }
    };
    xhr.send(JSON.stringify({
      widgetId: widgetId,
      visitorName: '',
      visitorSessionId: sessionId,
      message: msg,
      pageUrl: window.location.href,
    }));
  }

  // ── Polling for replies ───────────────────────────────────────────
  function startPolling() {
    if (pollTimer || !phoneNumber) return;
    pollTimer = setInterval(pollReplies, POLL_INTERVAL);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function pollReplies() {
    if (!phoneNumber) return;
    var since = lastReplyTs || new Date(Date.now() - 60000).toISOString();
    var xhr = new XMLHttpRequest();
    xhr.open('GET', baseUrl + '/crm/widget/replies/' + encodeURIComponent(phoneNumber) + '?since=' + encodeURIComponent(since) + '&widgetId=' + encodeURIComponent(widgetId));
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          var msgs = JSON.parse(xhr.responseText);
          msgs.forEach(function (m) {
            addMessage(m.body, 'in', m.timestamp);
            lastReplyTs = m.timestamp;
          });
        } catch (e) { /* ignore */ }
      }
    };
    xhr.send();
  }

  // ── Auto-resize textarea ──────────────────────────────────────────
  function initAutoResize() {
    var inp = document.getElementById('wbot-input-' + widgetId);
    if (!inp) return;
    inp.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 80) + 'px';
    });
  }

  // ── Init ──────────────────────────────────────────────────────────
  function init() {
    sessionId = getSessionId();
    fetchConfig(function (err, config) {
      if (err) { console.warn('[WhatsBot Widget] Failed to load config:', err); return; }
      cfg = config;
      if (cfg.whatsappMode) {
        buildWaButton(cfg);
      } else {
        injectStyles(cfg);
        buildUI(cfg);
        initAutoResize();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
