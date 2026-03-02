// ── Commands ────────────────────────────────────────────────────────────────

async function loadCommands() {
  try {
    const [list, stats] = await Promise.all([
      apiFetch('/crm/commands'),
      apiFetch('/crm/commands/stats').catch(() => ({})),
    ]);
    renderCommands(list, stats);
  } catch {
    showToast('Failed to load commands', 'error');
  }
}

function renderCommands(list, stats) {
  const tbody = document.getElementById('commands-table-body');
  tbody.innerHTML = '';
  if (!list || !list.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-sm text-gray-400">No commands found</td></tr>`;
    return;
  }
  list.forEach(cmd => {
    const count = (stats && stats[cmd.name]) || 0;
    const tr = document.createElement('tr');
    tr.className = 'trow';
    tr.innerHTML = `
      <td class="px-6 py-3.5 text-sm font-mono font-semibold text-gray-800">!${escHtml(cmd.name)}</td>
      <td class="px-6 py-3.5 text-sm text-gray-600">${count}</td>
      <td class="px-6 py-3.5">
        <span class="text-xs font-bold px-2.5 py-1 rounded-full ${cmd.disabled ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}">
          ${cmd.disabled ? 'Disabled' : 'Enabled'}
        </span>
      </td>
      <td class="px-6 py-3.5">
        <button onclick="toggleCommand('${escHtml(cmd.name)}')"
          class="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${cmd.disabled ? 'border-green-200 text-green-700 hover:bg-green-50' : 'border-red-200 text-red-600 hover:bg-red-50'}">
          ${cmd.disabled ? 'Enable' : 'Disable'}
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.toggleCommand = async function (name) {
  try {
    await apiFetch(`/crm/commands/${encodeURIComponent(name)}`, 'PATCH');
    showToast('Command updated', 'success');
    loadCommands();
  } catch {
    showToast('Failed to update command', 'error');
  }
};

// ── Users ───────────────────────────────────────────────────────────────────

async function loadUsers() {
  const AS = window.AdminState;
  try {
    AS.users = await apiFetch('/crm/users');
    renderUsers(AS.users);
  } catch {
    showToast('Failed to load users', 'error');
  }
}

function renderUsers(list) {
  const AS = window.AdminState;
  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = '';
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-sm text-gray-400">No users found</td></tr>`;
    return;
  }
  list.forEach(u => {
    const isSelf = AS.currentUser && u._id === AS.currentUser._id;
    const tr = document.createElement('tr');
    tr.className = 'trow';
    tr.innerHTML = `
      <td class="px-6 py-3.5 text-sm font-semibold text-gray-800">${escHtml(u.username)}</td>
      <td class="px-6 py-3.5">
        <span class="text-xs font-bold px-2.5 py-1 rounded-full ${u.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}">
          ${u.role}
        </span>
      </td>
      <td class="px-6 py-3.5 text-sm text-gray-500">${fmtDate(u.createdAt)}</td>
      <td class="px-6 py-3.5">
        <div class="flex items-center gap-1">
          ${isSelf
            ? '<span class="text-xs text-gray-400 italic">You</span>'
            : `<button onclick="changeUserRole('${u._id}', '${u.role === 'admin' ? 'user' : 'admin'}')"
                 title="Change to ${u.role === 'admin' ? 'user' : 'admin'}"
                 class="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg text-xs">
                 <i class="fas fa-exchange-alt"></i>
               </button>
               <button onclick="deleteUser('${u._id}')" title="Delete"
                 class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg text-xs">
                 <i class="fas fa-trash"></i>
               </button>`
          }
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.openUserModal = function (user = null) {
  const AS = window.AdminState;
  AS.currentUserId = user?._id || null;
  document.getElementById('user-modal-title').textContent = user ? 'Edit User' : 'Add User';
  document.getElementById('user-modal-id').value   = user?._id    || '';
  document.getElementById('user-username').value   = user?.username || '';
  document.getElementById('user-password').value   = '';
  document.getElementById('user-role').value       = user?.role    || 'admin';
  document.getElementById('user-password-wrap').classList.toggle('hidden', !!user);
  document.getElementById('user-modal').classList.remove('hidden');
};

window.closeUserModal = function () {
  const AS = window.AdminState;
  document.getElementById('user-modal').classList.add('hidden');
  AS.currentUserId = null;
};

window.saveUser = async function () {
  const username = document.getElementById('user-username').value.trim();
  const password = document.getElementById('user-password').value;
  const role     = document.getElementById('user-role').value;
  const id       = document.getElementById('user-modal-id').value;

  if (!username) { showToast('Username is required', 'warning'); return; }
  if (!id && !password) { showToast('Password is required for new users', 'warning'); return; }

  try {
    if (id) {
      await apiFetch(`/crm/users/${id}`, 'PUT', { role });
      showToast('User updated', 'success');
    } else {
      await apiFetch('/crm/auth/register', 'POST', { username, password, role });
      showToast('User created', 'success');
    }
    closeUserModal();
    loadUsers();
  } catch {
    showToast('Failed to save user', 'error');
  }
};

window.changeUserRole = async function (id, newRole) {
  try {
    await apiFetch(`/crm/users/${id}`, 'PUT', { role: newRole });
    showToast('Role updated', 'success');
    loadUsers();
  } catch {
    showToast('Failed to update role', 'error');
  }
};

window.deleteUser = async function (id) {
  const AS = window.AdminState;
  const u = AS.users.find(x => x._id === id);
  if (!confirm(`Delete user "${u?.username}"? This cannot be undone.`)) return;
  try {
    await apiFetch(`/crm/users/${id}`, 'DELETE');
    showToast('User deleted', 'success');
    loadUsers();
  } catch {
    showToast('Failed to delete user', 'error');
  }
};

// ── Audit Logs ──────────────────────────────────────────────────────────────

window.loadAuditLogs = async function (page = 1) {
  const AS = window.AdminState;
  AS.auditPage = page;
  const action   = encodeURIComponent(document.getElementById('audit-action-filter')?.value   || '');
  const resource = encodeURIComponent(document.getElementById('audit-resource-filter')?.value || '');
  try {
    const res = await apiFetch(`/crm/audit-logs?page=${page}&limit=20&action=${action}&resource=${resource}`);
    renderAuditLogs(res.data || [], res.meta || {});
  } catch {
    showToast('Failed to load audit logs', 'error');
  }
};

function renderAuditLogs(logs, meta) {
  const tbody = document.getElementById('audit-table-body');
  tbody.innerHTML = '';
  document.getElementById('audit-total').textContent = meta.total || logs.length;

  if (!logs.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="px-5 py-8 text-center text-sm text-gray-400">No audit entries found</td></tr>`;
  } else {
    logs.forEach(l => {
      const details = l.details ? JSON.stringify(l.details).substring(0, 80) : '—';
      const tr = document.createElement('tr');
      tr.className = 'trow';
      tr.innerHTML = `
        <td class="px-5 py-2.5 text-xs text-gray-500 whitespace-nowrap">${fmtDate(l.timestamp)}</td>
        <td class="px-5 py-2.5 text-sm text-gray-700 font-semibold">${escHtml(l.username || '—')}</td>
        <td class="px-5 py-2.5"><span class="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-mono">${escHtml(l.action)}</span></td>
        <td class="px-5 py-2.5 text-xs text-gray-500">${escHtml(l.resource)}${l.resourceId ? ` #${l.resourceId.substring(0, 8)}…` : ''}</td>
        <td class="px-5 py-2.5 text-xs text-gray-400 font-mono truncate" style="max-width:200px;" title="${escHtml(JSON.stringify(l.details || ''))}">${escHtml(details)}</td>
      `;
      tbody.appendChild(tr);
    });
  }
  renderPagination(meta, loadAuditLogs, 'audit-pagination');
}

// ── Settings ────────────────────────────────────────────────────────────────

async function loadSettings() {
  const AS = window.AdminState;
  try {
    const data = await apiFetch('/crm/settings');

    const botInfoGrid = document.getElementById('bot-info-grid');
    botInfoGrid.innerHTML = [
      ['Environment', data.env?.ENV],
      ['Port',        data.env?.PORT],
      ['Bot Name',    'WhatsBot'],
      ['Prefix',      data.env?.ENV === 'production' ? '/' : '!'],
    ].map(([k, v]) => `
      <div class="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
        <span class="text-sm text-gray-500">${k}</span>
        <span class="text-sm font-semibold text-gray-800">${v || '—'}</span>
      </div>
    `).join('');

    const keyLabels = {
      GEMINI_API_KEY:               'Gemini AI',
      OPENWEATHERMAP_API_KEY:       'OpenWeatherMap',
      SHERPA_ONNX_ASR_ENCODER_PATH: 'Sherpa ASR encoder',
      SHERPA_ONNX_ASR_DECODER_PATH: 'Sherpa ASR decoder',
      SHERPA_ONNX_TTS_MODEL_PATH:   'Sherpa TTS model',
      SHERPA_ONNX_TTS_TOKENS_PATH:  'Sherpa TTS tokens',
      SHERPA_ONNX_TTS_LEXICON_PATH: 'Sherpa TTS lexicon',
      CHAT_GPT_API_KEY:             'ChatGPT / OpenAI',
    };
    const statusGrid = document.getElementById('api-keys-status-grid');
    if (statusGrid) {
      statusGrid.innerHTML = Object.entries(keyLabels).map(([key, label]) => {
        const configured = data.env?.[key];
        return `
          <div class="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <span class="text-sm text-gray-700 font-medium">${label}</span>
            <span class="text-xs font-bold px-2.5 py-1 rounded-full ${configured ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}">
              ${configured ? '✓ Configured' : '✗ Missing'}
            </span>
          </div>
        `;
      }).join('');
    }

    document.getElementById('setting-maxFileSizeMb').value = data.maxFileSizeMb ?? 150;
    AS.autoDownloadEnabled = data.autoDownloadEnabled ?? true;
    const toggle = document.getElementById('toggle-autoDownload');
    if (AS.autoDownloadEnabled) toggle.classList.add('on'); else toggle.classList.remove('on');
  } catch {
    showToast('Failed to load settings', 'error');
  }
}

async function saveSettings() {
  const AS = window.AdminState;
  const maxFileSizeMb = parseInt(document.getElementById('setting-maxFileSizeMb').value, 10);
  const keyIds = ['GEMINI_API_KEY', 'CHAT_GPT_API_KEY', 'OPENWEATHERMAP_API_KEY', 'SHERPA_ONNX_ASR_ENCODER_PATH', 'SHERPA_ONNX_ASR_DECODER_PATH', 'SHERPA_ONNX_TTS_MODEL_PATH', 'SHERPA_ONNX_TTS_TOKENS_PATH', 'SHERPA_ONNX_TTS_LEXICON_PATH'];
  const apiKeys = {};
  keyIds.forEach(k => {
    const val = document.getElementById(`key-${k}`)?.value?.trim();
    if (val) apiKeys[k] = val;
  });
  try {
    await apiFetch('/crm/settings', 'PUT', { maxFileSizeMb, autoDownloadEnabled: AS.autoDownloadEnabled, apiKeys });
    showToast('Settings saved', 'success');
    keyIds.forEach(k => { const el = document.getElementById(`key-${k}`); if (el) el.value = ''; });
    loadSettings();
  } catch {
    showToast('Failed to save settings', 'error');
  }
}

window.toggleAutoDownload = function () {
  const AS = window.AdminState;
  AS.autoDownloadEnabled = !AS.autoDownloadEnabled;
  const t = document.getElementById('toggle-autoDownload');
  if (AS.autoDownloadEnabled) t.classList.add('on'); else t.classList.remove('on');
};

// ── Direct Message ──────────────────────────────────────────────────────────

window.openMessageModal = function (phone, name) {
  const AS = window.AdminState;
  AS.currentRecipient = phone;
  document.getElementById('msg-recipient-label').textContent = `To: ${name || phone}`;
  document.getElementById('message-content').value = '';
  document.getElementById('message-modal').classList.remove('hidden');
};

window.closeMessageModal = function () {
  const AS = window.AdminState;
  document.getElementById('message-modal').classList.add('hidden');
  AS.currentRecipient = null;
};

window.sendPrivateMessage = async function () {
  const AS = window.AdminState;
  const message = document.getElementById('message-content').value.trim();
  if (!message || !AS.currentRecipient) return;
  try {
    await apiFetch('/crm/send-message', 'POST', { phoneNumber: AS.currentRecipient, message });
    showToast('Message sent!', 'success');
    closeMessageModal();
  } catch {
    showToast('Failed to send message', 'error');
  }
};
