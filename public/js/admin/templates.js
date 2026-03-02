// Templates

const catStyle = {
  general:    'bg-gray-100 text-gray-600',
  promo:      'bg-amber-100 text-amber-700',
  support:    'bg-blue-100 text-blue-700',
  onboarding: 'bg-green-100 text-green-700',
};

async function loadTemplates() {
  const AS = window.AdminState;
  try {
    AS.templates = await apiFetch('/crm/templates');
    renderTemplates(AS.templates);
  } catch {
    showToast('Failed to load templates', 'error');
  }
}

window.filterTemplatesByCategory = function () {
  const AS = window.AdminState;
  const cat = document.getElementById('template-category-filter')?.value || '';
  const q   = (document.getElementById('template-search')?.value || '').toLowerCase();
  const filtered = AS.templates.filter(t =>
    (!cat || t.category === cat) &&
    (!q || t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q))
  );
  renderTemplates(filtered);
};

function renderTemplates(list) {
  const container = document.getElementById('templates-grid');
  container.innerHTML = '';
  if (!list.length) {
    container.innerHTML = `
      <div class="col-span-full py-16 text-center">
        <div class="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <i class="fas fa-layer-group text-gray-400 text-xl"></i>
        </div>
        <div class="text-sm font-medium text-gray-500 mb-1">No templates found</div>
        <button onclick="openNewTemplateModal()" class="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-semibold mt-2">New Template</button>
      </div>`;
    return;
  }
  const pinnedFirst = [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  pinnedFirst.forEach(t => {
    const cls = catStyle[t.category] || catStyle.general;
    const approvalColors = { draft: 'bg-gray-100 text-gray-500', pending: 'bg-yellow-100 text-yellow-700', approved: 'bg-green-100 text-green-700' };
    const approvalCls = approvalColors[t.approvalStatus] || approvalColors.draft;
    const div = document.createElement('div');
    div.className = `tmpl-card bg-white border rounded-2xl overflow-hidden ${t.pinned ? 'border-indigo-300' : 'border-gray-200'}`;
    div.dataset.templateId = t._id;
    div.innerHTML = `
      <div class="p-4 border-b border-gray-100 flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5 min-w-0">
          ${t.pinned ? '<i class="fas fa-thumbtack text-indigo-500 text-xs shrink-0"></i>' : ''}
          <h3 class="font-semibold text-gray-900 truncate">${escHtml(t.name)}</h3>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${cls}">${t.category || 'general'}</span>
          <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${approvalCls}">${t.approvalStatus || 'draft'}</span>
        </div>
      </div>
      <div class="p-4">
        <p class="text-sm text-gray-600 leading-relaxed whitespace-pre-line line-clamp-4 mb-3">${escHtml(t.content)}</p>
        <div class="flex items-center gap-1 text-xs text-gray-400 mb-3">
          <i class="fas fa-chart-bar text-xs"></i><span>${t.usageCount || 0} uses</span>
          <span class="mx-1">·</span>
          <i class="fas fa-history text-xs"></i><span>v${t.revision || 0}</span>
        </div>
        <div class="flex items-center gap-1.5 border-t border-gray-100 pt-3">
          <button onclick="useTemplate('${t._id}')"
            class="flex-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-1.5 rounded-lg font-semibold text-center">
            <i class="fas fa-bullhorn mr-1"></i> Use
          </button>
          <button onclick="openEditTemplateModal('${t._id}', ${JSON.stringify(t.name)}, ${JSON.stringify(t.content)}, '${escHtml(t.category || 'general')}')"
            title="Edit" class="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
            <i class="fas fa-pen text-xs"></i>
          </button>
          <button onclick="openTemplatePreviewModal('${t._id}')"
            title="Live preview" class="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg">
            <i class="fas fa-eye text-xs"></i>
          </button>
          <button onclick="pinTemplate('${t._id}')"
            title="${t.pinned ? 'Unpin' : 'Pin'}" class="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg">
            <i class="fas fa-thumbtack text-xs"></i>
          </button>
          <button onclick="duplicateTemplate('${t._id}')"
            title="Duplicate" class="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg">
            <i class="fas fa-copy text-xs"></i>
          </button>
          <button onclick="viewRevisions('${t._id}', ${JSON.stringify(t.name)})"
            title="Revisions" class="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg">
            <i class="fas fa-history text-xs"></i>
          </button>
          <button onclick="deleteTemplate('${t._id}')"
            title="Delete" class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
            <i class="fas fa-trash text-xs"></i>
          </button>
        </div>
      </div>
    `;
    container.appendChild(div);
  });
}

function populateTemplateSelector() {
  const AS = window.AdminState;
  const sel = document.getElementById('template-selector');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select a template —</option>';
  AS.templates.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t._id;
    opt.textContent = t.name;
    opt.dataset.content = t.content;
    sel.appendChild(opt);
  });
}

window.openNewTemplateModal = function () {
  const AS = window.AdminState;
  AS.currentTemplateId = null;
  document.getElementById('template-modal-title').textContent = 'New Template';
  document.getElementById('template-name').value     = '';
  document.getElementById('template-content').value  = '';
  document.getElementById('template-category').value = 'general';
  document.getElementById('tmpl-preview').textContent    = 'Your template preview…';
  document.getElementById('tmpl-char-count').textContent = '0 chars';
  document.getElementById('template-modal').classList.remove('hidden');
};

window.openEditTemplateModal = function (id, name, content, category = 'general') {
  const AS = window.AdminState;
  AS.currentTemplateId = id;
  document.getElementById('template-modal-title').textContent = 'Edit Template';
  document.getElementById('template-name').value     = name;
  document.getElementById('template-content').value  = content;
  document.getElementById('template-category').value = category;
  document.getElementById('tmpl-preview').textContent    = content || 'Your template preview…';
  document.getElementById('tmpl-char-count').textContent = content.length + ' chars';
  document.getElementById('template-modal').classList.remove('hidden');
};

