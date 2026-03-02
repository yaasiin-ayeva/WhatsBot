// ── Integrations ────────────────────────────────────────────────────────────

async function loadIntegrations() {
  const AS = window.AdminState;
  try {
    [AS.integrations, AS.availableEvents] = await Promise.all([
      apiFetch('/crm/integrations'),
      apiFetch('/crm/integrations/events'),
    ]);
    renderIntegrationsTab();
    loadInboundApiKey();
  } catch {
    showToast('Failed to load integrations', 'error');
  }
}

window.switchIntegrationTab = function (tab) {
  const AS = window.AdminState;
  AS.currentIntegrationTab = tab;
  ['webhooks', 'notifications', 'email', 'autoreply', 'inbound'].forEach(t => {
    document.getElementById(`ipanel-${t}`)?.classList.toggle('hidden', t !== tab);
    document.getElementById(`itab-${t}`)?.classList.toggle('active', t === tab);
  });
  if (tab === 'autoreply') loadAutoReplies();
  else if (tab === 'email') { loadSmtpSettings(); renderIntegrationsTab(); }
  else if (tab === 'inbound') loadInboundApiKey();
  else renderIntegrationsTab();
};

function renderIntegrationsTab() {
  const AS = window.AdminState;
  const webhookRows = AS.integrations.filter(i => i.type === 'webhook');
  const notifRows   = AS.integrations.filter(i => i.type === 'slack' || i.type === 'discord');
  const emailRows   = AS.integrations.filter(i => i.type === 'email');
  renderIntegrationTable('webhooks-table-body', webhookRows, 5);
  renderIntegrationTable('notifications-table-body', notifRows, 5);
  renderEmailIntegrationTable(emailRows);
}

