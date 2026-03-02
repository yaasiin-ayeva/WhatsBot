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
  let currentInboxPhone  = null;
  let inboxEventSource   = null;
  let scoreRules         = [];
  let inboxConversations = [];
  let integrations       = [];
  let autoReplies        = [];
  let currentIntegrationId = null;
  let currentAutoReplyId   = null;
  let currentIntegrationTab = 'webhooks';
  let availableEvents      = [];

  // ─── Boot ────────────────────────────────────────────────
  checkAuth();
  initTabSwitching();
  initSidebarToggle();
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
    stopLogStream();
    stopInboxStream();
    localStorage.removeItem('token');
    redirect('/admin/login');
  });

  // ─── Sidebar Toggle ───────────────────────────────────────
  function initSidebarToggle() {
    if (localStorage.getItem('sidebarCollapsed') === 'true') {
      document.body.classList.add('sidebar-collapsed');
    }
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
      const collapsed = document.body.classList.toggle('sidebar-collapsed');
      localStorage.setItem('sidebarCollapsed', collapsed);
    });
  }

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
      'chats-tab':              { section: 'chats-section',              onLoad: loadChats },
      'scoring-tab':            { section: 'scoring-section',            onLoad: loadScoring },
      'scheduled-messages-tab': { section: 'scheduled-messages-section', onLoad: loadScheduledMessages },
      'integrations-tab':       { section: 'integrations-section',       onLoad: loadIntegrations },
    };

    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        const conf = tabMap[item.id];
        if (!conf) return;

        if (item.id !== 'bot-tab') stopLogStream();

        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        document.querySelectorAll('.section-content').forEach(s => {
          s.classList.add('hidden');
          s.style.removeProperty('display'); // clear any inline display so hidden class takes effect
        });
        const sectionEl = document.getElementById(conf.section);
        sectionEl.classList.remove('hidden');
        if (conf.section === 'chats-section') sectionEl.style.display = 'flex';

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
      const [contactsData, campaignsData, templatesData, recentData, analytics] = await Promise.all([
        apiFetch('/crm/contacts?limit=1'),
        apiFetch('/crm/campaigns'),
        apiFetch('/crm/templates'),
        apiFetch('/crm/contacts?limit=5&sort=-lastInteraction'),
        apiFetch('/crm/analytics').catch(() => null),
      ]);

      document.getElementById('total-contacts').textContent  = contactsData.meta.total;
      document.getElementById('total-campaigns').textContent = campaignsData.length;
      document.getElementById('total-messages').textContent  = analytics?.messagesDelta?.today ?? 0;
      document.getElementById('total-templates').textContent = templatesData.length;

      // Delta indicators
      if (analytics?.contactsDelta) {
        const { today, yesterday } = analytics.contactsDelta;
        const diff = today - yesterday;
        const el = document.getElementById('contacts-delta');
        if (el) {
          el.className = `text-xs mt-1 ${diff >= 0 ? 'text-green-600' : 'text-red-500'}`;
          el.textContent = `${diff >= 0 ? '+' : ''}${diff} vs yesterday`;
          el.classList.remove('hidden');
        }
      }
      if (analytics?.messagesDelta) {
        const { today, yesterday } = analytics.messagesDelta;
        const diff = today - yesterday;
        const el = document.getElementById('messages-delta');
        if (el) {
          el.className = `text-xs mt-1 ${diff >= 0 ? 'text-green-600' : 'text-red-500'}`;
          el.textContent = `${diff >= 0 ? '+' : ''}${diff} vs yesterday`;
          el.classList.remove('hidden');
        }
      }

      // Health banner
      const banner = document.getElementById('health-banner');
      const bannerText = document.getElementById('health-banner-text');
      if (banner && analytics?.failedCampaigns?.length) {
        bannerText.textContent = `${analytics.failedCampaigns.length} campaign(s) failed in the last 7 days`;
        banner.classList.remove('hidden');
      } else if (banner) {
        banner.classList.add('hidden');
      }

      // Top commands widget
      const cmdWidget = document.getElementById('top-commands-widget');
      if (cmdWidget && analytics?.topCommands?.length) {
        const max = analytics.topCommands[0]?.count || 1;
        cmdWidget.innerHTML = analytics.topCommands.map(c => `
          <div class="flex items-center gap-3 mb-2">
            <span class="text-xs font-mono font-semibold text-gray-700 w-24 shrink-0">!${escHtml(c.name)}</span>
            <div class="flex-grow bg-gray-100 rounded-full h-1.5">
              <div class="bg-indigo-500 h-1.5 rounded-full" style="width:${Math.round((c.count/max)*100)}%"></div>
            </div>
            <span class="text-xs text-gray-500 w-8 text-right shrink-0">${c.count}</span>
          </div>`).join('');
      } else if (cmdWidget) {
        cmdWidget.innerHTML = '<p class="text-xs text-gray-400">No commands used yet</p>';
      }

      // Recent audit widget
      const auditWidget = document.getElementById('recent-audit-widget');
      if (auditWidget && analytics?.recentAudit?.length) {
        auditWidget.innerHTML = analytics.recentAudit.map(a => `
          <div class="flex items-center gap-2 mb-2 text-xs">
            <span class="text-gray-400 shrink-0">${fmtDate(a.timestamp)}</span>
            <span class="font-semibold text-gray-700">${escHtml(a.username || '?')}</span>
            <span class="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">${escHtml(a.action)}</span>
          </div>`).join('');
      } else if (auditWidget) {
        auditWidget.innerHTML = '<p class="text-xs text-gray-400">No recent activity</p>';
      }

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
          <div class="flex items-center gap-1 flex-wrap">
            <button onclick="viewCampaign('${c._id}')" title="View"
              class="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors text-sm">
              <i class="fas fa-eye"></i>
            </button>
            <button onclick="viewDeliveryReport('${c._id}')" title="Delivery Report"
              class="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors text-sm">
              <i class="fas fa-chart-bar"></i>
            </button>
            ${c.status === 'sending' || c.status === 'scheduled' ? `
            <button onclick="pauseCampaign('${c._id}')" title="Pause"
              class="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors text-sm">
              <i class="fas fa-pause"></i>
            </button>` : ''}
            ${c.status === 'paused' ? `
            <button onclick="resumeCampaign('${c._id}')" title="Resume"
              class="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors text-sm">
              <i class="fas fa-play"></i>
            </button>` : ''}
            ${['sending','scheduled','paused'].includes(c.status) ? `
            <button onclick="cancelCampaign('${c._id}')" title="Cancel"
              class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm">
              <i class="fas fa-ban"></i>
            </button>` : ''}
            ${['sent','failed','cancelled'].includes(c.status) ? `
            <button onclick="archiveCampaign('${c._id}')" title="Archive"
              class="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm">
              <i class="fas fa-archive"></i>
            </button>` : ''}
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
      const deliveryData = report?.deliveryReport || report || [];
      if (!deliveryData.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-5 py-8 text-center text-sm text-gray-400">No delivery data yet</td></tr>`;
      } else {
        const statusColors = { sent: 'bg-green-100 text-green-700', failed: 'bg-red-100 text-red-600', skipped: 'bg-gray-100 text-gray-500' };
        deliveryData.forEach(r => {
          const tr = document.createElement('tr');
          tr.className = 'trow';
          tr.dataset.status = r.status;
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
        // Delivery summary
        const total = deliveryData.length, sent = deliveryData.filter(r => r.status === 'sent').length;
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
        SHERPA_ONNX_ASR_ENCODER_PATH: 'Sherpa ASR encoder',
        SHERPA_ONNX_ASR_DECODER_PATH: 'Sherpa ASR decoder',
        SHERPA_ONNX_TTS_MODEL_PATH:   'Sherpa TTS model',
        SHERPA_ONNX_TTS_TOKENS_PATH:  'Sherpa TTS tokens',
        SHERPA_ONNX_TTS_LEXICON_PATH: 'Sherpa TTS lexicon',
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
    const keyIds = ['GEMINI_API_KEY', 'CHAT_GPT_API_KEY', 'OPENWEATHERMAP_API_KEY', 'SHERPA_ONNX_ASR_ENCODER_PATH', 'SHERPA_ONNX_ASR_DECODER_PATH', 'SHERPA_ONNX_TTS_MODEL_PATH', 'SHERPA_ONNX_TTS_TOKENS_PATH', 'SHERPA_ONNX_TTS_LEXICON_PATH'];
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

  // ─── Shared helpers ───────────────────────────────────────
  function avatarColor(str) {
    const colors = ['#128C7E','#25D366','#075E54','#34B7F1','#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#ef4444'];
    let h = 0; for (let i = 0; i < (str||'').length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
    return colors[h % colors.length];
  }
  function avatarInitials(name) {
    const parts = (name || '?').split(' ').filter(Boolean);
    return parts.length >= 2 ? (parts[0][0]+parts[1][0]).toUpperCase() : (name||'?').slice(0,2).toUpperCase();
  }
  function fmtMsgTime(ts) {
    if (!ts) return '';
    const d = new Date(ts); const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    return isToday
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  function buildBubble(m) {
    const isOut = m.direction === 'out';
    const rowCls = isOut ? 'msg-row-out' : 'msg-row-in';
    const bubbleCls = isOut ? 'msg-bubble msg-bubble-out' : 'msg-bubble msg-bubble-in';
    const timeColor = isOut ? '#5a7a5c' : '#999';
    return `<div class="${rowCls}">
      <div class="${bubbleCls}">
        ${escHtml(m.body)}
        <div class="msg-time" style="color:${timeColor}">${fmtMsgTime(m.timestamp)}</div>
      </div>
    </div>`;
  }
  function buildDateSeparator(label) {
    return `<div class="date-sep"><span>${escHtml(label)}</span></div>`;
  }
  function renderMsgList(msgs, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    if (!msgs || !msgs.length) {
      el.innerHTML = '<p class="text-center text-xs text-gray-400 mt-10">No messages yet</p>';
      return;
    }
    let lastDate = '';
    msgs.forEach(m => {
      const d = new Date(m.timestamp);
      const dateStr = d.toLocaleDateString([], { weekday:'long', month:'short', day:'numeric' });
      if (dateStr !== lastDate) {
        el.insertAdjacentHTML('beforeend', buildDateSeparator(dateStr));
        lastDate = dateStr;
      }
      el.insertAdjacentHTML('beforeend', buildBubble(m));
    });
    el.scrollTop = el.scrollHeight;
  }
  function appendBubble(m, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.insertAdjacentHTML('beforeend', buildBubble(m));
    el.scrollTop = el.scrollHeight;
  }

  // ─── Chats (merged inbox + archive) ──────────────────────
  let chatsSearchTimer = null;
  let chatsSearchMode = false; // false = live inbox, true = search results

  async function loadChats() {
    setChatsMode(false, '');
    try {
      inboxConversations = await apiFetch('/crm/inbox');
      renderChatList(inboxConversations, false);
      updateChatsBadge();
      startInboxStream();
    } catch {
      showToast('Failed to load chats', 'error');
    }
  }

  window.handleChatsSearch = function (q) {
    const clearBtn = document.getElementById('chats-search-clear');
    if (clearBtn) clearBtn.classList.toggle('hidden', !q);
    clearTimeout(chatsSearchTimer);
    if (!q) { loadChats(); return; }
    chatsSearchTimer = setTimeout(async () => {
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
    chatsSearchMode = isSearch;
    const label = document.getElementById('chats-mode-label');
    if (!label) return;
    label.textContent = isSearch ? (q ? `"${q}"` : 'Search') : '';
  }

  function renderChatList(list, isSearchMode) {
    const el = document.getElementById('chats-list');
    if (!el) return;
    if (!list.length) {
      el.innerHTML = `<p class="text-xs text-gray-400 text-center pt-10 px-4">${isSearchMode ? 'No results found' : 'No conversations yet'}</p>`;
      return;
    }
    el.innerHTML = '';
    list.forEach(item => {
      // Search results have .messages; inbox items have .unread
      const phone    = item.phoneNumber;
      const contact  = item.contact;
      const name     = contact?.name || contact?.pushName || phone;
      const color    = avatarColor(name);
      const initials = avatarInitials(name);
      const preview  = item.lastMessage || (item.messages?.[item.messages.length - 1]?.body) || '—';
      const ts       = item.lastTimestamp || item.messages?.[item.messages.length - 1]?.timestamp;
      const isActive = phone === currentInboxPhone;

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
    currentInboxPhone = phone;
    setChatHeader(phone, contact?.name || contact?.pushName || phone);
    document.querySelectorAll('#chats-list .conv-item').forEach(d =>
      d.classList.toggle('active', d.dataset.phone === phone));
    try {
      const { messages } = await apiFetch(`/crm/inbox/${encodeURIComponent(phone)}`);
      renderMsgList(messages, 'chat-messages');
      inboxConversations = inboxConversations.map(c => c.phoneNumber === phone ? { ...c, unread: 0 } : c);
      updateChatsBadge();
      document.querySelectorAll('#chats-list .conv-item').forEach(d => {
        if (d.dataset.phone === phone) d.querySelector('.unread-dot')?.remove();
      });
    } catch {
      showToast('Failed to load messages', 'error');
    }
  };

  function openSearchThread(thread) {
    currentInboxPhone = thread.phoneNumber;
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
    const input = document.getElementById('reply-input');
    const message = input?.value.trim();
    if (!message || !currentInboxPhone) return;
    input.value = '';
    input.style.height = 'auto';
    try {
      const msg = await apiFetch(`/crm/inbox/${encodeURIComponent(currentInboxPhone)}/reply`, 'POST', { message });
      appendBubble(msg, 'chat-messages');
      // Update preview in list
      const conv = inboxConversations.find(c => c.phoneNumber === currentInboxPhone);
      if (conv) { conv.lastMessage = msg.body; conv.lastTimestamp = msg.timestamp; }
      if (!chatsSearchMode) renderChatList(inboxConversations, false);
    } catch {
      showToast('Failed to send reply', 'error');
    }
  };

  function startInboxStream() {
    if (inboxEventSource) return;
    const token = localStorage.getItem('token');
    inboxEventSource = new EventSource(`/crm/inbox/stream?token=${encodeURIComponent(token)}`);
    inboxEventSource.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        const existing = inboxConversations.find(c => c.phoneNumber === msg.phoneNumber);
        if (existing) {
          existing.lastMessage = msg.body;
          existing.lastTimestamp = msg.timestamp;
          if (msg.direction === 'in' && msg.phoneNumber !== currentInboxPhone)
            existing.unread = (existing.unread || 0) + 1;
        } else if (msg.direction === 'in') {
          inboxConversations.unshift({ phoneNumber: msg.phoneNumber, lastMessage: msg.body, lastTimestamp: msg.timestamp, unread: 1, contact: null });
        }
        if (!chatsSearchMode) renderChatList(inboxConversations, false);
        updateChatsBadge();
        if (msg.phoneNumber === currentInboxPhone) appendBubble(msg, 'chat-messages');
      } catch (_) {}
    };
  }

  function stopInboxStream() {
    if (inboxEventSource) { inboxEventSource.close(); inboxEventSource = null; }
  }

  function updateChatsBadge() {
    const total = inboxConversations.reduce((s, c) => s + (c.unread || 0), 0);
    const badge = document.getElementById('chats-badge');
    if (!badge) return;
    if (total > 0) { badge.textContent = total; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  }

  // ─── Scheduled Messages ───────────────────────────────────
  async function loadScheduledMessages() {
    try {
      const msgs = await apiFetch('/crm/scheduled-messages');
      renderScheduledMessages(msgs);
    } catch {
      showToast('Failed to load scheduled messages', 'error');
    }
  }

  function renderScheduledMessages(msgs) {
    const tbody = document.getElementById('scheduled-messages-body');
    const empty = document.getElementById('scheduled-messages-empty');
    if (!tbody) return;
    if (!msgs.length) {
      tbody.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');
    const statusBadge = s => ({
      pending: '<span class="badge badge-scheduled">Pending</span>',
      sent:    '<span class="badge badge-sent">Sent</span>',
      failed:  '<span class="badge badge-failed">Failed</span>',
      cancelled: '<span class="badge badge-draft">Cancelled</span>'
    }[s] || s);
    tbody.innerHTML = msgs.map(m => `
      <tr class="trow border-b border-gray-100">
        <td class="px-5 py-3 text-sm">
          <div class="font-medium text-gray-800">${escHtml(m.contactName || m.phoneNumber)}</div>
          ${m.contactName ? `<div class="text-xs text-gray-400">${escHtml(m.phoneNumber)}</div>` : ''}
        </td>
        <td class="px-5 py-3 text-sm text-gray-600 max-w-xs truncate">${escHtml(m.message)}</td>
        <td class="px-5 py-3 text-sm text-gray-700">${fmtDate(m.scheduledAt)}</td>
        <td class="px-5 py-3">${statusBadge(m.status)}</td>
        <td class="px-5 py-3">
          ${m.status === 'pending' ? `<button onclick="deleteScheduledMessage('${m._id}')" class="text-xs text-red-500 hover:text-red-700 font-semibold"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      </tr>`).join('');
  }

  window.openScheduledModal = function () {
    document.getElementById('sched-phone').value = '';
    document.getElementById('sched-message').value = '';
    document.getElementById('sched-at').value = '';
    document.getElementById('sched-contact-name').classList.add('hidden');
    document.getElementById('scheduled-modal').classList.remove('hidden');
  };

  window.openScheduledContactPicker = function () {
    // Reuse the contact list — prompt for phone from contacts
    const phone = prompt('Enter phone number or leave blank to pick from contacts:');
    if (phone) {
      document.getElementById('sched-phone').value = phone.replace(/\D/g, '');
    }
  };

  window.saveScheduledMessage = async function () {
    const phoneNumber = document.getElementById('sched-phone').value.trim().replace(/\D/g, '');
    const message    = document.getElementById('sched-message').value.trim();
    const scheduledAt = document.getElementById('sched-at').value;
    if (!phoneNumber) return showToast('Phone number is required', 'error');
    if (!message)     return showToast('Message is required', 'error');
    if (!scheduledAt) return showToast('Scheduled time is required', 'error');
    if (new Date(scheduledAt) <= new Date()) return showToast('Scheduled time must be in the future', 'error');
    try {
      await apiFetch('/crm/scheduled-messages', 'POST', { phoneNumber, message, scheduledAt });
      document.getElementById('scheduled-modal').classList.add('hidden');
      showToast('Message scheduled', 'success');
      loadScheduledMessages();
    } catch {
      showToast('Failed to schedule message', 'error');
    }
  };

  window.deleteScheduledMessage = async function (id) {
    if (!confirm('Cancel this scheduled message?')) return;
    try {
      await apiFetch(`/crm/scheduled-messages/${id}`, 'DELETE');
      showToast('Scheduled message cancelled', 'success');
      loadScheduledMessages();
    } catch {
      showToast('Failed to cancel message', 'error');
    }
  };

  // ─── Contact Scoring ──────────────────────────────────────
  async function loadScoring() {
    try {
      const [rules, leaderboard] = await Promise.all([
        apiFetch('/crm/scoring/rules'),
        apiFetch('/crm/contacts/leaderboard?limit=10'),
      ]);
      scoreRules = rules;
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
    const actions = ['first_interaction','message_received','command_used','campaign_reply'];
    const usedActions = scoreRules.map(r => r.action);
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

  // ─── Campaign Extras ──────────────────────────────────────
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

  // ─── Template Extras ──────────────────────────────────────
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
    try {
      const revisions = await apiFetch(`/crm/templates/${id}/revisions`);
      document.getElementById('revision-template-name').textContent = name || id;
      currentTemplateId = id;
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
    const t = templates.find(x => x._id === id);
    if (!t) return;
    currentTemplateId = id;
    document.getElementById('preview-sample-name').value  = '';
    document.getElementById('preview-sample-phone').value = '';
    document.getElementById('preview-sample-date').value  = new Date().toLocaleDateString();
    updateTemplatePreview();
    document.getElementById('template-preview-modal').classList.remove('hidden');
  };

  window.updateTemplatePreview = function () {
    const t = templates.find(x => x._id === currentTemplateId);
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

  // ─── Integrations ─────────────────────────────────────────────────────────
  async function loadIntegrations() {
    try {
      [integrations, availableEvents] = await Promise.all([
        apiFetch('/crm/integrations'),
        apiFetch('/crm/integrations/events')
      ]);
      renderIntegrationsTab();
      loadInboundApiKey();
    } catch (e) {
      showToast('Failed to load integrations', 'error');
    }
  }

  window.switchIntegrationTab = function(tab) {
    currentIntegrationTab = tab;
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
    const webhookRows = integrations.filter(i => i.type === 'webhook');
    const notifRows   = integrations.filter(i => i.type === 'slack' || i.type === 'discord');
    const emailRows   = integrations.filter(i => i.type === 'email');
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

  window.openIntegrationModal = async function(id, forceType) {
    currentIntegrationId = id;
    const existing = id ? integrations.find(i => i._id === id) : null;
    const type = forceType || existing?.type || 'webhook';
    document.getElementById('integration-modal-title').textContent = id ? 'Edit Integration' : `Add ${type.charAt(0).toUpperCase() + type.slice(1)}`;

    document.getElementById('int-name').value    = existing?.name   || '';
    document.getElementById('int-url').value     = existing?.url    || '';
    document.getElementById('int-secret').value  = existing?.secret || '';
    document.getElementById('int-secret-wrap').classList.toggle('hidden', type !== 'webhook');

    // Adapt URL label for email type
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

    // Render event checkboxes
    const list = document.getElementById('int-events-list');
    list.innerHTML = availableEvents.map(ev => `
      <label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input type="checkbox" value="${ev}" class="accent-indigo-600" ${(existing?.events || []).includes(ev) ? 'checked' : ''}>
        <span class="font-mono text-xs">${ev}</span>
      </label>`).join('');

    document.getElementById('integration-modal').classList.remove('hidden');
  };

  window.saveIntegration = async function() {
    const name    = document.getElementById('int-name').value.trim();
    const url     = document.getElementById('int-url').value.trim();
    const secret  = document.getElementById('int-secret').value.trim();
    const enabled = document.getElementById('int-enabled-toggle').classList.contains('on');
    const type    = document.getElementById('int-enabled-toggle').dataset.type || 'webhook';
    const events  = [...document.querySelectorAll('#int-events-list input:checked')].map(c => c.value);

    if (!name || !url) return showToast('Name and URL are required', 'error');
    try {
      if (currentIntegrationId) {
        await apiFetch(`/crm/integrations/${currentIntegrationId}`, 'PUT', { name, type, url, events, secret, enabled });
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

  window.deleteIntegration = async function(id) {
    if (!confirm('Delete this integration?')) return;
    try {
      await apiFetch(`/crm/integrations/${id}`, 'DELETE');
      await loadIntegrations();
      showToast('Integration deleted');
    } catch {
      showToast('Failed to delete', 'error');
    }
  };

  window.testIntegration = async function(id) {
    try {
      await apiFetch(`/crm/integrations/${id}/test`, 'POST');
      showToast('Test event fired — check your endpoint');
    } catch {
      showToast('Test failed', 'error');
    }
  };

  window.closeIntegrationModal = function() {
    document.getElementById('integration-modal').classList.add('hidden');
    currentIntegrationId = null;
  };

  // ── Auto-Reply ───────────────────────────────────────────────────────────
  async function loadAutoReplies() {
    try {
      autoReplies = await apiFetch('/crm/auto-reply');
      renderAutoReplies();
    } catch {
      showToast('Failed to load auto-reply rules', 'error');
    }
  }

  function renderAutoReplies() {
    const tbody = document.getElementById('autoreply-table-body');
    if (!tbody) return;
    if (!autoReplies.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-gray-400 text-sm">No rules configured</td></tr>`;
      return;
    }
    tbody.innerHTML = autoReplies.map(r => {
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

  window.openAutoReplyModal = function(id) {
    currentAutoReplyId = id;
    const existing = id ? autoReplies.find(r => r._id === id) : null;
    document.getElementById('autoreply-modal-title').textContent = id ? 'Edit Auto-Reply Rule' : 'Add Auto-Reply Rule';

    document.getElementById('ar-name').value      = existing?.name     || '';
    document.getElementById('ar-trigger').value   = existing?.trigger  || '';
    document.getElementById('ar-matchtype').value = existing?.matchType || 'contains';
    document.getElementById('ar-priority').value  = existing?.priority ?? 0;
    document.getElementById('ar-response').value  = existing?.response  || '';
    document.getElementById('ar-cooldown').value  = existing?.cooldownMinutes ?? 60;
    document.getElementById('ar-aiprovider').value = existing?.aiProvider || 'gemini';
    document.getElementById('ar-aiprompt').value  = existing?.aiPrompt  || '';
    document.getElementById('ar-useai').checked   = existing?.useAI || false;

    const enabledToggle = document.getElementById('ar-enabled-toggle');
    enabledToggle.classList.toggle('on', existing?.enabled !== false);

    const useAI = existing?.useAI || false;
    document.getElementById('ar-static-wrap').classList.toggle('hidden', useAI);
    document.getElementById('ar-ai-wrap').classList.toggle('hidden', !useAI);

    document.getElementById('autoreply-modal').classList.remove('hidden');
  };

  window.saveAutoReply = async function() {
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
      if (currentAutoReplyId) {
        await apiFetch(`/crm/auto-reply/${currentAutoReplyId}`, 'PUT', payload);
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

  window.deleteAutoReply = async function(id) {
    if (!confirm('Delete this auto-reply rule?')) return;
    try {
      await apiFetch(`/crm/auto-reply/${id}`, 'DELETE');
      await loadAutoReplies();
      showToast('Rule deleted');
    } catch {
      showToast('Failed to delete', 'error');
    }
  };

  window.closeAutoReplyModal = function() {
    document.getElementById('autoreply-modal').classList.add('hidden');
    currentAutoReplyId = null;
  };

  // ── Email table ───────────────────────────────────────────────────────────
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

  // ── SMTP Settings ─────────────────────────────────────────────────────────
  async function loadSmtpSettings() {
    try {
      const smtp = await apiFetch('/crm/integrations/smtp');
      document.getElementById('smtp-host').value       = smtp.host       || '';
      document.getElementById('smtp-port').value       = smtp.port       || 587;
      document.getElementById('smtp-user').value       = smtp.user       || '';
      document.getElementById('smtp-pass').value       = smtp.pass       || '';
      document.getElementById('smtp-from-name').value  = smtp.fromName   || '';
      document.getElementById('smtp-from-email').value = smtp.fromEmail  || '';
      document.getElementById('smtp-secure').checked   = smtp.secure     || false;
    } catch { /* silent */ }
  }

  window.saveSmtp = async function() {
    const payload = {
      host:      document.getElementById('smtp-host').value.trim(),
      port:      parseInt(document.getElementById('smtp-port').value) || 587,
      secure:    document.getElementById('smtp-secure').checked,
      user:      document.getElementById('smtp-user').value.trim(),
      pass:      document.getElementById('smtp-pass').value,
      fromName:  document.getElementById('smtp-from-name').value.trim(),
      fromEmail: document.getElementById('smtp-from-email').value.trim()
    };
    try {
      await apiFetch('/crm/integrations/smtp', 'PUT', payload);
      showToast('SMTP settings saved');
    } catch {
      showToast('Failed to save SMTP settings', 'error');
    }
  };

  window.testSmtp = async function() {
    try {
      const res = await apiFetch('/crm/integrations/smtp/test', 'POST');
      showToast(res.message || 'Connection successful', 'success');
    } catch (e) {
      showToast('SMTP test failed — check your credentials', 'error');
    }
  };

  // ── Inbound API ──────────────────────────────────────────────────────────
  async function loadInboundApiKey() {
    try {
      const data = await apiFetch('/crm/inbound/api-key');
      document.getElementById('inbound-api-key-input').value = data.inboundApiKey || '';
    } catch { /* silent */ }
  }

  window.rotateInboundKey = async function() {
    if (!confirm('Rotate the inbound API key? The old key will stop working immediately.')) return;
    try {
      const data = await apiFetch('/crm/inbound/api-key/rotate', 'POST');
      document.getElementById('inbound-api-key-input').value = data.inboundApiKey;
      showToast('API key rotated — copy and store it safely');
    } catch {
      showToast('Failed to rotate key', 'error');
    }
  };

  window.copyInboundKey = function() {
    const val = document.getElementById('inbound-api-key-input').value;
    if (!val) return showToast('No key to copy', 'error');
    navigator.clipboard.writeText(val).then(() => showToast('Key copied to clipboard'));
  };

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
