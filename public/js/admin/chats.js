// Chats (merged inbox + archive)

async function loadChats() {
  const AS = window.AdminState;
  setChatsMode(false, '');
  try {
    AS.inboxConversations = await apiFetch('/crm/inbox');
    renderChatList(AS.inboxConversations, false);
    updateChatsBadge();
    startInboxStream();
  } catch {
    showToast('Failed to load chats', 'error');
  }
}

window.handleChatsSearch = function (q) {
  const AS = window.AdminState;
  const clearBtn = document.getElementById('chats-search-clear');
  if (clearBtn) clearBtn.classList.toggle('hidden', !q);
  clearTimeout(AS.chatsSearchTimer);
  if (!q) { loadChats(); return; }
  AS.chatsSearchTimer = setTimeout(async () => {
    setChatsMode(true, q);
    const el = document.getElementById('chats-list');
    if (el) el.innerHTML = '<p class="text-xs text-gray-400 text-center pt-6 px-4 animate-pulse">Searching…</p>';
    try {
      const threads = await apiFetch(`/crm/conversations/search?q=${encodeURIComponent(q)}`);
      renderChatList(threads, true);
    } catch {
      showToast('Search failed', 'error');
    }
  }, 350);
};

window.clearChatsSearch = function () {
  const input = document.getElementById('chats-search');
  if (input) input.value = '';
  document.getElementById('chats-search-clear')?.classList.add('hidden');
  loadChats();
};

function setChatsMode(isSearch, q) {
  const AS = window.AdminState;
  AS.chatsSearchMode = isSearch;
  const label = document.getElementById('chats-mode-label');
  if (!label) return;
  label.textContent = isSearch ? (q ? `"${q}"` : 'Search') : '';
}

function renderChatList(list, isSearchMode) {
  const AS = window.AdminState;
  const el = document.getElementById('chats-list');
  if (!el) return;
  if (!list.length) {
    el.innerHTML = `<p class="text-xs text-gray-400 text-center pt-10 px-4">${isSearchMode ? 'No results found' : 'No conversations yet'}</p>`;
    return;
  }
  el.innerHTML = '';
  list.forEach(item => {
    const phone    = item.phoneNumber;
    const contact  = item.contact;
    const name     = contact?.name || contact?.pushName || phone;
    const color    = avatarColor(name);
    const initials = avatarInitials(name);
    const preview  = item.lastMessage || (item.messages?.[item.messages.length - 1]?.body) || '—';
    const ts       = item.lastTimestamp || item.messages?.[item.messages.length - 1]?.timestamp;
    const isActive = phone === AS.currentInboxPhone;

    const div = document.createElement('div');
    div.className = `conv-item${isActive ? ' active' : ''}`;
    div.dataset.phone = phone;
    div.onclick = () => isSearchMode
      ? openSearchThread(item)
      : openConversation(phone, contact);

    div.innerHTML = `
      <div class="conv-avatar" style="background:${color};">${initials}</div>
      <div class="flex-grow min-w-0">
        <div class="flex items-center justify-between gap-1">
          <span class="text-sm font-semibold text-gray-900 truncate">${escHtml(name)}</span>
          <span class="text-xs text-gray-400 flex-shrink-0">${fmtMsgTime(ts)}</span>
        </div>
        <div class="flex items-center justify-between gap-1 mt-0.5">
          <p class="text-xs text-gray-500 truncate">${escHtml(preview)}</p>
          ${!isSearchMode && (item.unread > 0) ? `<div class="unread-dot flex-shrink-0">${item.unread}</div>` : ''}
          ${isSearchMode ? `<span class="text-xs text-indigo-400 flex-shrink-0">${item.matchCount} msg</span>` : ''}
        </div>
      </div>`;
    el.appendChild(div);
  });
}

