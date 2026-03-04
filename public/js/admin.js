document.addEventListener('DOMContentLoaded', function () {

  // Boot
  checkAuth();
  initSidebarToggle();
  initTabSwitching();
  initSearchHandlers();
  initFormHandlers();
  loadContacts();

  // Auth
  async function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) return redirect('/admin/login');
    try {
      const res = await apiFetch('/crm/auth/check');
      window.AdminState.currentUser = res.user;
      document.getElementById('username').textContent = res.user.username;
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

  // Sidebar Toggle
  function initSidebarToggle() {
    if (localStorage.getItem('sidebarCollapsed') === 'true') {
      document.body.classList.add('sidebar-collapsed');
    }
    document.getElementById('sidebar-toggle').addEventListener('click', () => {
      const collapsed = document.body.classList.toggle('sidebar-collapsed');
      localStorage.setItem('sidebarCollapsed', collapsed);
    });
  }

  // Tab Switching
  function initTabSwitching() {
    const tabMap = {
      'dashboard-tab':          { section: 'dashboard-section',          onLoad: loadDashboardData },
      'contacts-tab':           { section: 'contacts-section',           onLoad: () => loadContacts() },
      'analytics-tab':          { section: 'analytics-section',          onLoad: loadAnalytics },
      'campaigns-tab':          { section: 'campaigns-section',          onLoad: loadCampaigns },
      'templates-tab':          { section: 'templates-section',          onLoad: loadTemplates },
      'bot-tab':                { section: 'bot-section',                onLoad: () => { loadBotStatus(); startLogStream(); } },
      'commands-tab':           { section: 'commands-section',           onLoad: loadCommands },
      'users-tab':              { section: 'users-section',              onLoad: loadUsers },
      'audit-tab':              { section: 'audit-section',              onLoad: () => loadAuditLogs(1) },
      'settings-tab':           { section: 'settings-section',          onLoad: loadSettings },
      'chats-tab':              { section: 'chats-section',              onLoad: loadChats },
      'scoring-tab':            { section: 'scoring-section',            onLoad: loadScoring },
      'scheduled-messages-tab': { section: 'scheduled-messages-section', onLoad: loadScheduledMessages },
      'widget-tab':             { section: 'widget-section',             onLoad: loadWidgetSettings },
      'flows-tab':              { section: 'flows-section',              onLoad: loadFlows },
      'integrations-tab':       { section: 'integrations-section',       onLoad: loadIntegrations },
      'groups-tab':             { section: 'groups-section',             onLoad: loadGroups },
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
          s.style.removeProperty('display');
        });
        const sectionEl = document.getElementById(conf.section);
        sectionEl.classList.remove('hidden');
        if (conf.section === 'chats-section') sectionEl.style.display = 'flex';

        if (conf.onLoad) conf.onLoad();
      });
    });
  }

  // Search handlers
  function initSearchHandlers() {
    const AS = window.AdminState;

    document.getElementById('contact-search')?.addEventListener('input', function () {
      AS.contactsSearch = this.value;
      loadContacts(1);
    });

    document.getElementById('template-search')?.addEventListener('input', function () {
      const q = this.value.toLowerCase();
      const cat = document.getElementById('template-category-filter')?.value || '';
      const filtered = AS.templates.filter(t =>
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

});
