document.addEventListener('DOMContentLoaded', function () {

  // ─── State ───────────────────────────────────────────────
  let currentUser       = null;
  let currentRecipient  = null;
  let currentContactId  = null;
  let currentTags       = [];
  let currentTemplateId = null;
  let currentUserId     = null;
  let currentDeliveryCampaignId = null;
  let contactsPage      = 1;
  let contactsSearch    = '';
  let contactViewMode   = 'all';
  let templates         = [];
  let allContacts       = [];
  let campaigns         = [];
  let users             = [];
  let currentCampaignTab = 'compose';
  let autoDownloadEnabled = true;
  let logEventSource    = null;
  let logFilter         = 'all';
  let logEntries        = [];
  let analyticsCharts   = {};
  let auditPage         = 1;
  let qrInstance        = null;

  // ─── Boot ────────────────────────────────────────────────
  checkAuth();
  initTabSwitching();
  initSearchHandlers();
  initFormHandlers();
  loadContacts();

  // ─── Auth ─────────────────────────────────────────────────
  async function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) return redirect('/admin/login');
    try {
      const res = await apiFetch('/crm/auth/check');
      currentUser = res.user;
      document.getElementById('username').textContent = currentUser.username;
    } catch {
      localStorage.removeItem('token');
      redirect('/admin/login');
    }
  }

  document.getElementById('logout').addEventListener('click', () => {
    localStorage.removeItem('token');
    redirect('/admin/login');
  });

  // ─── Tab Switching ────────────────────────────────────────
  function initTabSwitching() {
    const tabMap = {
      'dashboard-tab': { section: 'dashboard-section', onLoad: loadDashboardData },
      'contacts-tab':  { section: 'contacts-section',  onLoad: () => loadContacts() },
      'analytics-tab': { section: 'analytics-section', onLoad: loadAnalytics },
      'campaigns-tab': { section: 'campaigns-section', onLoad: loadCampaigns },
      'templates-tab': { section: 'templates-section', onLoad: loadTemplates },
      'bot-tab':       { section: 'bot-section',       onLoad: () => { loadBotStatus(); startLogStream(); } },
      'commands-tab':  { section: 'commands-section',  onLoad: loadCommands },
      'users-tab':     { section: 'users-section',     onLoad: loadUsers },
      'audit-tab':     { section: 'audit-section',     onLoad: () => loadAuditLogs(1) },
      'settings-tab':  { section: 'settings-section',  onLoad: loadSettings },
    };

    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        const conf = tabMap[item.id];
        if (!conf) return;

        if (item.id !== 'bot-tab') stopLogStream();

        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        document.querySelectorAll('.section-content').forEach(s => s.classList.add('hidden'));
        document.getElementById(conf.section).classList.remove('hidden');

        if (conf.onLoad) conf.onLoad();
      });
    });
  }

  // ─── Search handlers ──────────────────────────────────────
  function initSearchHandlers() {
    document.getElementById('contact-search')?.addEventListener('input', function () {
      contactsSearch = this.value;
      loadContacts(1);
    });

    document.getElementById('template-search')?.addEventListener('input', function () {
      const q = this.value.toLowerCase();
      const cat = document.getElementById('template-category-filter')?.value || '';
      const filtered = templates.filter(t =>
        (!cat || t.category === cat) &&
        (t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q))
      );
      renderTemplates(filtered);
    });
  }

  function initFormHandlers() {
    document.getElementById('settings-form')?.addEventListener('submit', e => {
      e.preventDefault();
      saveSettings();
    });
  }

  // ─── Dashboard ────────────────────────────────────────────
  async function loadDashboardData() {
    try {
      const [contactsData, campaignsData, templatesData, recentData] = await Promise.all([
        apiFetch('/crm/contacts?limit=1'),
        apiFetch('/crm/campaigns'),
        apiFetch('/crm/templates'),
        apiFetch('/crm/contacts?limit=5&sort=-lastInteraction'),
      ]);

      document.getElementById('total-contacts').textContent  = contactsData.meta.total;
      document.getElementById('total-campaigns').textContent = campaignsData.length;
      document.getElementById('total-messages').textContent  = campaignsData.reduce((s, c) => s + (c.sentCount || 0), 0);
      document.getElementById('total-templates').textContent = templatesData.length;

      renderRecentContacts(recentData.data);
    } catch (err) {
      console.error('Dashboard load error:', err);
    }
  }

  function renderRecentContacts(contacts) {
    const tbody = document.getElementById('recent-contacts');
    tbody.innerHTML = '';
    if (!contacts || !contacts.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-sm text-gray-400">No contacts yet</td></tr>`;
      return;
    }
    contacts.forEach(c => {
      const tr = document.createElement('tr');
      tr.className = 'trow divide-x divide-gray-50';
      tr.innerHTML = `
        <td class="px-6 py-3.5 text-sm text-gray-800">${escHtml(c.name || c.pushName || '—')}</td>
        <td class="px-6 py-3.5 text-sm text-gray-600">${c.phoneNumber}</td>
        <td class="px-6 py-3.5">${langBadge(c.detectedLanguage)}</td>
        <td class="px-6 py-3.5 text-sm text-gray-500">${fmtDate(c.lastInteraction)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ─── Contacts ─────────────────────────────────────────────
  async function loadContacts(page = 1) {
    contactsPage = page;
    try {
      let url = `/crm/contacts?page=${page}&limit=20&search=${encodeURIComponent(contactsSearch)}`;
      if (contactViewMode === 'blocked')  url += '&showBlocked=true';
      if (contactViewMode === 'archived') url += '&showArchived=true';
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
    contactViewMode = mode;
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

  // Export
  window.exportContacts = async function () {
    try {
      let url = '/crm/contacts/export';
      if (contactViewMode === 'blocked')  url += '?showBlocked=true';
      if (contactViewMode === 'archived') url += '?showArchived=true';
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

  // CSV Import
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
    currentContactId = contactId;
    apiFetch(`/crm/contacts?page=1&limit=10000&showBlocked=true&showArchived=true`).then(({ data }) => {
      const c = data.find(x => x._id === contactId);
      currentTags = c ? [...(c.tags || [])] : [];
      document.getElementById('tags-contact-label').textContent = c ? (c.name || c.pushName || c.phoneNumber) : contactId;
      renderTagChips();
      document.getElementById('tag-input').value = '';
      document.getElementById('tags-modal').classList.remove('hidden');
    }).catch(() => {
      currentTags = [];
      renderTagChips();
      document.getElementById('tags-modal').classList.remove('hidden');
    });
  };

  function renderTagChips() {
    const container = document.getElementById('tags-chip-container');
    container.innerHTML = '';
    currentTags.forEach(tag => {
      const span = document.createElement('span');
      span.className = 'inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-xs px-2.5 py-1 rounded-full font-medium';
      span.innerHTML = `${escHtml(tag)} <button type="button" onclick="removeTag('${escHtml(tag)}')" class="text-indigo-400 hover:text-indigo-700 leading-none font-bold">&times;</button>`;
      container.appendChild(span);
    });
  }

  window.removeTag = function (tag) {
    currentTags = currentTags.filter(t => t !== tag);
    renderTagChips();
  };

  window.addTagFromInput = function () {
    const input = document.getElementById('tag-input');
    const val = input.value.trim();
    if (val && !currentTags.includes(val)) {
      currentTags.push(val);
      renderTagChips();
    }
    input.value = '';
  };

  window.handleTagInput = function (e) {
    if (e.key === 'Enter') { e.preventDefault(); addTagFromInput(); }
  };

  window.closeTagsModal = function () {
    document.getElementById('tags-modal').classList.add('hidden');
    currentContactId = null;
  };

  window.saveTags = async function () {
    if (!currentContactId) return;
    try {
      await apiFetch(`/crm/contacts/${currentContactId}/tags`, 'PATCH', { tags: currentTags });
      showToast('Tags saved', 'success');
      closeTagsModal();
      loadContacts(contactsPage);
    } catch {
      showToast('Failed to save tags', 'error');
    }
  };

  window.toggleBlock = async function (contactId) {
    try {
      await apiFetch(`/crm/contacts/${contactId}/block`, 'PATCH');
      showToast('Contact updated', 'success');
      loadContacts(contactsPage);
    } catch {
      showToast('Failed to update contact', 'error');
    }
  };

  window.toggleArchive = async function (contactId) {
    try {
      await apiFetch(`/crm/contacts/${contactId}/archive`, 'PATCH');
      showToast('Contact updated', 'success');
      loadContacts(contactsPage);
    } catch {
      showToast('Failed to update contact', 'error');
    }
  };

  // ─── Analytics ────────────────────────────────────────────
  async function loadAnalytics() {
    try {
      const data = await apiFetch('/crm/analytics');
      renderCharts(data);
    } catch {
      showToast('Failed to load analytics', 'error');
    }
  }

  function renderCharts(data) {
    const ctxContacts = document.getElementById('contacts-chart')?.getContext('2d');
    if (ctxContacts) {
      if (analyticsCharts.contacts) analyticsCharts.contacts.destroy();
      analyticsCharts.contacts = new Chart(ctxContacts, {
        type: 'line',
        data: {
          labels: (data.contactsOverTime || []).map(d => d.date),
          datasets: [{
            label: 'New Contacts',
            data: (data.contactsOverTime || []).map(d => d.count),
            borderColor: '#4f46e5',
            backgroundColor: 'rgba(79,70,229,0.08)',
            tension: 0.4,
            fill: true,
            pointRadius: 3,
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
      });
    }

    const ctxLang = document.getElementById('language-chart')?.getContext('2d');
    if (ctxLang) {
      if (analyticsCharts.language) analyticsCharts.language.destroy();
      const dist = data.languageDistribution || { en: 0, fr: 0, other: 0 };
      analyticsCharts.language = new Chart(ctxLang, {
        type: 'doughnut',
        data: {
          labels: ['English', 'French', 'Other'],
          datasets: [{ data: [dist.en || 0, dist.fr || 0, dist.other || 0], backgroundColor: ['#4ade80', '#818cf8', '#94a3b8'] }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
      });
    }

    const ctxCamp = document.getElementById('campaigns-chart')?.getContext('2d');
    if (ctxCamp) {
      if (analyticsCharts.campaigns) analyticsCharts.campaigns.destroy();
      const delivery = data.campaignDelivery || [];
      analyticsCharts.campaigns = new Chart(ctxCamp, {
        type: 'bar',
        data: {
          labels: delivery.map(c => c.name),
          datasets: [
            { label: 'Sent',   data: delivery.map(c => c.sentCount   || 0), backgroundColor: '#4ade80' },
            { label: 'Failed', data: delivery.map(c => c.failedCount || 0), backgroundColor: '#f87171' },
          ]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom' } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
      });
    }
  }

  // ─── Campaigns ────────────────────────────────────────────
  async function loadCampaigns() {
    try {
      campaigns = await apiFetch('/crm/campaigns');
      renderCampaigns(campaigns);
      updateCampaignStats(campaigns);
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
          <div class="flex items-center gap-1">
            <button onclick="viewCampaign('${c._id}')" title="View"
              class="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors text-sm">
              <i class="fas fa-eye"></i>
            </button>
            <button onclick="viewDeliveryReport('${c._id}')" title="Delivery Report"
              class="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors text-sm">
              <i class="fas fa-chart-bar"></i>
            </button>
            <button onclick="duplicateCampaign('${c._id}')" title="Duplicate"
              class="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors text-sm">
              <i class="fas fa-copy"></i>
            </button>
            <button onclick="deleteCampaign('${c._id}')" title="Delete"
              class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ─── Campaign Modal ────────────────────────────────────────
  window.openCampaignModal = function (prefill = null) {
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
    document.getElementById('campaign-modal').classList.add('hidden');
    currentCampaignTab = 'compose';
  };

  window.switchCampaignTab = function (tab) {
    currentCampaignTab = tab;
    ['compose', 'recipients', 'schedule'].forEach(t => {
      document.getElementById(`ctab-${t}`).classList.toggle('active', t === tab);
      document.getElementById(`ctab-${t}-content`).classList.toggle('hidden', t !== tab);
    });
    const backBtn = document.getElementById('campaign-back-btn');
    const nextBtn = document.getElementById('campaign-next-btn');
    const sendBtn = document.getElementById('campaign-send-btn');
    if (tab === 'compose') {
      backBtn.classList.add('hidden');
      nextBtn.classList.remove('hidden');
      sendBtn.classList.add('hidden');
    } else if (tab === 'recipients') {
      backBtn.classList.remove('hidden');
      nextBtn.classList.remove('hidden');
      sendBtn.classList.add('hidden');
    } else {
      backBtn.classList.remove('hidden');
      nextBtn.classList.add('hidden');
      sendBtn.classList.remove('hidden');
    }
  };

  window.advanceCampaignTab = function (direction) {
    const tabs = ['compose', 'recipients', 'schedule'];
    const idx  = tabs.indexOf(currentCampaignTab);
    if (direction > 0) {
      if (currentCampaignTab === 'compose') {
        if (!document.getElementById('campaign-name').value.trim())    { showToast('Please enter a campaign name', 'warning'); return; }
        if (!document.getElementById('campaign-message').value.trim()) { showToast('Please write a message', 'warning'); return; }
      } else if (currentCampaignTab === 'recipients') {
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

    if (!name || !message) { showToast('Name and message are required', 'warning'); return; }
    if (!contacts.length)  { showToast('Select at least one recipient', 'warning'); return; }

    const sendBtn = document.getElementById('campaign-send-btn');
    sendBtn.disabled = true;
    try {
      const body = { name, message, scheduledAt, contacts, recurringType };
      if (recurringDay !== undefined && !isNaN(recurringDay)) body.recurringDay = recurringDay;
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
    const c = campaigns.find(x => x._id === id);
    if (!c) return;
    openCampaignModal({ name: c.name + ' (copy)', message: c.message, contacts: c.contacts || [] });
  };

  window.viewCampaign = function (id) {
    const c = campaigns.find(x => x._id === id);
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
    const c = campaigns.find(x => x._id === id);
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

  // Delivery Report
  window.viewDeliveryReport = async function (campaignId) {
    currentDeliveryCampaignId = campaignId;
    const c = campaigns.find(x => x._id === campaignId);
    document.getElementById('delivery-campaign-name').textContent = c?.name || campaignId;
    try {
      const report = await apiFetch(`/crm/campaigns/${campaignId}/delivery-report`);
      const tbody  = document.getElementById('delivery-report-body');
      tbody.innerHTML = '';
      if (!report || !report.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="px-5 py-8 text-center text-sm text-gray-400">No delivery data yet</td></tr>`;
      } else {
        const statusColors = { sent: 'bg-green-100 text-green-700', failed: 'bg-red-100 text-red-600', skipped: 'bg-gray-100 text-gray-500' };
        report.forEach(r => {
          const tr = document.createElement('tr');
          tr.className = 'trow';
          tr.innerHTML = `
            <td class="px-5 py-2.5 text-sm text-gray-700 font-mono">${r.phone}</td>
            <td class="px-5 py-2.5"><span class="text-xs font-bold px-2 py-0.5 rounded-full ${statusColors[r.status] || ''}">${r.status}</span></td>
            <td class="px-5 py-2.5 text-xs text-red-500">${escHtml(r.error || '—')}</td>
            <td class="px-5 py-2.5 text-xs text-gray-500">${r.sentAt ? fmtDate(r.sentAt) : '—'}</td>
          `;
          tbody.appendChild(tr);
        });
      }
      const hasFailures = (report || []).some(r => r.status === 'failed');
      document.getElementById('retry-failed-btn').classList.toggle('hidden', !hasFailures);
      document.getElementById('delivery-modal').classList.remove('hidden');
    } catch {
      showToast('Failed to load delivery report', 'error');
    }
  };

  window.closeDeliveryModal = function () {
    document.getElementById('delivery-modal').classList.add('hidden');
    currentDeliveryCampaignId = null;
  };

  window.retryCampaign = async function () {
    if (!currentDeliveryCampaignId) return;
    try {
      await apiFetch(`/crm/campaigns/${currentDeliveryCampaignId}/retry`, 'POST');
      showToast('Retrying failed sends…', 'info');
      closeDeliveryModal();
      loadCampaigns();
    } catch {
      showToast('Retry failed', 'error');
    }
  };

  // ─── Contact Selector (campaign modal) ────────────────────
  async function loadAvailableContacts(langFilter = '', preSelected = []) {
    try {
      const url = langFilter
        ? `/crm/contacts?limit=10000&language=${encodeURIComponent(langFilter)}`
        : '/crm/contacts?limit=10000';
      const { data } = await apiFetch(url);
      allContacts = data;
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

  // ─── Templates ────────────────────────────────────────────
  async function loadTemplates() {
    try {
      templates = await apiFetch('/crm/templates');
      renderTemplates(templates);
    } catch {
      showToast('Failed to load templates', 'error');
    }
  }

  window.filterTemplatesByCategory = function () {
    const cat = document.getElementById('template-category-filter')?.value || '';
    const q   = (document.getElementById('template-search')?.value || '').toLowerCase();
    const filtered = templates.filter(t =>
      (!cat || t.category === cat) &&
      (!q || t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q))
    );
    renderTemplates(filtered);
  };

  const catStyle = {
    general:    'bg-gray-100 text-gray-600',
    promo:      'bg-amber-100 text-amber-700',
    support:    'bg-blue-100 text-blue-700',
    onboarding: 'bg-green-100 text-green-700',
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
    list.forEach(t => {
      const cls = catStyle[t.category] || catStyle.general;
      const div = document.createElement('div');
      div.className = 'tmpl-card bg-white border border-gray-200 rounded-2xl overflow-hidden';
      div.dataset.templateId = t._id;
      div.innerHTML = `
        <div class="p-4 border-b border-gray-100 flex items-center justify-between gap-2">
          <h3 class="font-semibold text-gray-900 truncate">${escHtml(t.name)}</h3>
          <span class="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${cls}">${t.category || 'general'}</span>
        </div>
        <div class="p-4">
          <p class="text-sm text-gray-600 leading-relaxed whitespace-pre-line line-clamp-4 mb-4">${escHtml(t.content)}</p>
          <div class="flex items-center gap-2 border-t border-gray-100 pt-3">
            <button onclick="useTemplate('${t._id}')"
              class="flex-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-1.5 rounded-lg font-semibold text-center">
              <i class="fas fa-bullhorn mr-1"></i> Use in Campaign
            </button>
            <button onclick="openEditTemplateModal('${t._id}', ${JSON.stringify(t.name)}, ${JSON.stringify(t.content)}, '${escHtml(t.category || 'general')}')"
              class="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
              <i class="fas fa-pen text-xs"></i>
            </button>
            <button onclick="deleteTemplate('${t._id}')"
              class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
              <i class="fas fa-trash text-xs"></i>
            </button>
          </div>
        </div>
      `;
      container.appendChild(div);
    });
  }

  function populateTemplateSelector() {
    const sel = document.getElementById('template-selector');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Select a template —</option>';
    templates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t._id;
      opt.textContent = t.name;
      opt.dataset.content = t.content;
      sel.appendChild(opt);
    });
  }

  window.openNewTemplateModal = function () {
    currentTemplateId = null;
    document.getElementById('template-modal-title').textContent = 'New Template';
    document.getElementById('template-name').value     = '';
    document.getElementById('template-content').value  = '';
    document.getElementById('template-category').value = 'general';
    document.getElementById('tmpl-preview').textContent    = 'Your template preview…';
    document.getElementById('tmpl-char-count').textContent = '0 chars';
    document.getElementById('template-modal').classList.remove('hidden');
  };

  window.openEditTemplateModal = function (id, name, content, category = 'general') {
    currentTemplateId = id;
    document.getElementById('template-modal-title').textContent = 'Edit Template';
    document.getElementById('template-name').value     = name;
    document.getElementById('template-content').value  = content;
    document.getElementById('template-category').value = category;
    document.getElementById('tmpl-preview').textContent    = content || 'Your template preview…';
    document.getElementById('tmpl-char-count').textContent = content.length + ' chars';
    document.getElementById('template-modal').classList.remove('hidden');
  };

  window.closeTemplateModal = function () {
    document.getElementById('template-modal').classList.add('hidden');
    currentTemplateId = null;
  };

  window.saveTemplate = async function () {
    const name     = document.getElementById('template-name').value.trim();
    const content  = document.getElementById('template-content').value.trim();
    const category = document.getElementById('template-category').value || 'general';
    if (!name || !content) { showToast('Name and content are required', 'warning'); return; }
    try {
      const url    = currentTemplateId ? `/crm/templates/${currentTemplateId}` : '/crm/templates';
      const method = currentTemplateId ? 'PUT' : 'POST';
      await apiFetch(url, method, { name, content, category });
      showToast('Template saved', 'success');
      closeTemplateModal();
      loadTemplates();
    } catch {
      showToast('Failed to save template', 'error');
    }
  };

  window.deleteTemplate = async function (id) {
    const t = templates.find(x => x._id === id);
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
    const t = templates.find(x => x._id === id);
    if (!t) return;
    openCampaignModal({ name: '', message: t.content, contacts: [] });
    document.getElementById('campaigns-tab').click();
  };

  // ─── Bot Status ────────────────────────────────────────────
  window.loadBotStatus = async function () {
    try {
      const data    = await apiFetch('/crm/bot/status');
      const dot     = document.getElementById('bot-status-dot');
      const text    = document.getElementById('bot-status-text');
      const details = document.getElementById('bot-status-details');
      const qrWrap  = document.getElementById('qr-container-wrap');
      const qrEl    = document.getElementById('qr-container');

      dot.className  = `status-dot ${data.status}`;
      text.textContent = data.status === 'connected' ? 'Connected'
                       : data.status === 'scanning'  ? 'Scanning QR Code'
                       : 'Disconnected';

      let html = '';
      if (data.phone)    html += `<div><span class="text-gray-400">Phone:</span> <span class="font-medium">${escHtml(data.phone)}</span></div>`;
      if (data.pushName) html += `<div><span class="text-gray-400">Name:</span> <span class="font-medium">${escHtml(data.pushName)}</span></div>`;
      details.innerHTML = html;

      if (data.uptime !== undefined) {
        const h = Math.floor(data.uptime / 3600);
        const m = Math.floor((data.uptime % 3600) / 60);
        const s = data.uptime % 60;
        document.getElementById('bot-uptime').textContent = `${h}h ${m}m ${s}s`;
      }

      if (data.status === 'scanning' && data.qrCode) {
        qrWrap.classList.remove('hidden');
        qrEl.innerHTML = '';
        if (qrInstance) { try { qrInstance.clear(); } catch (_) {} }
        if (typeof QRCode !== 'undefined') {
          qrInstance = new QRCode(qrEl, { text: data.qrCode, width: 200, height: 200 });
        } else {
          qrEl.textContent = 'QR library not available';
        }
      } else {
        qrWrap.classList.add('hidden');
        if (qrInstance) { try { qrInstance.clear(); } catch (_) {} qrInstance = null; }
      }
    } catch {
      showToast('Failed to load bot status', 'error');
    }
  };

  window.reconnectBot = async function () {
    try {
      await apiFetch('/crm/bot/reconnect', 'POST');
      showToast('Reconnecting bot…', 'info');
      setTimeout(loadBotStatus, 3000);
    } catch {
      showToast('Reconnect failed', 'error');
    }
  };

  // ─── Live Logs (SSE) ──────────────────────────────────────
  function startLogStream() {
    if (logEventSource) return;
    const token = localStorage.getItem('token');
    logEventSource = new EventSource(`/crm/logs/stream?token=${encodeURIComponent(token)}`);
    logEventSource.onmessage = e => {
      try {
        const entry = JSON.parse(e.data);
        logEntries.push(entry);
        if (logEntries.length > 500) logEntries.shift();
        appendLogLine(entry);
      } catch (_) {}
    };
  }

  function stopLogStream() {
    if (logEventSource) { logEventSource.close(); logEventSource = null; }
  }

  function appendLogLine(entry) {
    const el = document.getElementById('log-output');
    if (!el) return;
    if (logFilter !== 'all' && entry.level !== logFilter) return;
    const colors = { error: '#f87171', warn: '#fbbf24', info: '#60a5fa', debug: '#a78bfa', verbose: '#6ee7b7' };
    const span = document.createElement('span');
    span.dataset.level = entry.level;
    span.style.color   = colors[entry.level] || '#cbd5e1';
    span.textContent   = `[${entry.timestamp}] ${(entry.level || '').toUpperCase()}: ${entry.message}\n`;
    el.appendChild(span);
    const autoScroll = document.getElementById('auto-scroll');
    if (!autoScroll || autoScroll.checked) el.scrollTop = el.scrollHeight;
  }

  window.setLogFilter = function (level) {
    logFilter = level;
    document.querySelectorAll('.log-filter-btn').forEach(btn => {
      const active = btn.dataset.level === level;
      btn.classList.toggle('bg-slate-700', active);
      btn.classList.toggle('text-white',   active);
      btn.classList.toggle('bg-gray-100',  !active);
      btn.classList.toggle('text-gray-600', !active);
    });
    const el = document.getElementById('log-output');
    if (!el) return;
    el.innerHTML = '';
    logEntries.forEach(entry => appendLogLine(entry));
  };

  window.clearLogs = function () {
    logEntries = [];
    const el = document.getElementById('log-output');
    if (el) el.innerHTML = '';
  };

  // ─── Commands ─────────────────────────────────────────────
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

  // ─── Users ────────────────────────────────────────────────
  async function loadUsers() {
    try {
      users = await apiFetch('/crm/users');
      renderUsers(users);
    } catch {
      showToast('Failed to load users', 'error');
    }
  }

  function renderUsers(list) {
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '';
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-sm text-gray-400">No users found</td></tr>`;
      return;
    }
    list.forEach(u => {
      const isSelf = currentUser && u._id === currentUser._id;
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
    currentUserId = user?._id || null;
    document.getElementById('user-modal-title').textContent = user ? 'Edit User' : 'Add User';
    document.getElementById('user-modal-id').value   = user?._id    || '';
    document.getElementById('user-username').value   = user?.username || '';
    document.getElementById('user-password').value   = '';
    document.getElementById('user-role').value       = user?.role    || 'admin';
    document.getElementById('user-password-wrap').classList.toggle('hidden', !!user);
    document.getElementById('user-modal').classList.remove('hidden');
  };

  window.closeUserModal = function () {
    document.getElementById('user-modal').classList.add('hidden');
    currentUserId = null;
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
    const u = users.find(x => x._id === id);
    if (!confirm(`Delete user "${u?.username}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/crm/users/${id}`, 'DELETE');
      showToast('User deleted', 'success');
      loadUsers();
    } catch {
      showToast('Failed to delete user', 'error');
    }
  };

  // ─── Audit Logs ───────────────────────────────────────────
  window.loadAuditLogs = async function (page = 1) {
    auditPage = page;
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

  // ─── Settings ─────────────────────────────────────────────
  async function loadSettings() {
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
        GEMINI_API_KEY:         'Gemini AI',
        OPENWEATHERMAP_API_KEY: 'OpenWeatherMap',
        ASSEMBLYAI_API_KEY:     'AssemblyAI',
        SPEECHIFY_API_KEY:      'Speechify',
        CHAT_GPT_API_KEY:       'ChatGPT / OpenAI',
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
      autoDownloadEnabled = data.autoDownloadEnabled ?? true;
      const toggle = document.getElementById('toggle-autoDownload');
      if (autoDownloadEnabled) toggle.classList.add('on'); else toggle.classList.remove('on');
    } catch {
      showToast('Failed to load settings', 'error');
    }
  }

  async function saveSettings() {
    const maxFileSizeMb = parseInt(document.getElementById('setting-maxFileSizeMb').value, 10);
    const keyIds = ['GEMINI_API_KEY', 'CHAT_GPT_API_KEY', 'OPENWEATHERMAP_API_KEY', 'ASSEMBLYAI_API_KEY', 'SPEECHIFY_API_KEY'];
    const apiKeys = {};
    keyIds.forEach(k => {
      const val = document.getElementById(`key-${k}`)?.value?.trim();
      if (val) apiKeys[k] = val;
    });
    try {
      await apiFetch('/crm/settings', 'PUT', { maxFileSizeMb, autoDownloadEnabled, apiKeys });
      showToast('Settings saved', 'success');
      keyIds.forEach(k => { const el = document.getElementById(`key-${k}`); if (el) el.value = ''; });
      loadSettings();
    } catch {
      showToast('Failed to save settings', 'error');
    }
  }

  window.toggleAutoDownload = function () {
    autoDownloadEnabled = !autoDownloadEnabled;
    const t = document.getElementById('toggle-autoDownload');
    if (autoDownloadEnabled) t.classList.add('on'); else t.classList.remove('on');
  };

  // ─── Direct Message ───────────────────────────────────────
  window.openMessageModal = function (phone, name) {
    currentRecipient = phone;
    document.getElementById('msg-recipient-label').textContent = `To: ${name || phone}`;
    document.getElementById('message-content').value = '';
    document.getElementById('message-modal').classList.remove('hidden');
  };

  window.closeMessageModal = function () {
    document.getElementById('message-modal').classList.add('hidden');
    currentRecipient = null;
  };

  window.sendPrivateMessage = async function () {
    const message = document.getElementById('message-content').value.trim();
    if (!message || !currentRecipient) return;
    try {
      await apiFetch('/crm/send-message', 'POST', { phoneNumber: currentRecipient, message });
      showToast('Message sent!', 'success');
      closeMessageModal();
    } catch {
      showToast('Failed to send message', 'error');
    }
  };

  // ─── Pagination ───────────────────────────────────────────
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

  // ─── Toast ────────────────────────────────────────────────
  window.showToast = function (message, type = 'success') {
    const colors = { success: 'bg-green-600', error: 'bg-red-600', warning: 'bg-amber-500', info: 'bg-blue-600' };
    const icons  = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    const toast = document.createElement('div');
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

  // ─── Utilities ────────────────────────────────────────────
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

  async function apiFetch(url, method = 'GET', body = null) {
    const opts = {
      method,
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    };
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status}`);
    return res.json();
  }

});