window.closeTemplateModal = function () {
  const AS = window.AdminState;
  document.getElementById('template-modal').classList.add('hidden');
  AS.currentTemplateId = null;
};

window.saveTemplate = async function () {
  const AS = window.AdminState;
  const name     = document.getElementById('template-name').value.trim();
  const content  = document.getElementById('template-content').value.trim();
  const category = document.getElementById('template-category').value || 'general';
  if (!name || !content) { showToast('Name and content are required', 'warning'); return; }
  try {
    const url    = AS.currentTemplateId ? `/crm/templates/${AS.currentTemplateId}` : '/crm/templates';
    const method = AS.currentTemplateId ? 'PUT' : 'POST';
    await apiFetch(url, method, { name, content, category });
    showToast('Template saved', 'success');
    closeTemplateModal();
    loadTemplates();
  } catch {
    showToast('Failed to save template', 'error');
  }
};

window.deleteTemplate = async function (id) {
  const AS = window.AdminState;
  const t = AS.templates.find(x => x._id === id);
  if (!confirm(`Delete template "${t?.name}"?`)) return;
  try {
    await apiFetch(`/crm/templates/${id}`, 'DELETE');
    showToast('Template deleted', 'success');
    loadTemplates();
  } catch {
    showToast('Failed to delete template', 'error');
  }
};

window.useTemplate = function (id) {
  const AS = window.AdminState;
  const t = AS.templates.find(x => x._id === id);
  if (!t) return;
  openCampaignModal({ name: '', message: t.content, contacts: [] });
  document.getElementById('campaigns-tab').click();
};

// Template Extras

window.pinTemplate = async function (id) {
  try { await apiFetch(`/crm/templates/${id}/pin`, 'PATCH'); loadTemplates(); }
  catch { showToast('Failed to toggle pin', 'error'); }
};

window.duplicateTemplate = async function (id) {
  try { await apiFetch(`/crm/templates/${id}/duplicate`, 'POST'); showToast('Template duplicated', 'success'); loadTemplates(); }
  catch { showToast('Failed to duplicate template', 'error'); }
};

window.changeApproval = async function (id, status) {
  try { await apiFetch(`/crm/templates/${id}/approval`, 'PATCH', { approvalStatus: status }); loadTemplates(); }
  catch { showToast('Failed to update approval', 'error'); }
};

window.viewRevisions = async function (id, name) {
  const AS = window.AdminState;
  try {
    const revisions = await apiFetch(`/crm/templates/${id}/revisions`);
    document.getElementById('revision-template-name').textContent = name || id;
    AS.currentTemplateId = id;
    const tbody = document.getElementById('revision-list-body');
    tbody.innerHTML = '';
    if (!revisions.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="px-5 py-8 text-center text-sm text-gray-400">No revisions yet</td></tr>`;
    } else {
      revisions.forEach(r => {
        const tr = document.createElement('tr');
        tr.className = 'trow';
        tr.innerHTML = `
          <td class="px-5 py-2.5 text-sm font-bold text-gray-600">v${r.revision}</td>
          <td class="px-5 py-2.5 text-sm text-gray-700">${escHtml(r.savedBy || '—')}</td>
          <td class="px-5 py-2.5 text-xs text-gray-500">${fmtDate(r.savedAt)}</td>
          <td class="px-5 py-2.5 text-xs text-gray-500 font-mono truncate" style="max-width:160px;">${escHtml((r.content || '').substring(0, 60))}…</td>
          <td class="px-5 py-2.5">
            <button onclick="restoreRevision('${id}', ${r.revision})"
              class="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">Restore</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
    document.getElementById('revision-modal').classList.remove('hidden');
  } catch {
    showToast('Failed to load revisions', 'error');
  }
};

window.restoreRevision = async function (templateId, rev) {
  if (!confirm(`Restore to revision v${rev}? Current version will be saved as a new revision.`)) return;
  try {
    await apiFetch(`/crm/templates/${templateId}/revisions/${rev}/restore`, 'POST');
    showToast('Template restored', 'success');
    document.getElementById('revision-modal').classList.add('hidden');
    loadTemplates();
  } catch {
    showToast('Failed to restore revision', 'error');
  }
};

window.openTemplatePreviewModal = function (id) {
  const AS = window.AdminState;
  const t = AS.templates.find(x => x._id === id);
  if (!t) return;
  AS.currentTemplateId = id;
  document.getElementById('preview-sample-name').value  = '';
  document.getElementById('preview-sample-phone').value = '';
  document.getElementById('preview-sample-date').value  = new Date().toLocaleDateString();
  updateTemplatePreview();
  document.getElementById('template-preview-modal').classList.remove('hidden');
};

window.updateTemplatePreview = function () {
  const AS = window.AdminState;
  const t = AS.templates.find(x => x._id === AS.currentTemplateId);
  if (!t) return;
  const vars = {
    name:  document.getElementById('preview-sample-name')?.value  || 'Friend',
    phone: document.getElementById('preview-sample-phone')?.value || '0000000000',
    date:  document.getElementById('preview-sample-date')?.value  || new Date().toLocaleDateString(),
  };
  const preview = resolveVariablesLocal(t.content, vars);
  const el = document.getElementById('template-preview-output');
  if (el) el.textContent = preview;
};

function resolveVariablesLocal(template, vars) {
  return template.replace(/\{\{(\w+)(?:\|([^}]*))?\}\}|\{(\w+)\}/g, (_, k1, fallback, k2) => {
    const key = k1 || k2;
    return vars[key] || fallback || '';
  });
}
