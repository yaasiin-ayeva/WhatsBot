document.addEventListener('DOMContentLoaded', function () {
  let currentUser = null;
  let currentPage = 'contacts';
  let contactsPage = 1;
  let contactsSearch = '';

  // Check authentication
  checkAuth();

  // Tab switching - Nouvelle version pour la sidebar
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function (e) {
      e.preventDefault();

      // Retirer la classe active de tous les onglets
      document.querySelectorAll('.nav-item').forEach(navItem => {
        navItem.classList.remove('active');
        navItem.classList.remove('bg-gray-100');
        navItem.classList.remove('text-primary');
      });

      // Ajouter la classe active à l'onglet cliqué
      this.classList.add('active');

      // Masquer toutes les sections
      document.querySelectorAll('.section-content').forEach(section => {
        section.classList.add('hidden');
      });

      // Afficher la section correspondante
      if (this.id === 'contacts-tab') {
        document.getElementById('contacts-section').classList.remove('hidden');
        currentPage = 'contacts';
        loadContacts();
      } else if (this.id === 'campaigns-tab') {
        document.getElementById('campaigns-section').classList.remove('hidden');
        currentPage = 'campaigns';
        loadCampaigns();
      } else if (this.id === 'new-campaign-tab') {
        document.getElementById('new-campaign-section').classList.remove('hidden');
        currentPage = 'new-campaign';
        loadAvailableContacts();
      }
    });
  });

  // Search contacts
  document.getElementById('contact-search')?.addEventListener('input', function () {
    contactsSearch = this.value;
    loadContacts();
  });

  // Logout
  document.getElementById('logout').addEventListener('click', function () {
    localStorage.removeItem('token');
    window.location.href = '/admin/login';
  });

  // Campaign form
  document.getElementById('campaign-form')?.addEventListener('submit', function (e) {
    e.preventDefault();
    createCampaign();
  });

  // Initial load
  if (currentPage === 'contacts') {
    document.getElementById('contacts-tab').classList.add('active');
    loadContacts();
  }

  // Functions
  async function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/admin/login';
      return;
    }

    try {
      const response = await fetch('/crm/auth/check', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Not authenticated');
      }

      const data = await response.json();
      currentUser = data.user;
      document.getElementById('username').textContent = currentUser.username;
    } catch (error) {
      localStorage.removeItem('token');
      window.location.href = '/admin/login';
    }
  }

  async function loadContacts(page = 1) {
    contactsPage = page;
    try {
      const response = await fetch(`/crm/contacts?page=${page}&limit=20&search=${encodeURIComponent(contactsSearch)}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      if (!response.ok) throw new Error('Failed to load contacts');

      const { data, meta } = await response.json();
      renderContacts(data);
      renderContactsPagination(meta);
      updateContactsPaginationInfo(meta);
    } catch (error) {
      console.error('Error loading contacts:', error);
      alert('Failed to load contacts');
    }
  }

  function renderContacts(contacts) {
    const tbody = document.getElementById('contacts-table-body');
    tbody.innerHTML = '';

    if (contacts.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="5" class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">No contacts found</td>`;
      tbody.appendChild(tr);
      return;
    }

    contacts.forEach(contact => {
      const tr = document.createElement('tr');
      tr.className = 'table-row';
      tr.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-800">${contact.phoneNumber}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-800">${contact.name || contact.pushName || '-'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${contact.language || '-'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatDate(contact.lastInteraction)}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          <button onclick="openMessageModal('${contact.phoneNumber}')" 
            class="message-btn inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors">
            <i class="fas fa-paper-plane mr-1"></i> Envoyer
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function updateContactsPaginationInfo(meta) {
    const start = (meta.page - 1) * meta.limit + 1;
    const end = Math.min(meta.page * meta.limit, meta.total);
    document.getElementById('contacts-start').textContent = start;
    document.getElementById('contacts-end').textContent = end;
    document.getElementById('contacts-total').textContent = meta.total;
  }

  function renderContactsPagination(meta) {
    const paginationDiv = document.getElementById('contacts-pagination');
    paginationDiv.innerHTML = '';

    if (meta.pages <= 1) return;

    // Previous button
    const prevButton = document.createElement('button');
    prevButton.className = 'px-3 py-1 border border-gray-300 rounded-md' +
      (meta.page === 1 ? ' opacity-50 cursor-not-allowed' : ' hover:bg-gray-50');
    prevButton.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevButton.disabled = meta.page === 1;
    prevButton.addEventListener('click', () => loadContacts(meta.page - 1));
    paginationDiv.appendChild(prevButton);

    // Page numbers
    const maxVisiblePages = 5;
    let startPage = Math.max(1, meta.page - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(meta.pages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
      const firstPageButton = document.createElement('button');
      firstPageButton.className = 'px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50';
      firstPageButton.textContent = '1';
      firstPageButton.addEventListener('click', () => loadContacts(1));
      paginationDiv.appendChild(firstPageButton);

      if (startPage > 2) {
        const ellipsis = document.createElement('span');
        ellipsis.className = 'px-2 py-1';
        ellipsis.textContent = '...';
        paginationDiv.appendChild(ellipsis);
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      const pageButton = document.createElement('button');
      pageButton.className = 'px-3 py-1 border border-gray-300 rounded-md' +
        (i === meta.page ? ' bg-gray-800 text-white' : ' hover:bg-gray-50');
      pageButton.textContent = i;
      pageButton.addEventListener('click', () => loadContacts(i));
      paginationDiv.appendChild(pageButton);
    }

    if (endPage < meta.pages) {
      if (endPage < meta.pages - 1) {
        const ellipsis = document.createElement('span');
        ellipsis.className = 'px-2 py-1';
        ellipsis.textContent = '...';
        paginationDiv.appendChild(ellipsis);
      }

      const lastPageButton = document.createElement('button');
      lastPageButton.className = 'px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50';
      lastPageButton.textContent = meta.pages;
      lastPageButton.addEventListener('click', () => loadContacts(meta.pages));
      paginationDiv.appendChild(lastPageButton);
    }

    // Next button
    const nextButton = document.createElement('button');
    nextButton.className = 'px-3 py-1 border border-gray-300 rounded-md' +
      (meta.page === meta.pages ? ' opacity-50 cursor-not-allowed' : ' hover:bg-gray-50');
    nextButton.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextButton.disabled = meta.page === meta.pages;
    nextButton.addEventListener('click', () => loadContacts(meta.page + 1));
    paginationDiv.appendChild(nextButton);
  }

  async function loadCampaigns() {
    try {
      const response = await fetch('/crm/campaigns', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      if (!response.ok) throw new Error('Failed to load campaigns');

      const campaigns = await response.json();
      renderCampaigns(campaigns);
    } catch (error) {
      console.error('Error loading campaigns:', error);
      alert('Failed to load campaigns');
    }
  }

  function renderCampaigns(campaigns) {
    const tbody = document.getElementById('campaigns-table-body');
    tbody.innerHTML = '';

    if (campaigns.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="6" class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">No campaigns found</td>`;
      tbody.appendChild(tr);
      return;
    }

    campaigns.forEach(campaign => {
      const tr = document.createElement('tr');
      tr.className = 'table-row';
      tr.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-800">${campaign.name}</td>
        <td class="px-6 py-4 whitespace-nowrap">
          <span class="badge ${campaign.status === 'sent' ? 'badge-sent' :
          campaign.status === 'scheduled' ? 'badge-scheduled' :
            campaign.status === 'failed' ? 'badge-failed' :
              'badge-draft'
        }">${campaign.status}</span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${campaign.scheduledAt ? formatDate(campaign.scheduledAt) : '-'}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${campaign.sentCount || 0}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${campaign.failedCount || 0}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          <button class="text-gray-600 hover:text-gray-900" onclick="viewCampaign('${campaign._id}')">
            <i class="fas fa-eye"></i>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function loadAvailableContacts() {
    try {
      const response = await fetch('/crm/contacts?limit=1000', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      if (!response.ok) throw new Error('Failed to load contacts');

      const { data } = await response.json();
      renderAvailableContacts(data);
    } catch (error) {
      console.error('Error loading contacts:', error);
      alert('Failed to load contacts');
    }
  }

  function renderAvailableContacts(contacts) {
    const container = document.getElementById('available-contacts');
    container.innerHTML = '';

    contacts.forEach(contact => {
      const div = document.createElement('div');
      div.className = 'flex items-center p-2 hover:bg-gray-50 rounded-lg cursor-pointer';
      div.innerHTML = `
        <input type="checkbox" id="contact-${contact.phoneNumber}" 
          class="contact-checkbox hidden" value="${contact.phoneNumber}">
        <label for="contact-${contact.phoneNumber}" 
          class="contact-label flex-grow flex items-center justify-between p-2 rounded-lg cursor-pointer">
          <span class="text-sm text-gray-800">${contact.name || contact.phoneNumber}</span>
          <span class="text-xs text-gray-500">${contact.phoneNumber}</span>
        </label>
      `;
      div.querySelector('input').addEventListener('change', function () {
        if (this.checked) {
          addContactToCampaign(contact.phoneNumber, contact.name || contact.phoneNumber);
        } else {
          removeContactFromCampaign(contact.phoneNumber);
        }
      });
      container.appendChild(div);
    });
  }

  function addContactToCampaign(phoneNumber, name) {
    const selectedContactsDiv = document.getElementById('selected-contacts');
    const noContactsMessage = document.getElementById('no-contacts-message');

    // Check if already added
    if (document.querySelector(`[data-phone="${phoneNumber}"]`)) {
      return;
    }

    const contactDiv = document.createElement('div');
    contactDiv.className = 'flex justify-between items-center p-2 hover:bg-gray-50 rounded-lg';
    contactDiv.dataset.phone = phoneNumber;
    contactDiv.innerHTML = `
      <span class="text-sm text-gray-800">${name}</span>
      <button class="text-gray-500 hover:text-gray-700" 
        onclick="removeContactFromCampaign('${phoneNumber}')">
        <i class="fas fa-times"></i>
      </button>
    `;

    if (noContactsMessage) {
      noContactsMessage.remove();
    }

    selectedContactsDiv.appendChild(contactDiv);
  }

  function removeContactFromCampaign(phoneNumber) {
    const contactDiv = document.querySelector(`[data-phone="${phoneNumber}"]`);
    if (contactDiv) {
      contactDiv.remove();
    }

    const selectedContactsDiv = document.getElementById('selected-contacts');
    if (selectedContactsDiv.children.length === 0) {
      selectedContactsDiv.innerHTML = '<p class="text-gray-400 text-sm" id="no-contacts-message">No contacts selected</p>';
    }
  }

  async function createCampaign() {
    const form = document.getElementById('campaign-form');
    const formData = new FormData(form);

    const selectedContacts = Array.from(
      document.querySelectorAll('#selected-contacts [data-phone]')
    ).map(el => el.dataset.phone);

    if (selectedContacts.length === 0) {
      alert('Please select at least one contact');
      return;
    }

    const data = {
      name: formData.get('name'),
      message: formData.get('message'),
      scheduledAt: formData.get('scheduledAt') || null,
      contacts: selectedContacts
    };

    try {
      const response = await fetch('/crm/campaigns', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) throw new Error('Failed to create campaign');

      const result = await response.json();
      alert('Campaign created successfully!');
      document.getElementById('campaigns-tab').click();
      loadCampaigns();
    } catch (error) {
      console.error('Error creating campaign:', error);
      alert('Failed to create campaign');
    }
  }

  // Helper function
  function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Global functions
  window.sendMessageTo = function (phoneNumber) {
    const message = prompt('Enter message to send:');
    if (message) {
      fetch('/crm/send-message', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ phoneNumber, message })
      })
        .then(response => {
          if (!response.ok) throw new Error('Failed to send message');
          alert('Message sent successfully!');
        })
        .catch(error => {
          console.error('Error sending message:', error);
          alert('Failed to send message');
        });
    }
  };

  window.viewCampaign = function (campaignId) {
    // Implement campaign details view
    alert('View campaign details: ' + campaignId);
  };

  window.addContactToCampaign = addContactToCampaign;
  window.removeContactFromCampaign = removeContactFromCampaign;
});