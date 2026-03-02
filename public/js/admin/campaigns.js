// ── Campaigns ─────────────────────────────────────────────────────────────────
async function loadCampaigns() {
  const AS = window.AdminState;
  try {
    AS.campaigns = await apiFetch('/crm/campaigns');
    renderCampaigns(AS.campaigns);
    updateCampaignStats(AS.campaigns);
  } catch {
    showToast('Failed to load campaigns', 'error');
  }
}

function updateCampaignStats(list) {
  document.getElementById('camp-total').textContent     = list.length;
  document.getElementById('camp-sent').textContent      = list.filter(c => c.status === 'sent').length;
  document.getElementById('camp-scheduled').textContent = list.filter(c => c.status === 'scheduled').length;
  document.getElementById('camp-failed').textContent    = list.filter(c => c.status === 'failed').length;
}

function renderCampaigns(list) {
  const tbody = document.getElementById('campaigns-table-body');
  tbody.innerHTML = '';
  if (!list.length) {
    tbody.innerHTML = `
      <tr><td colspan="7" class="px-6 py-16 text-center">
        <div class="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <i class="fas fa-bullhorn text-gray-400 text-xl"></i>
        </div>
        <div class="text-sm font-medium text-gray-500 mb-1">No campaigns yet</div>
        <button onclick="openCampaignModal()" class="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-semibold mt-2">New Campaign</button>
      </td></tr>`;
    return;
  }
  list.forEach(c => {
    const recurring = (c.recurringType && c.recurringType !== 'none')
      ? `<span class="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-semibold">${c.recurringType}</span>`
      : `<span class="text-xs text-gray-400">—</span>`;
    const tr = document.createElement('tr');
    tr.className = 'trow';
    tr.innerHTML = `
      <td class="px-5 py-3 text-sm text-gray-800 font-medium">${escHtml(c.name)}</td>
      <td class="px-5 py-3"><span class="badge badge-${c.status}">${c.status}</span></td>
      <td class="px-5 py-3 text-sm text-gray-600">${(c.contacts || []).length}</td>
      <td class="px-5 py-3 text-sm">
        <span class="text-green-600 font-semibold">${c.sentCount || 0}</span>
        <span class="text-gray-300 mx-1">/</span>
        <span class="text-red-500 font-semibold">${c.failedCount || 0}</span>
      </td>
      <td class="px-5 py-3">${recurring}</td>
      <td class="px-5 py-3 text-sm text-gray-500">${c.scheduledAt ? fmtDate(c.scheduledAt) : '—'}</td>
      <td class="px-5 py-3">
        <div class="flex items-center gap-1 flex-wrap">
          <button onclick="viewCampaign('${c._id}')" title="View"
            class="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors text-sm"><i class="fas fa-eye"></i></button>
          <button onclick="viewDeliveryReport('${c._id}')" title="Delivery Report"
            class="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors text-sm"><i class="fas fa-chart-bar"></i></button>
          ${c.status === 'sending' || c.status === 'scheduled' ? `
          <button onclick="pauseCampaign('${c._id}')" title="Pause"
            class="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors text-sm"><i class="fas fa-pause"></i></button>` : ''}
          ${c.status === 'paused' ? `
          <button onclick="resumeCampaign('${c._id}')" title="Resume"
            class="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors text-sm"><i class="fas fa-play"></i></button>` : ''}
          ${['sending','scheduled','paused'].includes(c.status) ? `
          <button onclick="cancelCampaign('${c._id}')" title="Cancel"
            class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"><i class="fas fa-ban"></i></button>` : ''}
          ${['sent','failed','cancelled'].includes(c.status) ? `
          <button onclick="archiveCampaign('${c._id}')" title="Archive"
            class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm"><i class="fas fa-archive"></i></button>` : ''}
          <button onclick="duplicateCampaign('${c._id}')" title="Duplicate"
            class="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors text-sm"><i class="fas fa-copy"></i></button>
          <button onclick="deleteCampaign('${c._id}')" title="Delete"
            class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Campaign Modal ─────────────────────────────────────────────────────────────
window.openCampaignModal = function (prefill = null) {
  const AS = window.AdminState;
  document.getElementById('campaign-modal-title').textContent = prefill ? 'Duplicate Campaign' : 'New Campaign';
  document.getElementById('campaign-name').value        = prefill?.name    ?? '';
  document.getElementById('campaign-message').value     = prefill?.message ?? '';
  document.getElementById('campaign-scheduledAt').value = '';
  document.getElementById('campaign-recurringType').value = 'none';
  document.getElementById('recurring-day-wrap').classList.add('hidden');
  document.getElementById('campaign-modal').classList.remove('hidden');
  switchCampaignTab('compose');
  populateTemplateSelector();
  loadAvailableContacts('', prefill?.contacts ?? []);
};

window.closeCampaignModal = function () {
  const AS = window.AdminState;
  document.getElementById('campaign-modal').classList.add('hidden');
  AS.currentCampaignTab = 'compose';
};

window.switchCampaignTab = function (tab) {
  const AS = window.AdminState;
  AS.currentCampaignTab = tab;
  ['compose', 'recipients', 'schedule'].forEach(t => {
    document.getElementById(`ctab-${t}`).classList.toggle('active', t === tab);
    document.getElementById(`ctab-${t}-content`).classList.toggle('hidden', t !== tab);
  });
  const backBtn = document.getElementById('campaign-back-btn');
  const nextBtn = document.getElementById('campaign-next-btn');
  const sendBtn = document.getElementById('campaign-send-btn');
  if (tab === 'compose') {
    backBtn.classList.add('hidden'); nextBtn.classList.remove('hidden'); sendBtn.classList.add('hidden');
  } else if (tab === 'recipients') {
    backBtn.classList.remove('hidden'); nextBtn.classList.remove('hidden'); sendBtn.classList.add('hidden');
  } else {
    backBtn.classList.remove('hidden'); nextBtn.classList.add('hidden'); sendBtn.classList.remove('hidden');
  }
};

window.advanceCampaignTab = function (direction) {
  const AS = window.AdminState;
  const tabs = ['compose', 'recipients', 'schedule'];
  const idx  = tabs.indexOf(AS.currentCampaignTab);
  if (direction > 0) {
    if (AS.currentCampaignTab === 'compose') {
      if (!document.getElementById('campaign-name').value.trim())    { showToast('Please enter a campaign name', 'warning'); return; }
      if (!document.getElementById('campaign-message').value.trim()) { showToast('Please write a message', 'warning'); return; }
    } else if (AS.currentCampaignTab === 'recipients') {
      if (!document.querySelectorAll('#selected-contacts-list .sel-chip').length) {
        showToast('Please select at least one recipient', 'warning'); return;
      }
    }
    if (idx < tabs.length - 1) switchCampaignTab(tabs[idx + 1]);
  } else {
    if (idx > 0) switchCampaignTab(tabs[idx - 1]);
  }
};

window.submitCampaign = async function () {
  const name          = document.getElementById('campaign-name').value.trim();
  const message       = document.getElementById('campaign-message').value.trim();
  const scheduledAt   = document.getElementById('campaign-scheduledAt').value || null;
  const recurringType = document.getElementById('campaign-recurringType')?.value || 'none';
  const recurringDayVal = document.getElementById('campaign-recurringDay')?.value;
  const recurringDay  = recurringDayVal ? parseInt(recurringDayVal, 10) : undefined;
  const contacts      = Array.from(document.querySelectorAll('#selected-contacts-list .sel-chip')).map(el => el.dataset.phone);
  const throttleRate  = parseInt(document.getElementById('campaign-throttle')?.value || '60', 10);
  const expiresAt     = document.getElementById('campaign-expires')?.value || null;
  const excludeTagsRaw = document.getElementById('campaign-exclude-tags')?.value || '';
  const excludeTags   = excludeTagsRaw.split(',').map(t => t.trim()).filter(Boolean);
  const notes         = document.getElementById('campaign-notes')?.value || '';
  const abVariantB    = document.getElementById('ab-test-toggle')?.checked
    ? (document.getElementById('campaign-variant-b')?.value || '')
    : '';
  const mediaUrl = document.getElementById('campaign-media-url')?.value.trim() || '';

  if (!name || !message) { showToast('Name and message are required', 'warning'); return; }
  if (!contacts.length)  { showToast('Select at least one recipient', 'warning'); return; }

  const sendBtn = document.getElementById('campaign-send-btn');
  sendBtn.disabled = true;
  try {
    const body = { name, message, scheduledAt, contacts, recurringType, throttleRate, excludeTags, notes, abVariantB, mediaUrl };
    if (recurringDay !== undefined && !isNaN(recurringDay)) body.recurringDay = recurringDay;
    if (expiresAt) body.expiresAt = expiresAt;
    await apiFetch('/crm/campaigns', 'POST', body);
    showToast(scheduledAt ? 'Campaign scheduled!' : 'Campaign sent!', 'success');
    closeCampaignModal();
    loadCampaigns();
  } catch {
    showToast('Failed to create campaign', 'error');
  } finally {
    sendBtn.disabled = false;
  }
};

window.duplicateCampaign = function (id) {
  const AS = window.AdminState;
  const c = AS.campaigns.find(x => x._id === id);
  if (!c) return;
  openCampaignModal({ name: c.name + ' (copy)', message: c.message, contacts: c.contacts || [] });
};

window.viewCampaign = function (id) {
  const AS = window.AdminState;
  const c = AS.campaigns.find(x => x._id === id);
  if (!c) return;
  document.getElementById('view-campaign-name').textContent = c.name;
  document.getElementById('view-campaign-body').innerHTML = `
    <div class="flex items-start justify-between mb-4">
      <span class="badge badge-${c.status}">${c.status}</span>
      <div class="text-right text-xs text-gray-400">
        <div>Created ${fmtDate(c.createdAt)}</div>
        ${c.scheduledAt ? `<div>Scheduled ${fmtDate(c.scheduledAt)}</div>` : ''}
      </div>
    </div>
    <div class="grid grid-cols-3 gap-3 mb-4">
      <div class="bg-gray-50 rounded-xl p-3 text-center"><div class="text-xl font-bold text-gray-900">${(c.contacts || []).length}</div><div class="text-xs text-gray-500 mt-0.5">Recipients</div></div>
      <div class="bg-green-50 rounded-xl p-3 text-center"><div class="text-xl font-bold text-green-600">${c.sentCount || 0}</div><div class="text-xs text-gray-500 mt-0.5">Sent</div></div>
      <div class="bg-red-50 rounded-xl p-3 text-center"><div class="text-xl font-bold text-red-500">${c.failedCount || 0}</div><div class="text-xs text-gray-500 mt-0.5">Failed</div></div>
    </div>
    ${(c.recurringType && c.recurringType !== 'none') ? `<div class="text-xs bg-blue-50 text-blue-700 rounded-lg p-2 mb-3 font-medium"><i class="fas fa-redo mr-1"></i>Recurring: ${c.recurringType}</div>` : ''}
    <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Message</div>
    <div class="bg-gray-50 rounded-xl p-3 text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed border border-gray-200">${escHtml(c.message)}</div>
    <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
      <button onclick="closeCampaignViewModal();duplicateCampaign('${c._id}')" class="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl font-semibold">Duplicate</button>
      <button onclick="closeCampaignViewModal()" class="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-semibold">Close</button>
    </div>
  `;
  document.getElementById('campaign-view-modal').classList.remove('hidden');
};

window.closeCampaignViewModal = function () {
  document.getElementById('campaign-view-modal').classList.add('hidden');
};

window.deleteCampaign = async function (id) {
  const AS = window.AdminState;
  const c = AS.campaigns.find(x => x._id === id);
  if (!c) return;
  if (!confirm(`Delete campaign "${c.name}"? This cannot be undone.`)) return;
  try {
    await apiFetch(`/crm/campaigns/${id}`, 'DELETE');
    showToast('Campaign deleted', 'success');
    loadCampaigns();
  } catch {
    showToast('Failed to delete campaign', 'error');
  }
};

window.viewDeliveryReport = async function (campaignId) {
  const AS = window.AdminState;
  AS.currentDeliveryCampaignId = campaignId;
  const c = AS.campaigns.find(x => x._id === campaignId);
  document.getElementById('delivery-campaign-name').textContent = c?.name || campaignId;
  try {
    const report = await apiFetch(`/crm/campaigns/${campaignId}/delivery-report`);
    const tbody  = document.getElementById('delivery-report-body');
    tbody.innerHTML = '';
    const deliveryData = report?.deliveryReport || report || [];
    if (!deliveryData.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="px-5 py-8 text-center text-sm text-gray-400">No delivery data yet</td></tr>`;
    } else {
      const statusColors = { sent: 'bg-green-100 text-green-700', failed: 'bg-red-100 text-red-600', skipped: 'bg-gray-100 text-gray-500' };
      deliveryData.forEach(r => {
        const tr = document.createElement('tr');
        tr.className = 'trow';
        tr.dataset.status  = r.status;
        tr.dataset.replied = r.repliedAt ? 'yes' : 'no';
        tr.innerHTML = `
          <td class="px-5 py-2.5 text-sm text-gray-700 font-mono">${r.phone}</td>
          <td class="px-5 py-2.5"><span class="text-xs font-bold px-2 py-0.5 rounded-full ${statusColors[r.status] || ''}">${r.status}</span></td>
          <td class="px-5 py-2.5 text-xs text-red-500">${escHtml(r.error || '—')}</td>
          <td class="px-5 py-2.5 text-xs text-gray-500">${r.sentAt ? fmtDate(r.sentAt) : '—'}</td>
          <td class="px-5 py-2.5 text-xs ${r.repliedAt ? 'text-green-600 font-semibold' : 'text-gray-400'}">${r.repliedAt ? fmtDate(r.repliedAt) : '—'}</td>
        `;
        tbody.appendChild(tr);
      });
      const total = deliveryData.length;
      const sent = deliveryData.filter(r => r.status === 'sent').length;
      const failed = deliveryData.filter(r => r.status === 'failed').length;
      const replied = deliveryData.filter(r => r.repliedAt).length;
      const summary = document.getElementById('delivery-summary');
      if (summary) summary.textContent = `${sent} sent · ${failed} failed · ${replied} replied / ${total} total`;
    }
    const hasFailures = deliveryData.some(r => r.status === 'failed');
    document.getElementById('retry-failed-btn').classList.toggle('hidden', !hasFailures);
    document.getElementById('delivery-modal').classList.remove('hidden');
  } catch {
    showToast('Failed to load delivery report', 'error');
  }
};

window.closeDeliveryModal = function () {
  const AS = window.AdminState;
  document.getElementById('delivery-modal').classList.add('hidden');
  AS.currentDeliveryCampaignId = null;
};

window.retryCampaign = async function () {
  const AS = window.AdminState;
  if (!AS.currentDeliveryCampaignId) return;
  try {
    await apiFetch(`/crm/campaigns/${AS.currentDeliveryCampaignId}/retry`, 'POST');
    showToast('Retrying failed sends…', 'info');
    closeDeliveryModal();
    loadCampaigns();
  } catch {
    showToast('Retry failed', 'error');
  }
};

// ── Campaign Extras (pause / resume / cancel / archive / export) ───────────────
window.pauseCampaign = async function (id) {
  try { await apiFetch(`/crm/campaigns/${id}/pause`, 'PATCH'); showToast('Campaign paused', 'success'); loadCampaigns(); }
  catch { showToast('Failed to pause campaign', 'error'); }
};
window.resumeCampaign = async function (id) {
  try { await apiFetch(`/crm/campaigns/${id}/resume`, 'PATCH'); showToast('Campaign resumed', 'success'); loadCampaigns(); }
  catch { showToast('Failed to resume campaign', 'error'); }
};
window.cancelCampaign = async function (id) {
  if (!confirm('Cancel this campaign?')) return;
  try { await apiFetch(`/crm/campaigns/${id}/cancel`, 'PATCH'); showToast('Campaign cancelled', 'success'); loadCampaigns(); }
  catch { showToast('Failed to cancel campaign', 'error'); }
};
window.archiveCampaign = async function (id) {
  try { await apiFetch(`/crm/campaigns/${id}/archive`, 'PATCH'); showToast('Campaign archived', 'success'); loadCampaigns(); }
  catch { showToast('Failed to archive campaign', 'error'); }
};

window.exportDeliveryReport = async function (id) {
  if (!id) return;
  try {
    const res = await fetch(`/crm/campaigns/${id}/delivery-report/export`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `delivery-report-${id}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    showToast('Export failed', 'error');
  }
};

window.filterDeliveryReport = function (status) {
  document.querySelectorAll('.delivery-filter-btn').forEach(btn => {
    const active = btn.getAttribute('onclick')?.includes(`'${status}'`);
    btn.classList.toggle('bg-indigo-600', active);
    btn.classList.toggle('text-white', active);
    btn.classList.toggle('bg-gray-100', !active);
    btn.classList.toggle('text-gray-600', !active);
  });
  document.querySelectorAll('#delivery-report-body tr').forEach(tr => {
    if (status === 'all') { tr.style.display = ''; return; }
    if (status === 'replied') { tr.style.display = tr.dataset.replied === 'yes' ? '' : 'none'; return; }
    tr.style.display = tr.dataset.status === status ? '' : 'none';
  });
};

// ── Contact Selector (inside campaign modal) ───────────────────────────────────
async function loadAvailableContacts(langFilter = '', preSelected = []) {
  const AS = window.AdminState;
  try {
    const url = langFilter
      ? `/crm/contacts?limit=10000&language=${encodeURIComponent(langFilter)}`
      : '/crm/contacts?limit=10000';
    const { data } = await apiFetch(url);
    AS.allContacts = data;
    renderAvailableContacts(data, preSelected);
  } catch {
    showToast('Failed to load contacts', 'error');
  }
}

function renderAvailableContacts(contacts, preSelected = []) {
  const el = document.getElementById('available-contacts-list');
  if (!el) return;
  el.innerHTML = '';
  if (!contacts.length) {
    el.innerHTML = '<p class="text-xs text-gray-400 text-center pt-8 px-4">No contacts found</p>';
    return;
  }
  contacts.forEach(c => {
    const div = document.createElement('div');
    div.className = 'contact-item';
    div.dataset.language = c.detectedLanguage || 'other';
    div.dataset.phone    = c.phoneNumber;
    div.dataset.name     = (c.name || c.pushName || c.phoneNumber).toLowerCase();
    const icon = c.detectedLanguage === 'en' ? '🇬🇧' : c.detectedLanguage === 'fr' ? '🇫🇷' : '🌍';
    const isPre = preSelected.includes(c.phoneNumber);
    div.innerHTML = `
      <input type="checkbox" id="ck-${c.phoneNumber}" class="contact-checkbox" value="${c.phoneNumber}"
        data-language="${c.detectedLanguage || 'other'}" ${isPre ? 'checked' : ''}>
      <label for="ck-${c.phoneNumber}" class="flex-1 flex items-center justify-between cursor-pointer">
        <span class="text-gray-800">${icon} ${escHtml(c.name || c.pushName || c.phoneNumber)}</span>
        <span class="text-gray-400 text-xs">${c.detectedRegion || ''}</span>
      </label>
    `;
    const checkbox = div.querySelector('input');
    checkbox.addEventListener('change', function () {
      if (this.checked) addToSelected(c.phoneNumber, c.name || c.pushName || c.phoneNumber, c.detectedLanguage);
      else removeFromSelected(c.phoneNumber);
    });
    if (isPre) addToSelected(c.phoneNumber, c.name || c.pushName || c.phoneNumber, c.detectedLanguage, true);
    el.appendChild(div);
  });
}

window.filterAvailableContacts = function (query) {
  const q = (query || '').toLowerCase();
  document.querySelectorAll('#available-contacts-list .contact-item').forEach(div => {
    const match = div.dataset.name.includes(q) || div.dataset.phone.includes(q);
    div.style.display = match ? '' : 'none';
  });
};

window.parseCsvRecipients = function (value) {
  const phones = value.split(/[\n,]+/).map(p => p.trim()).filter(Boolean);
  phones.forEach(phone => {
    if (!document.querySelector(`#selected-contacts-list [data-phone="${phone}"]`)) {
      addToSelected(phone, phone, 'other');
    }
  });
};

function addToSelected(phone, name, lang, silent = false) {
  if (document.querySelector(`#selected-contacts-list [data-phone="${phone}"]`)) return;
  document.getElementById('no-contacts-message')?.remove();
  const icon = lang === 'en' ? '🇬🇧' : lang === 'fr' ? '🇫🇷' : '🌍';
  const chip = document.createElement('div');
  chip.className  = 'sel-chip';
  chip.dataset.phone = phone;
  chip.innerHTML = `
    <span class="truncate">${icon} ${escHtml(name)}</span>
    <button onclick="removeFromSelected('${phone}')" class="shrink-0 text-indigo-400 hover:text-indigo-700 ml-1">
      <i class="fas fa-times text-xs"></i>
    </button>
  `;
  document.getElementById('selected-contacts-list').appendChild(chip);
  refreshSelectedCount();
}

window.removeFromSelected = function (phone) {
  document.querySelector(`#selected-contacts-list [data-phone="${phone}"]`)?.remove();
  const ck = document.getElementById(`ck-${phone}`);
  if (ck) ck.checked = false;
  if (!document.querySelectorAll('#selected-contacts-list .sel-chip').length) {
    const p = document.createElement('p');
    p.id = 'no-contacts-message';
    p.className = 'text-xs text-gray-400 text-center pt-10';
    p.textContent = 'No contacts selected yet';
    document.getElementById('selected-contacts-list').appendChild(p);
  }
  refreshSelectedCount();
};

function refreshSelectedCount() {
  const n = document.querySelectorAll('#selected-contacts-list .sel-chip').length;
  const el = document.getElementById('selected-count');
  if (el) el.textContent = n;
}

window.selectAllContacts = function () {
  document.querySelectorAll('#available-contacts-list .contact-checkbox:not(:checked)').forEach(ck => {
    ck.checked = true; ck.dispatchEvent(new Event('change'));
  });
};
window.selectEnglishSpeakers = function () {
  deselectAllContacts();
  document.querySelectorAll('#available-contacts-list .contact-checkbox[data-language="en"]').forEach(ck => {
    ck.checked = true; ck.dispatchEvent(new Event('change'));
  });
};
window.selectFrenchSpeakers = function () {
  deselectAllContacts();
  document.querySelectorAll('#available-contacts-list .contact-checkbox[data-language="fr"]').forEach(ck => {
    ck.checked = true; ck.dispatchEvent(new Event('change'));
  });
};
window.deselectAllContacts = function () {
  document.querySelectorAll('#available-contacts-list .contact-checkbox:checked').forEach(ck => {
    ck.checked = false; ck.dispatchEvent(new Event('change'));
  });
};
