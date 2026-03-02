// ── Dashboard ─────────────────────────────────────────────────────────────────
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

    const banner = document.getElementById('health-banner');
    const bannerText = document.getElementById('health-banner-text');
    if (banner && analytics?.failedCampaigns?.length) {
      bannerText.textContent = `${analytics.failedCampaigns.length} campaign(s) failed in the last 7 days`;
      banner.classList.remove('hidden');
    } else if (banner) {
      banner.classList.add('hidden');
    }

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

// ── Analytics ─────────────────────────────────────────────────────────────────
async function loadAnalytics() {
  try {
    const data = await apiFetch('/crm/analytics');
    renderCharts(data);
  } catch {
    showToast('Failed to load analytics', 'error');
  }
}

function renderCharts(data) {
  const AS = window.AdminState;

  const ctxContacts = document.getElementById('contacts-chart')?.getContext('2d');
  if (ctxContacts) {
    if (AS.analyticsCharts.contacts) AS.analyticsCharts.contacts.destroy();
    AS.analyticsCharts.contacts = new Chart(ctxContacts, {
      type: 'line',
      data: {
        labels: (data.contactsOverTime || []).map(d => d.date),
        datasets: [{
          label: 'New Contacts',
          data: (data.contactsOverTime || []).map(d => d.count),
          borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,0.08)',
          tension: 0.4, fill: true, pointRadius: 3,
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  }

  const ctxLang = document.getElementById('language-chart')?.getContext('2d');
  if (ctxLang) {
    if (AS.analyticsCharts.language) AS.analyticsCharts.language.destroy();
    const dist = data.languageDistribution || { en: 0, fr: 0, other: 0 };
    AS.analyticsCharts.language = new Chart(ctxLang, {
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
    if (AS.analyticsCharts.campaigns) AS.analyticsCharts.campaigns.destroy();
    const delivery = data.campaignDelivery || [];
    AS.analyticsCharts.campaigns = new Chart(ctxCamp, {
      type: 'bar',
      data: {
        labels: delivery.map(c => c.name),
        datasets: [
          { label: 'Sent',   data: delivery.map(c => c.sentCount   || 0), backgroundColor: '#4ade80' },
          { label: 'Failed', data: delivery.map(c => c.failedCount || 0), backgroundColor: '#f87171' },
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  }
}
