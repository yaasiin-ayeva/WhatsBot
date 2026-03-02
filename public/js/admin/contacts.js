// Contacts
async function loadContacts(page = 1) {
  const AS = window.AdminState;
  AS.contactsPage = page;
  try {
    let url = `/crm/contacts?page=${page}&limit=20&search=${encodeURIComponent(AS.contactsSearch)}`;
    if (AS.contactViewMode === 'blocked')  url += '&showBlocked=true';
    if (AS.contactViewMode === 'archived') url += '&showArchived=true';
    const { data, meta } = await apiFetch(url);
    renderContacts(data);
    renderPagination(meta, loadContacts, 'contacts-pagination');
    document.getElementById('contacts-start').textContent = meta.total ? (meta.page - 1) * meta.limit + 1 : 0;
    document.getElementById('contacts-end').textContent   = Math.min(meta.page * meta.limit, meta.total);
    document.getElementById('contacts-total').textContent = meta.total;
  } catch {
    showToast('Failed to load contacts', 'error');
  }
}

window.filterContactView = function (mode) {
  const AS = window.AdminState;
  AS.contactViewMode = mode;
  document.querySelectorAll('.contact-filter-btn').forEach(btn => {
    btn.classList.remove('bg-indigo-600', 'text-white');
    btn.classList.add('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');
  });
  document.querySelectorAll('.contact-filter-btn').forEach(btn => {
    const onclick = btn.getAttribute('onclick') || '';
    if (onclick.includes(`'${mode}'`)) {
      btn.classList.remove('bg-gray-100', 'text-gray-600', 'hover:bg-gray-200');
      btn.classList.add('bg-indigo-600', 'text-white');
    }
  });
  loadContacts(1);
};