window.openConversation = async function (phone, contact = null) {
  const AS = window.AdminState;
  AS.currentInboxPhone = phone;
  setChatHeader(phone, contact?.name || contact?.pushName || phone);
  document.querySelectorAll('#chats-list .conv-item').forEach(d =>
    d.classList.toggle('active', d.dataset.phone === phone));
  try {
    const { messages } = await apiFetch(`/crm/inbox/${encodeURIComponent(phone)}`);
    renderMsgList(messages, 'chat-messages');
    AS.inboxConversations = AS.inboxConversations.map(c => c.phoneNumber === phone ? { ...c, unread: 0 } : c);
    updateChatsBadge();
    document.querySelectorAll('#chats-list .conv-item').forEach(d => {
      if (d.dataset.phone === phone) d.querySelector('.unread-dot')?.remove();
    });
  } catch {
    showToast('Failed to load messages', 'error');
  }
};

function openSearchThread(thread) {
  const AS = window.AdminState;
  AS.currentInboxPhone = thread.phoneNumber;
  const name = thread.contact?.name || thread.contact?.pushName || thread.phoneNumber;
  setChatHeader(thread.phoneNumber, name);
  document.querySelectorAll('#chats-list .conv-item').forEach(d =>
    d.classList.toggle('active', d.dataset.phone === thread.phoneNumber));
  renderMsgList(thread.messages, 'chat-messages');
}

function setChatHeader(phone, displayName) {
  const color    = avatarColor(displayName);
  const initials = avatarInitials(displayName);
  const avatar   = document.getElementById('chat-header-avatar');
  if (avatar) { avatar.textContent = initials; avatar.style.background = color; }
  document.getElementById('chat-phone-label').textContent = displayName;
  document.getElementById('chat-contact-name').textContent = displayName !== phone ? phone : '';
  document.getElementById('chat-header').classList.remove('hidden');
  document.getElementById('chat-reply-box').classList.remove('hidden');
  const empty = document.getElementById('chat-empty');
  if (empty) empty.style.display = 'none';
}

window.sendReply = async function () {
  const AS = window.AdminState;
  const input = document.getElementById('reply-input');
  const message = input?.value.trim();
  if (!message || !AS.currentInboxPhone) return;
  input.value = '';
  input.style.height = 'auto';
  try {
    const msg = await apiFetch(`/crm/inbox/${encodeURIComponent(AS.currentInboxPhone)}/reply`, 'POST', { message });
    appendBubble(msg, 'chat-messages');
    const conv = AS.inboxConversations.find(c => c.phoneNumber === AS.currentInboxPhone);
    if (conv) { conv.lastMessage = msg.body; conv.lastTimestamp = msg.timestamp; }
    if (!AS.chatsSearchMode) renderChatList(AS.inboxConversations, false);
  } catch {
    showToast('Failed to send reply', 'error');
  }
};

function startInboxStream() {
  const AS = window.AdminState;
  if (AS.inboxEventSource) return;
  const token = localStorage.getItem('token');
  AS.inboxEventSource = new EventSource(`/crm/inbox/stream?token=${encodeURIComponent(token)}`);
  AS.inboxEventSource.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      const existing = AS.inboxConversations.find(c => c.phoneNumber === msg.phoneNumber);
      if (existing) {
        existing.lastMessage = msg.body;
        existing.lastTimestamp = msg.timestamp;
        if (msg.direction === 'in' && msg.phoneNumber !== AS.currentInboxPhone)
          existing.unread = (existing.unread || 0) + 1;
      } else if (msg.direction === 'in') {
        AS.inboxConversations.unshift({ phoneNumber: msg.phoneNumber, lastMessage: msg.body, lastTimestamp: msg.timestamp, unread: 1, contact: null });
      }
      if (!AS.chatsSearchMode) renderChatList(AS.inboxConversations, false);
      updateChatsBadge();
      if (msg.phoneNumber === AS.currentInboxPhone) appendBubble(msg, 'chat-messages');
    } catch (_) {}
  };
}

function stopInboxStream() {
  const AS = window.AdminState;
  if (AS.inboxEventSource) { AS.inboxEventSource.close(); AS.inboxEventSource = null; }
}

function updateChatsBadge() {
  const AS = window.AdminState;
  const total = AS.inboxConversations.reduce((s, c) => s + (c.unread || 0), 0);
  const badge = document.getElementById('chats-badge');
  if (!badge) return;
  if (total > 0) { badge.textContent = total; badge.classList.remove('hidden'); }
  else badge.classList.add('hidden');
}
