// Scheduled Messages

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
    pending:   '<span class="badge badge-scheduled">Pending</span>',
    sent:      '<span class="badge badge-sent">Sent</span>',
    failed:    '<span class="badge badge-failed">Failed</span>',
    cancelled: '<span class="badge badge-draft">Cancelled</span>',
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
  const phone = prompt('Enter phone number or leave blank to pick from contacts:');
  if (phone) {
    document.getElementById('sched-phone').value = phone.replace(/\D/g, '');
  }
};

window.saveScheduledMessage = async function () {
  const phoneNumber = document.getElementById('sched-phone').value.trim().replace(/\D/g, '');
  const message     = document.getElementById('sched-message').value.trim();
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