function renderContacts(contacts) {
  const tbody = document.getElementById('contacts-table-body');
  tbody.innerHTML = '';
  if (!contacts.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-sm text-gray-400">No contacts found</td></tr>`;
    return;
  }
  contacts.forEach(c => {
    const tagChips = (c.tags || []).map(t =>
      `<span class="inline-block bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-medium">${escHtml(t)}</span>`
    ).join(' ');
    const blockedBadge  = c.blocked  ? `<span class="ml-1 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-semibold">Blocked</span>`  : '';
    const archivedBadge = c.archived ? `<span class="ml-1 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-semibold">Archived</span>` : '';
    const tr = document.createElement('tr');
    tr.className = 'trow';
    tr.innerHTML = `
      <td class="px-5 py-3 text-sm text-gray-700 font-mono">${c.phoneNumber}</td>
      <td class="px-5 py-3 text-sm text-gray-800 font-medium">${escHtml(c.name || c.pushName || '—')}${blockedBadge}${archivedBadge}</td>
      <td class="px-5 py-3">${langBadge(c.detectedLanguage)}</td>
      <td class="px-5 py-3">
        <div class="flex flex-wrap gap-1 items-center">
          ${tagChips}
          <button onclick="openTagModal('${c._id}')" title="Edit tags"
            class="text-xs text-indigo-500 hover:text-indigo-700 px-1.5 py-0.5 rounded hover:bg-indigo-50">
            <i class="fas fa-tag text-xs"></i>
          </button>
        </div>
      </td>
      <td class="px-5 py-3 text-sm text-gray-500">${fmtDate(c.lastInteraction)}</td>
      <td class="px-5 py-3">
        <div class="flex items-center gap-1">
          <button onclick="openMessageModal('${c.phoneNumber}', '${escHtml(c.name || c.pushName || c.phoneNumber)}')"
            title="Send message" class="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors text-xs">
            <i class="fas fa-paper-plane"></i>
          </button>
          <button onclick="toggleBlock('${c._id}')"
            title="${c.blocked ? 'Unblock' : 'Block'}"
            class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-xs">
            <i class="fas fa-${c.blocked ? 'lock-open' : 'lock'}"></i>
          </button>
          <button onclick="toggleArchive('${c._id}')"
            title="${c.archived ? 'Unarchive' : 'Archive'}"
            class="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors text-xs">
            <i class="fas fa-${c.archived ? 'box-open' : 'archive'}"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.exportContacts = async function () {
  const AS = window.AdminState;
  try {
    let url = '/crm/contacts/export';
    if (AS.contactViewMode === 'blocked')  url += '?showBlocked=true';
    if (AS.contactViewMode === 'archived') url += '?showArchived=true';
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'contacts.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    showToast('Export failed', 'error');
  }
};

window.openImportModal = function () {
  document.getElementById('import-csv-content').value = '';
  document.getElementById('import-modal').classList.remove('hidden');
};
window.closeImportModal = function () {
  document.getElementById('import-modal').classList.add('hidden');
};
window.importContacts = async function () {
  const csv = document.getElementById('import-csv-content').value.trim();
  if (!csv) { showToast('Please paste CSV content', 'warning'); return; }
  try {
    const res = await apiFetch('/crm/contacts/import', 'POST', { csv });
    showToast(`Imported ${res.inserted || 0} contacts`, 'success');
    closeImportModal();
    loadContacts(1);
  } catch {
    showToast('Import failed', 'error');
  }
};

// Tags
window.openTagModal = function (contactId) {
  const AS = window.AdminState;
  AS.currentContactId = contactId;
  apiFetch(`/crm/contacts?page=1&limit=10000&showBlocked=true&showArchived=true`).then(({ data }) => {
    const c = data.find(x => x._id === contactId);
    AS.currentTags = c ? [...(c.tags || [])] : [];
    document.getElementById('tags-contact-label').textContent = c ? (c.name || c.pushName || c.phoneNumber) : contactId;
    renderTagChips();
    document.getElementById('tag-input').value = '';
    document.getElementById('tags-modal').classList.remove('hidden');
  }).catch(() => {
    AS.currentTags = [];
    renderTagChips();
    document.getElementById('tags-modal').classList.remove('hidden');
  });
};

function renderTagChips() {
  const AS = window.AdminState;
  const container = document.getElementById('tags-chip-container');
  container.innerHTML = '';
  AS.currentTags.forEach(tag => {
    const span = document.createElement('span');
    span.className = 'inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-xs px-2.5 py-1 rounded-full font-medium';
    span.innerHTML = `${escHtml(tag)} <button type="button" onclick="removeTag('${escHtml(tag)}')" class="text-indigo-400 hover:text-indigo-700 leading-none font-bold">&times;</button>`;
    container.appendChild(span);
  });
}

window.removeTag = function (tag) {
  const AS = window.AdminState;
  AS.currentTags = AS.currentTags.filter(t => t !== tag);
  renderTagChips();
};

window.addTagFromInput = function () {
  const AS = window.AdminState;
  const input = document.getElementById('tag-input');
  const val = input.value.trim();
  if (val && !AS.currentTags.includes(val)) {
    AS.currentTags.push(val);
    renderTagChips();
  }
  input.value = '';
};

window.handleTagInput = function (e) {
  if (e.key === 'Enter') { e.preventDefault(); addTagFromInput(); }
};

window.closeTagsModal = function () {
  const AS = window.AdminState;
  document.getElementById('tags-modal').classList.add('hidden');
  AS.currentContactId = null;
};

window.saveTags = async function () {
  const AS = window.AdminState;
  if (!AS.currentContactId) return;
  try {
    await apiFetch(`/crm/contacts/${AS.currentContactId}/tags`, 'PATCH', { tags: AS.currentTags });
    showToast('Tags saved', 'success');
    closeTagsModal();
    loadContacts(AS.contactsPage);
  } catch {
    showToast('Failed to save tags', 'error');
  }
};

window.toggleBlock = async function (contactId) {
  const AS = window.AdminState;
  try {
    await apiFetch(`/crm/contacts/${contactId}/block`, 'PATCH');
    showToast('Contact updated', 'success');
    loadContacts(AS.contactsPage);
  } catch {
    showToast('Failed to update contact', 'error');
  }
};

window.toggleArchive = async function (contactId) {
  const AS = window.AdminState;
  try {
    await apiFetch(`/crm/contacts/${contactId}/archive`, 'PATCH');
    showToast('Contact updated', 'success');
    loadContacts(AS.contactsPage);
  } catch {
    showToast('Failed to update contact', 'error');
  }
};
