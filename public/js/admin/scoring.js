// ── Contact Scoring ─────────────────────────────────────────────────────────

async function loadScoring() {
  const AS = window.AdminState;
  try {
    const [rules, leaderboard] = await Promise.all([
      apiFetch('/crm/scoring/rules'),
      apiFetch('/crm/contacts/leaderboard?limit=10'),
    ]);
    AS.scoreRules = rules;
    renderScoreRules(rules);
    renderLeaderboard(leaderboard);
  } catch {
    showToast('Failed to load scoring data', 'error');
  }
}

function renderScoreRules(rules) {
  const tbody = document.getElementById('score-rules-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!rules.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-sm text-gray-400">No rules yet. Click "Add Rule" to create one.</td></tr>`;
    return;
  }
  rules.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = 'trow';
    tr.innerHTML = `
      <td class="px-4 py-2.5 text-xs font-mono text-gray-700">${escHtml(r.action)}</td>
      <td class="px-4 py-2.5 text-sm text-gray-700">${escHtml(r.label)}</td>
      <td class="px-4 py-2.5">
        <input type="number" value="${r.points}" min="-100" max="1000"
          class="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center"
          onchange="saveScoreRule('${r._id}', this.value, null)">
      </td>
      <td class="px-4 py-2.5">
        <input type="checkbox" ${r.enabled ? 'checked' : ''}
          onchange="saveScoreRule('${r._id}', null, this.checked)" class="rounded">
      </td>
      <td class="px-4 py-2.5">
        <button onclick="deleteScoreRule('${r._id}')"
          class="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg text-xs">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.saveScoreRule = async function (id, points, enabled) {
  try {
    const update = {};
    if (points !== null) update.points = Number(points);
    if (enabled !== null) update.enabled = enabled;
    await apiFetch(`/crm/scoring/rules/${id}`, 'PUT', update);
    showToast('Rule saved', 'success');
  } catch {
    showToast('Failed to save rule', 'error');
  }
};

window.addScoreRule = async function () {
  const AS = window.AdminState;
  const actions = ['first_interaction', 'message_received', 'command_used', 'campaign_reply'];
  const usedActions = AS.scoreRules.map(r => r.action);
  const available = actions.filter(a => !usedActions.includes(a));
  if (!available.length) { showToast('All actions already have rules', 'info'); return; }
  const action = available[0];
  try {
    await apiFetch('/crm/scoring/rules', 'POST', { action, label: action.replace(/_/g, ' '), points: 1, enabled: true });
    showToast('Rule created', 'success');
    loadScoring();
  } catch {
    showToast('Failed to create rule', 'error');
  }
};

window.deleteScoreRule = async function (id) {
  if (!confirm('Delete this scoring rule?')) return;
  try {
    await apiFetch(`/crm/scoring/rules/${id}`, 'DELETE');
    showToast('Rule deleted', 'success');
    loadScoring();
  } catch {
    showToast('Failed to delete rule', 'error');
  }
};

function renderLeaderboard(contacts) {
  const tbody = document.getElementById('leaderboard-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!contacts.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-sm text-gray-400">No contacts scored yet</td></tr>`;
    return;
  }
  contacts.forEach((c, i) => {
    const tr = document.createElement('tr');
    tr.className = 'trow';
    tr.innerHTML = `
      <td class="px-4 py-2.5 text-sm font-bold text-gray-500">${i + 1}</td>
      <td class="px-4 py-2.5 text-sm text-gray-800">${escHtml(c.name || c.pushName || '—')}</td>
      <td class="px-4 py-2.5 text-xs font-mono text-gray-600">${c.phoneNumber}</td>
      <td class="px-4 py-2.5 text-sm font-bold text-indigo-600">${c.score || 0}</td>
    `;
    tbody.appendChild(tr);
  });
}
