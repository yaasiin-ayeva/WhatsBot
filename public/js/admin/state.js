// ── Shared mutable state ─────────────────────────────────────────────────────
// All admin modules read/write through this single object so state
// remains consistent across files without a bundler.
window.AdminState = {
  currentUser:              null,
  currentRecipient:         null,
  currentContactId:         null,
  currentTags:              [],
  currentTemplateId:        null,
  currentUserId:            null,
  currentDeliveryCampaignId:null,
  contactsPage:             1,
  contactsSearch:           '',
  contactViewMode:          'all',
  templates:                [],
  allContacts:              [],
  campaigns:                [],
  users:                    [],
  currentCampaignTab:       'compose',
  autoDownloadEnabled:      true,
  logEventSource:           null,
  logFilter:                'all',
  logEntries:               [],
  analyticsCharts:          {},
  auditPage:                1,
  qrInstance:               null,
  currentInboxPhone:        null,
  inboxEventSource:         null,
  scoreRules:               [],
  inboxConversations:       [],
  integrations:             [],
  autoReplies:              [],
  currentIntegrationId:     null,
  currentAutoReplyId:       null,
  currentIntegrationTab:    'webhooks',
  availableEvents:          [],
  chatsSearchTimer:         null,
  chatsSearchMode:          false,
};

// ── Central API helper ────────────────────────────────────────────────────────
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