function renderIntegrationTable(tbodyId, rows, colspan) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center py-8 text-gray-400 text-sm">No integrations configured</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(i => {
    const statusBadge = i.lastStatus === 'ok'
      ? `<span class="badge badge-sent">OK</span>`
      : i.lastStatus === 'error'
      ? `<span class="badge badge-failed" title="${i.lastError || ''}">Error</span>`
      : `<span class="badge badge-draft">—</span>`;
    const typeBadge = i.type === 'slack'
      ? `<span class="badge" style="background:#e8f5e9;color:#2e7d32;">Slack</span>`
      : i.type === 'discord'
      ? `<span class="badge" style="background:#ede7f6;color:#4527a0;">Discord</span>`
      : `<span class="badge badge-scheduled">Webhook</span>`;
    const events = (i.events || []).map(e => `<span class="tag-chip">${e}</span>`).join(' ') || '—';
    const enabledBadge = i.enabled
      ? `<span class="badge badge-sent">ON</span>`
      : `<span class="badge badge-draft">OFF</span>`;
    return `<tr class="trow border-b border-gray-50">
      <td class="px-5 py-3 text-sm font-medium text-gray-900">${i.name}</td>
      ${colspan === 5 && i.type !== 'webhook' ? `<td class="px-5 py-3">${typeBadge}</td>` : ''}
      <td class="px-5 py-3 text-xs text-gray-500 max-w-xs truncate" title="${i.url}">${i.url}</td>
      <td class="px-5 py-3 text-xs">${events}</td>
      <td class="px-5 py-3">${statusBadge} ${enabledBadge}</td>
      <td class="px-5 py-3 flex items-center gap-2">
        <button onclick="openIntegrationModal('${i._id}')" class="text-xs text-indigo-600 hover:underline">Edit</button>
        <button onclick="testIntegration('${i._id}')" class="text-xs text-gray-500 hover:text-gray-800" title="Test fire"><i class="fas fa-paper-plane"></i> Test</button>
        <button onclick="deleteIntegration('${i._id}')" class="text-xs text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

window.openIntegrationModal = async function (id, forceType) {
  const AS = window.AdminState;
  AS.currentIntegrationId = id;
  const existing = id ? AS.integrations.find(i => i._id === id) : null;
  const type = forceType || existing?.type || 'webhook';
  document.getElementById('integration-modal-title').textContent = id ? 'Edit Integration' : `Add ${type.charAt(0).toUpperCase() + type.slice(1)}`;

  document.getElementById('int-name').value    = existing?.name   || '';
  document.getElementById('int-url').value     = existing?.url    || '';
  document.getElementById('int-secret').value  = existing?.secret || '';
  document.getElementById('int-secret-wrap').classList.toggle('hidden', type !== 'webhook');

  const urlLabel = document.getElementById('int-url-label');
  const urlHint  = document.getElementById('int-url-hint');
  const urlInput = document.getElementById('int-url');
  if (type === 'email') {
    urlLabel.textContent = 'Recipients';
    urlInput.placeholder = 'alice@example.com, bob@example.com';
    urlHint.classList.remove('hidden');
  } else {
    urlLabel.textContent = 'URL';
    urlInput.placeholder = 'https://hooks.example.com/…';
    urlHint.classList.add('hidden');
  }

  const enabledToggle = document.getElementById('int-enabled-toggle');
  enabledToggle.classList.toggle('on', existing?.enabled !== false);
  enabledToggle.dataset.type = type;

  const list = document.getElementById('int-events-list');
  list.innerHTML = AS.availableEvents.map(ev => `
    <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
      <input type="checkbox" value="${ev}" class="accent-indigo-600" ${(existing?.events || []).includes(ev) ? 'checked' : ''}>
      <span class="font-mono text-xs">${ev}</span>
    </label>`).join('');

  document.getElementById('integration-modal').classList.remove('hidden');
};

window.saveIntegration = async function () {
  const AS = window.AdminState;
  const name    = document.getElementById('int-name').value.trim();
  const url     = document.getElementById('int-url').value.trim();
  const secret  = document.getElementById('int-secret').value.trim();
  const enabled = document.getElementById('int-enabled-toggle').classList.contains('on');
  const type    = document.getElementById('int-enabled-toggle').dataset.type || 'webhook';
  const events  = [...document.querySelectorAll('#int-events-list input:checked')].map(c => c.value);

  if (!name || !url) return showToast('Name and URL are required', 'error');
  try {
    if (AS.currentIntegrationId) {
      await apiFetch(`/crm/integrations/${AS.currentIntegrationId}`, 'PUT', { name, type, url, events, secret, enabled });
    } else {
      await apiFetch('/crm/integrations', 'POST', { name, type, url, events, secret, enabled });
    }
    closeIntegrationModal();
    await loadIntegrations();
    showToast('Integration saved');
  } catch {
    showToast('Failed to save integration', 'error');
  }
};

window.deleteIntegration = async function (id) {
  if (!confirm('Delete this integration?')) return;
  try {
    await apiFetch(`/crm/integrations/${id}`, 'DELETE');
    await loadIntegrations();
    showToast('Integration deleted');
  } catch {
    showToast('Failed to delete', 'error');
  }
};

window.testIntegration = async function (id) {
  try {
    await apiFetch(`/crm/integrations/${id}/test`, 'POST');
    showToast('Test event fired — check your endpoint');
  } catch {
    showToast('Test failed', 'error');
  }
};

window.closeIntegrationModal = function () {
  const AS = window.AdminState;
  document.getElementById('integration-modal').classList.add('hidden');
  AS.currentIntegrationId = null;
};

// ── Auto-Reply ──────────────────────────────────────────────────────────────

async function loadAutoReplies() {
  const AS = window.AdminState;
  try {
    AS.autoReplies = await apiFetch('/crm/auto-reply');
    renderAutoReplies();
  } catch {
    showToast('Failed to load auto-reply rules', 'error');
  }
}

function renderAutoReplies() {
  const AS = window.AdminState;
  const tbody = document.getElementById('autoreply-table-body');
  if (!tbody) return;
  if (!AS.autoReplies.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-gray-400 text-sm">No rules configured</td></tr>`;
    return;
  }
  tbody.innerHTML = AS.autoReplies.map(r => {
    const responseText = r.useAI
      ? `<span class="badge badge-scheduled">AI (${r.aiProvider})</span>`
      : `<span class="text-xs text-gray-600 truncate max-w-xs block" title="${r.response}">${r.response.substring(0, 50)}${r.response.length > 50 ? '…' : ''}</span>`;
    const enabled = r.enabled
      ? `<span class="badge badge-sent">ON</span>`
      : `<span class="badge badge-draft">OFF</span>`;
    return `<tr class="trow border-b border-gray-50">
      <td class="px-5 py-3 text-sm font-medium text-gray-900">${r.name}</td>
      <td class="px-5 py-3 font-mono text-xs text-gray-700">${r.trigger}</td>
      <td class="px-5 py-3 text-xs text-gray-500">${r.matchType}</td>
      <td class="px-5 py-3 text-xs">${responseText}</td>
      <td class="px-5 py-3 text-xs text-gray-500">${r.cooldownMinutes}m</td>
      <td class="px-5 py-3">${enabled}</td>
      <td class="px-5 py-3 flex items-center gap-2">
        <button onclick="openAutoReplyModal('${r._id}')" class="text-xs text-indigo-600 hover:underline">Edit</button>
        <button onclick="deleteAutoReply('${r._id}')" class="text-xs text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

window.openAutoReplyModal = function (id) {
  const AS = window.AdminState;
  AS.currentAutoReplyId = id;
  const existing = id ? AS.autoReplies.find(r => r._id === id) : null;
  document.getElementById('autoreply-modal-title').textContent = id ? 'Edit Auto-Reply Rule' : 'Add Auto-Reply Rule';

  document.getElementById('ar-name').value       = existing?.name      || '';
  document.getElementById('ar-trigger').value    = existing?.trigger   || '';
  document.getElementById('ar-matchtype').value  = existing?.matchType || 'contains';
  document.getElementById('ar-priority').value   = existing?.priority  ?? 0;
  document.getElementById('ar-response').value   = existing?.response  || '';
  document.getElementById('ar-cooldown').value   = existing?.cooldownMinutes ?? 60;
  document.getElementById('ar-aiprovider').value = existing?.aiProvider || 'gemini';
  document.getElementById('ar-aiprompt').value   = existing?.aiPrompt  || '';
  document.getElementById('ar-useai').checked    = existing?.useAI || false;

  const enabledToggle = document.getElementById('ar-enabled-toggle');
  enabledToggle.classList.toggle('on', existing?.enabled !== false);

  const useAI = existing?.useAI || false;
  document.getElementById('ar-static-wrap').classList.toggle('hidden', useAI);
  document.getElementById('ar-ai-wrap').classList.toggle('hidden', !useAI);

  document.getElementById('autoreply-modal').classList.remove('hidden');
};

window.saveAutoReply = async function () {
  const AS = window.AdminState;
  const name            = document.getElementById('ar-name').value.trim();
  const trigger         = document.getElementById('ar-trigger').value.trim();
  const matchType       = document.getElementById('ar-matchtype').value;
  const priority        = parseInt(document.getElementById('ar-priority').value) || 0;
  const response        = document.getElementById('ar-response').value.trim();
  const cooldownMinutes = parseInt(document.getElementById('ar-cooldown').value) || 60;
  const useAI           = document.getElementById('ar-useai').checked;
  const aiProvider      = document.getElementById('ar-aiprovider').value;
  const aiPrompt        = document.getElementById('ar-aiprompt').value.trim();
  const enabled         = document.getElementById('ar-enabled-toggle').classList.contains('on');

  if (!name || !trigger) return showToast('Name and trigger are required', 'error');
  if (!useAI && !response) return showToast('Provide a static response or enable AI', 'error');

  const payload = { name, matchType, trigger, response, useAI, aiProvider, aiPrompt, cooldownMinutes, priority, enabled };
  try {
    if (AS.currentAutoReplyId) {
      await apiFetch(`/crm/auto-reply/${AS.currentAutoReplyId}`, 'PUT', payload);
    } else {
      await apiFetch('/crm/auto-reply', 'POST', payload);
    }
    closeAutoReplyModal();
    await loadAutoReplies();
    showToast('Auto-reply rule saved');
  } catch {
    showToast('Failed to save rule', 'error');
  }
};

window.deleteAutoReply = async function (id) {
  if (!confirm('Delete this auto-reply rule?')) return;
  try {
    await apiFetch(`/crm/auto-reply/${id}`, 'DELETE');
    await loadAutoReplies();
    showToast('Rule deleted');
  } catch {
    showToast('Failed to delete', 'error');
  }
};

window.closeAutoReplyModal = function () {
  const AS = window.AdminState;
  document.getElementById('autoreply-modal').classList.add('hidden');
  AS.currentAutoReplyId = null;
};

// ── Email table ─────────────────────────────────────────────────────────────

function renderEmailIntegrationTable(rows) {
  const tbody = document.getElementById('email-table-body');
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-10 text-gray-400 text-sm"><i class="fas fa-envelope text-3xl mb-3 block opacity-30"></i>No email integrations configured</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(i => {
    const events = (i.events || []).map(e => `<span class="tag-chip">${e}</span>`).join(' ') || '—';
    const statusBadge = i.lastStatus === 'ok'
      ? `<span class="badge badge-sent">OK</span>`
      : i.lastStatus === 'error'
      ? `<span class="badge badge-failed" title="${i.lastError || ''}">Error</span>`
      : `<span class="badge badge-draft">—</span>`;
    return `<tr class="trow border-b border-gray-50">
      <td class="px-4 py-3 text-sm font-medium text-gray-900">${i.name} ${statusBadge}</td>
      <td class="px-4 py-3 text-xs text-gray-500 max-w-xs truncate" title="${i.url}">${i.url}</td>
      <td class="px-4 py-3 text-xs">${events}</td>
      <td class="px-4 py-3 flex items-center gap-2">
        <button onclick="openIntegrationModal('${i._id}')" class="text-xs text-indigo-600 hover:underline">Edit</button>
        <button onclick="testIntegration('${i._id}')" class="text-xs text-gray-500 hover:text-gray-800" title="Test"><i class="fas fa-paper-plane"></i></button>
        <button onclick="deleteIntegration('${i._id}')" class="text-xs text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

// ── SMTP Settings ───────────────────────────────────────────────────────────

async function loadSmtpSettings() {
  try {
    const smtp = await apiFetch('/crm/integrations/smtp');
    document.getElementById('smtp-host').value       = smtp.host      || '';
    document.getElementById('smtp-port').value       = smtp.port      || 587;
    document.getElementById('smtp-user').value       = smtp.user      || '';
    document.getElementById('smtp-pass').value       = smtp.pass      || '';
    document.getElementById('smtp-from-name').value  = smtp.fromName  || '';
    document.getElementById('smtp-from-email').value = smtp.fromEmail || '';
    document.getElementById('smtp-secure').checked   = smtp.secure    || false;
  } catch { /* silent */ }
}

window.saveSmtp = async function () {
  const payload = {
    host:      document.getElementById('smtp-host').value.trim(),
    port:      parseInt(document.getElementById('smtp-port').value) || 587,
    secure:    document.getElementById('smtp-secure').checked,
    user:      document.getElementById('smtp-user').value.trim(),
    pass:      document.getElementById('smtp-pass').value,
    fromName:  document.getElementById('smtp-from-name').value.trim(),
    fromEmail: document.getElementById('smtp-from-email').value.trim(),
  };
  try {
    await apiFetch('/crm/integrations/smtp', 'PUT', payload);
    showToast('SMTP settings saved');
  } catch {
    showToast('Failed to save SMTP settings', 'error');
  }
};

window.testSmtp = async function () {
  try {
    const res = await apiFetch('/crm/integrations/smtp/test', 'POST');
    showToast(res.message || 'Connection successful', 'success');
  } catch {
    showToast('SMTP test failed — check your credentials', 'error');
  }
};

// ── Inbound API ─────────────────────────────────────────────────────────────

async function loadInboundApiKey() {
  try {
    const data = await apiFetch('/crm/inbound/api-key');
    document.getElementById('inbound-api-key-input').value = data.inboundApiKey || '';
  } catch { /* silent */ }
}

window.rotateInboundKey = async function () {
  if (!confirm('Rotate the inbound API key? The old key will stop working immediately.')) return;
  try {
    const data = await apiFetch('/crm/inbound/api-key/rotate', 'POST');
    document.getElementById('inbound-api-key-input').value = data.inboundApiKey;
    showToast('API key rotated — copy and store it safely');
  } catch {
    showToast('Failed to rotate key', 'error');
  }
};

window.copyInboundKey = function () {
  const val = document.getElementById('inbound-api-key-input').value;
  if (!val) return showToast('No key to copy', 'error');
  navigator.clipboard.writeText(val).then(() => showToast('Key copied to clipboard'));
};
