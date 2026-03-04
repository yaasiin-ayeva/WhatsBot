// ═══════════════════════════════════════════════════════════════ FLOWS MODULE
// List management + full canvas-based flow builder

// ─── Constants ────────────────────────────────────────────────────────────────
const NODE_W = 210;
const NODE_COLORS = {
  trigger:      { bg: '#6366f1', light: '#eef2ff', icon: 'fa-bolt' },
  message:      { bg: '#10b981', light: '#ecfdf5', icon: 'fa-comment' },
  question:     { bg: '#3b82f6', light: '#eff6ff', icon: 'fa-question-circle' },
  condition:    { bg: '#f59e0b', light: '#fffbeb', icon: 'fa-code-branch' },
  tag:          { bg: '#8b5cf6', light: '#f5f3ff', icon: 'fa-tag' },
  delay:        { bg: '#6b7280', light: '#f9fafb', icon: 'fa-clock' },
  set_variable: { bg: '#0891b2', light: '#ecfeff', icon: 'fa-database' },
  score:        { bg: '#f97316', light: '#fff7ed', icon: 'fa-star' },
  jump:         { bg: '#ec4899', light: '#fdf2f8', icon: 'fa-share' },
  transfer:     { bg: '#0ea5e9', light: '#f0f9ff', icon: 'fa-headset' },
  end:          { bg: '#ef4444', light: '#fef2f2', icon: 'fa-flag-checkered' },
};
const NODE_LABELS = {
  trigger: 'Trigger', message: 'Send Message', question: 'Ask Question',
  condition: 'Condition', tag: 'Apply Tag', delay: 'Wait / Delay',
  set_variable: 'Set Variable', score: 'Update Score', jump: 'Jump to Flow',
  transfer: 'Transfer', end: 'End',
};
// Nodes with 2 output ports (yes/no)
const DUAL_PORT_TYPES = new Set(['condition']);
// Nodes with no output ports
const NO_OUTPUT_TYPES = new Set(['end', 'transfer', 'jump']);

// ─── Builder State ─────────────────────────────────────────────────────────
const fb = {
  flowId:      null,
  nodes:       [],
  edges:       [],
  status:      'draft',
  trigger:     { type: 'keyword', keywords: [], tagName: '' },
  pan:         { x: 0, y: 0 },
  zoom:        1,
  dirty:       false,
  selectedId:  null,
  dragging:    null,   // { nodeId, ox, oy }   — node being dragged
  panning:     null,   // { sx, sy, px, py }   — canvas pan
  connecting:  null,   // { nodeId, handle }   — drawing an edge
  tempLine:    null,   // SVG line element for temp edge
  allFlows:    [],     // for jump node dropdown
};

// ─── Flow List ─────────────────────────────────────────────────────────────
async function loadFlows() {
  try {
    const flows = await apiFetch('/crm/flows');
    fb.allFlows = flows;
    renderFlowsList(flows);
  } catch {
    showToast('Failed to load flows', 'error');
  }
}

function renderFlowsList(flows) {
  const grid  = document.getElementById('flows-grid');
  const empty = document.getElementById('flows-empty');
  if (!grid) return;
  if (!flows.length) {
    grid.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  const triggerLabel = { keyword: 'Keyword', any_message: 'Any Message', first_contact: 'First Contact', tag_applied: 'Tag Applied', campaign_reply: 'Campaign Reply' };

  grid.innerHTML = flows.map(f => {
    const statusBg  = f.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500';
    const statusTxt = f.status === 'published' ? 'Published' : 'Draft';
    const rate = f.stats.activations > 0 ? Math.round((f.stats.completions / f.stats.activations) * 100) : 0;
    return `
    <div class="card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-gray-800 text-sm truncate">${escHtml(f.name)}</div>
          ${f.description ? `<div class="text-xs text-gray-400 mt-0.5 truncate">${escHtml(f.description)}</div>` : ''}
        </div>
        <span class="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${statusBg}">${statusTxt}</span>
      </div>
      <div class="flex items-center gap-3 text-xs text-gray-500">
        <span><i class="fas fa-bolt mr-1 text-indigo-400"></i>${triggerLabel[f.trigger?.type] || 'Keyword'}</span>
        <span><i class="fas fa-sitemap mr-1 text-gray-300"></i>${f.nodes.length} nodes</span>
      </div>
      <div class="flex items-center gap-3 text-xs text-gray-500">
        <span title="Activations"><i class="fas fa-play mr-1 text-green-400"></i>${f.stats.activations}</span>
        <span title="Completions"><i class="fas fa-check mr-1 text-blue-400"></i>${f.stats.completions}</span>
        <span title="Completion rate"><i class="fas fa-percent mr-1 text-gray-300"></i>${rate}%</span>
      </div>
      <div class="flex items-center gap-2 pt-1 border-t border-gray-100">
        <button onclick="openFlowBuilder('${f._id}')" class="flex-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 py-1.5 px-3 rounded-lg hover:bg-indigo-50 transition-colors"><i class="fas fa-edit mr-1"></i> Edit</button>
        <button onclick="duplicateFlow('${f._id}')" class="text-xs text-gray-500 hover:text-gray-700 py-1.5 px-2 rounded-lg hover:bg-gray-100 transition-colors" title="Duplicate"><i class="fas fa-copy"></i></button>
        <button onclick="deleteFlow('${f._id}')" class="text-xs text-red-400 hover:text-red-600 py-1.5 px-2 rounded-lg hover:bg-red-50 transition-colors" title="Delete"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

async function newFlow() {
  try {
    const flow = await apiFetch('/crm/flows', 'POST', {
      name: 'Untitled Flow', description: '', status: 'draft',
      trigger: { type: 'keyword', keywords: [], tagName: '' },
      nodes: [], edges: [],
    });
    await openFlowBuilder(flow._id);
  } catch {
    showToast('Failed to create flow', 'error');
  }
}

async function duplicateFlow(id) {
  try {
    const src = await apiFetch(`/crm/flows/${id}`);
    await apiFetch('/crm/flows', 'POST', {
      name: `Copy of ${src.name}`, description: src.description,
      trigger: src.trigger, nodes: src.nodes, edges: src.edges, status: 'draft',
    });
    showToast('Flow duplicated', 'success');
    loadFlows();
  } catch {
    showToast('Failed to duplicate flow', 'error');
  }
}

async function deleteFlow(id) {
  if (!confirm('Delete this flow? Active sessions will be cancelled.')) return;
  try {
    await apiFetch(`/crm/flows/${id}`, 'DELETE');
    showToast('Flow deleted', 'success');
    loadFlows();
  } catch {
    showToast('Failed to delete flow', 'error');
  }
}

// ─── Builder Open / Close ───────────────────────────────────────────────────
async function openFlowBuilder(flowId) {
  try {
    const flow = await apiFetch(`/crm/flows/${flowId}`);
    fb.flowId    = flowId;
    fb.nodes     = flow.nodes   || [];
    fb.edges     = flow.edges   || [];
    fb.status    = flow.status  || 'draft';
    fb.trigger   = flow.trigger || { type: 'keyword', keywords: [], tagName: '' };
    fb.dirty     = false;
    fb.selectedId = null;

    document.getElementById('flow-name-input').value = flow.name || '';
    updateBuilderStatusBadge();

    // Load all flows for jump dropdown
    try { fb.allFlows = await apiFetch('/crm/flows'); } catch { fb.allFlows = []; }

    // Show overlay FIRST so clientWidth/Height are accurate
    document.getElementById('flow-builder-overlay').style.display = 'flex';
    document.getElementById('node-props-panel').style.display = 'none';

    // Center view on nodes now that overlay is visible
    const wrap = document.getElementById('flow-canvas-wrap');
    fb.zoom = 1;
    if (fb.nodes.length) {
      const cx = fb.nodes.reduce((s, n) => s + n.position.x, 0) / fb.nodes.length;
      const cy = fb.nodes.reduce((s, n) => s + n.position.y, 0) / fb.nodes.length;
      fb.pan.x = (wrap.clientWidth  || window.innerWidth)  / 2 - cx;
      fb.pan.y = (wrap.clientHeight || window.innerHeight) / 2 - cy;
    } else {
      fb.pan.x = ((wrap.clientWidth  || window.innerWidth)  / 2) - 100;
      fb.pan.y = ((wrap.clientHeight || window.innerHeight) / 2) - 100;
    }

    initBuilderEvents();
    renderAll();
    renderTriggerConfig();
  } catch {
    showToast('Failed to open flow', 'error');
  }
}

function exitFlowBuilder() {
  if (fb.dirty && !confirm('You have unsaved changes. Leave without saving?')) return;
  document.getElementById('flow-builder-overlay').style.display = 'none';
  cleanupBuilderEvents();
  loadFlows();
}

// ─── Save / Publish ─────────────────────────────────────────────────────────
async function saveFlow() {
  const name = document.getElementById('flow-name-input').value.trim() || 'Untitled Flow';
  try {
    await apiFetch(`/crm/flows/${fb.flowId}`, 'PUT', {
      name, description: '', trigger: fb.trigger,
      nodes: fb.nodes, edges: fb.edges, status: fb.status,
    });
    fb.dirty = false;
    document.getElementById('builder-save-indicator').classList.add('hidden');
    showToast('Flow saved', 'success');
  } catch {
    showToast('Failed to save flow', 'error');
  }
}

async function togglePublishFlow() {
  try {
    const flow = await apiFetch(`/crm/flows/${fb.flowId}/publish`, 'PATCH');
    fb.status = flow.status;
    updateBuilderStatusBadge();
    showToast(flow.status === 'published' ? 'Flow published' : 'Flow unpublished', 'success');
  } catch {
    showToast('Failed to toggle publish', 'error');
  }
}

async function testSendFlow() {
  const phone = prompt('Enter phone number to test this flow:');
  if (!phone) return;
  try {
    const r = await apiFetch(`/crm/flows/${fb.flowId}/test-send`, 'POST', { phone });
    showToast(r.message || 'Test session created', 'success');
  } catch {
    showToast('Failed to create test session', 'error');
  }
}

function updateBuilderStatusBadge() {
  const badge = document.getElementById('builder-status-badge');
  const btn   = document.getElementById('publish-btn');
  const lbl   = document.getElementById('publish-btn-label');
  if (fb.status === 'published') {
    badge.className  = 'text-xs px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-700';
    badge.textContent = 'Published';
    btn.className = btn.className.replace('bg-gray-400 hover:bg-gray-500', 'bg-red-500 hover:bg-red-600');
    btn.className = btn.className.includes('bg-red') ? btn.className : btn.className + ' bg-red-500 hover:bg-red-600';
    lbl.textContent = 'Unpublish';
  } else {
    badge.className  = 'text-xs px-2 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-500';
    badge.textContent = 'Draft';
    lbl.textContent = 'Publish';
  }
}

// ─── Node Management ────────────────────────────────────────────────────────
let _nodeIdCounter = 1;
function newNodeId() { return 'n' + Date.now() + (_nodeIdCounter++); }
function newEdgeId() { return 'e' + Date.now() + (_nodeIdCounter++); }

function addNode(type, canvasX, canvasY) {
  const defaults = {
    trigger:      { triggerType: 'keyword', keywords: '' },
    message:      { text: '' },
    question:     { text: '', variable: 'answer' },
    condition:    { variable: '', operator: 'equals', value: '' },
    tag:          { action: 'add', tag: '' },
    delay:        { minutes: 0, seconds: 5 },
    set_variable: { variable: '', value: '' },
    score:        { points: 10 },
    jump:         { flowId: '' },
    transfer:     { note: '' },
    end:          { text: '' },
  };
  const node = {
    id: newNodeId(), type,
    position: { x: Math.round(canvasX), y: Math.round(canvasY) },
    data: { ...defaults[type] },
  };
  fb.nodes.push(node);
  fb.dirty = true;
  markDirty();
  renderAll();
  selectNode(node.id);
}

function deleteNode(id) {
  fb.nodes = fb.nodes.filter(n => n.id !== id);
  fb.edges = fb.edges.filter(e => e.source !== id && e.target !== id);
  if (fb.selectedId === id) deselectNode();
  fb.dirty = true;
  markDirty();
  renderAll();
}

function addEdge(sourceId, handle, targetId) {
  // No self-loops
  if (sourceId === targetId) return;
  // No duplicate edges from same source+handle
  fb.edges = fb.edges.filter(e => !(e.source === sourceId && e.sourceHandle === handle));
  fb.edges.push({ id: newEdgeId(), source: sourceId, sourceHandle: handle, target: targetId });
  fb.dirty = true;
  markDirty();
  renderAll();
}

function markDirty() {
  document.getElementById('builder-save-indicator')?.classList.remove('hidden');
}

// ─── Rendering ──────────────────────────────────────────────────────────────
function renderAll() {
  applyCanvasTransform();
  renderNodes();
  renderEdges();
}

function applyCanvasTransform() {
  const canvas = document.getElementById('flow-canvas');
  if (canvas) canvas.style.transform = `translate(${fb.pan.x}px,${fb.pan.y}px) scale(${fb.zoom})`;
}

function getNodeHeight(type) {
  const bodyLines = { trigger: 1, message: 2, question: 2, condition: 3, tag: 2, delay: 1, set_variable: 2, score: 1, jump: 1, transfer: 1, end: 1 };
  return 38 + (bodyLines[type] || 1) * 18 + 30; // header + body + ports row
}

function getPortPositions(node) {
  // Returns output port positions in canvas space
  const h = getNodeHeight(node.type);
  const out = [];
  if (!NO_OUTPUT_TYPES.has(node.type)) {
    if (DUAL_PORT_TYPES.has(node.type)) {
      out.push({ handle: 'no',  x: node.position.x + NODE_W * 0.28, y: node.position.y + h });
      out.push({ handle: 'yes', x: node.position.x + NODE_W * 0.72, y: node.position.y + h });
    } else {
      out.push({ handle: 'out', x: node.position.x + NODE_W / 2, y: node.position.y + h });
    }
  }
  const inp = { x: node.position.x + NODE_W / 2, y: node.position.y };
  return { out, inp };
}

function renderNodes() {
  const canvas = document.getElementById('flow-canvas');
  if (!canvas) return;

  // Remove stale node elements
  const existingIds = new Set(fb.nodes.map(n => n.id));
  canvas.querySelectorAll('.flow-node').forEach(el => {
    if (!existingIds.has(el.dataset.id)) el.remove();
  });

  for (const node of fb.nodes) {
    let el = canvas.querySelector(`.flow-node[data-id="${node.id}"]`);
    const isNew = !el;
    if (isNew) {
      el = document.createElement('div');
      el.className = 'flow-node';
      el.dataset.id = node.id;
      canvas.appendChild(el);
    }

    el.style.left = node.position.x + 'px';
    el.style.top  = node.position.y + 'px';
    el.style.width = NODE_W + 'px';
    el.style.borderColor = fb.selectedId === node.id ? '#6366f1' : 'transparent';
    if (fb.selectedId === node.id) el.classList.add('selected');
    else el.classList.remove('selected');

    const cfg = NODE_COLORS[node.type] || NODE_COLORS.message;
    const lbl = NODE_LABELS[node.type] || node.type;
    const summary = getNodeSummary(node);
    const ports = getPortPositions(node);

    const outPortsHtml = ports.out.map(p =>
      `<div class="flex flex-col items-center">
         <div class="port" data-node="${node.id}" data-handle="${p.handle}" style="background:${cfg.bg};border-color:#fff;" onmousedown="portMousedown(event,'${node.id}','${p.handle}')"></div>
         ${DUAL_PORT_TYPES.has(node.type) ? `<span class="port-label">${p.handle.toUpperCase()}</span>` : ''}
       </div>`
    ).join('');

    el.innerHTML = `
      <div class="flow-node-header" style="background:${cfg.bg};" onmousedown="nodeMousedown(event,'${node.id}')">
        <i class="fas ${cfg.icon} text-xs opacity-90"></i>
        <span class="flex-1 truncate">${escHtml(lbl)}</span>
        <button onclick="deleteNode('${node.id}')" onmousedown="event.stopPropagation()" style="opacity:.7;background:none;border:none;color:#fff;cursor:pointer;padding:0 2px;font-size:10px;line-height:1;" title="Delete"><i class="fas fa-times"></i></button>
      </div>
      <div class="flow-node-body" onclick="selectNode('${node.id}')">${escHtml(summary) || '<span style="opacity:.4">Click to configure</span>'}</div>
      <div style="position:relative;height:0;">
        <div class="port port-in" data-node="${node.id}" data-handle="in" onmouseup="portMouseup(event,'${node.id}')"></div>
      </div>
      <div class="flow-node-ports">${outPortsHtml}</div>`;
  }
}

function getNodeSummary(node) {
  const d = node.data;
  switch (node.type) {
    case 'trigger':      return d.keywords ? `🔑 ${d.keywords}` : (d.triggerType || 'keyword');
    case 'message':      return (d.text || '').substring(0, 50);
    case 'question':     return (d.text || '').substring(0, 40) || `→ {{${d.variable || 'answer'}}}`;
    case 'condition':    return `{{${d.variable || '?'}}} ${d.operator || '='} "${d.value || ''}"`;
    case 'tag':          return `${d.action === 'remove' ? '−' : '+'} ${d.tag || '(tag)'}`;
    case 'delay':        return `⏱ ${d.minutes || 0}m ${d.seconds || 0}s`;
    case 'set_variable': return `{{${d.variable || '?'}}} = ${d.value || ''}`;
    case 'score':        return `${d.points >= 0 ? '+' : ''}${d.points || 0} pts`;
    case 'jump':         return d.flowId ? 'Jump to another flow' : '(no flow selected)';
    case 'transfer':     return d.note || 'Transfer to inbox';
    case 'end':          return d.text || 'End conversation';
    default:             return '';
  }
}

function renderEdges() {
  const svg = document.getElementById('flow-svg');
  if (!svg) return;

  const SVG_OFFSET = 5000; // offset because SVG starts at -5000,-5000

  // Remove stale edge paths
  const existingEdgeIds = new Set(fb.edges.map(e => e.id));
  svg.querySelectorAll('[data-edge]').forEach(el => {
    if (!existingEdgeIds.has(el.dataset.edge)) el.remove();
  });

  for (const edge of fb.edges) {
    const srcNode = fb.nodes.find(n => n.id === edge.source);
    const tgtNode = fb.nodes.find(n => n.id === edge.target);
    if (!srcNode || !tgtNode) continue;

    const srcPorts = getPortPositions(srcNode);
    const tgtPorts = getPortPositions(tgtNode);
    const src = srcPorts.out.find(p => p.handle === edge.sourceHandle) || srcPorts.out[0];
    const tgt = tgtPorts.inp;
    if (!src) continue;

    const sx = src.x + SVG_OFFSET;
    const sy = src.y + SVG_OFFSET;
    const tx = tgt.x + SVG_OFFSET;
    const ty = tgt.y + SVG_OFFSET;
    const cy1 = sy + Math.max(40, (ty - sy) * 0.5);
    const cy2 = ty - Math.max(40, (ty - sy) * 0.5);
    const d = `M ${sx} ${sy} C ${sx} ${cy1}, ${tx} ${cy2}, ${tx} ${ty}`;

    let path = svg.querySelector(`[data-edge="${edge.id}"]`);
    if (!path) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.dataset.edge = edge.id;

      // Invisible wider hit target for delete
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', '16');
      hit.setAttribute('fill', 'none');
      hit.setAttribute('cursor', 'pointer');
      hit.addEventListener('click', () => {
        fb.edges = fb.edges.filter(e => e.id !== edge.id);
        fb.dirty = true; markDirty(); renderAll();
      });
      g.appendChild(hit);

      path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('pointer-events', 'none');
      g.appendChild(path);
      svg.appendChild(g);

      // Arrow marker (reuse if exists)
      if (!document.getElementById('fb-arrow')) {
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `<marker id="fb-arrow" markerWidth="8" markerHeight="8" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#94a3b8"/></marker>`;
        svg.insertBefore(defs, svg.firstChild);
      }
      path.setAttribute('marker-end', 'url(#fb-arrow)');

      // Store reference on g for updates
      g._path = path;
      g._hit  = hit;
    } else {
      path = path._path || path;
    }

    const g = svg.querySelector(`[data-edge="${edge.id}"]`);
    if (g) {
      const visPath = g._path || g.querySelector('path:last-child');
      const hitPath = g._hit  || g.querySelector('path:first-child');
      const srcCfg  = NODE_COLORS[srcNode.type] || NODE_COLORS.message;
      if (visPath) {
        visPath.setAttribute('d', d);
        visPath.setAttribute('stroke', srcCfg.bg);
      }
      if (hitPath) hitPath.setAttribute('d', d);
    }
  }
}

// ─── Canvas Events ──────────────────────────────────────────────────────────
let _builderEventsInit = false;
let _mmHandler, _muHandler, _wHandler, _keyHandler;

function initBuilderEvents() {
  if (_builderEventsInit) return;
  _builderEventsInit = true;

  const wrap = document.getElementById('flow-canvas-wrap');

  _mmHandler = onBuilderMousemove.bind(null);
  _muHandler = onBuilderMouseup.bind(null);
  _wHandler  = onBuilderWheel.bind(null);
  _keyHandler = onBuilderKey.bind(null);

  wrap.addEventListener('mousedown', onBuilderMousedown);
  document.addEventListener('mousemove', _mmHandler);
  document.addEventListener('mouseup',   _muHandler);
  wrap.addEventListener('wheel', _wHandler, { passive: false });
  document.addEventListener('keydown', _keyHandler);
}

function cleanupBuilderEvents() {
  _builderEventsInit = false;
  const wrap = document.getElementById('flow-canvas-wrap');
  if (!wrap) return;
  wrap.removeEventListener('mousedown', onBuilderMousedown);
  document.removeEventListener('mousemove', _mmHandler);
  document.removeEventListener('mouseup',   _muHandler);
  wrap.removeEventListener('wheel', _wHandler);
  document.removeEventListener('keydown', _keyHandler);
}

function onBuilderMousedown(e) {
  // Only start panning if clicking empty canvas (not a node)
  if (e.target.closest('.flow-node') || e.target.closest('.port')) return;
  if (e.button !== 0) return;
  fb.panning = { sx: e.clientX, sy: e.clientY, px: fb.pan.x, py: fb.pan.y };
  e.currentTarget.style.cursor = 'grabbing';
}

function onBuilderMousemove(e) {
  if (fb.panning) {
    fb.pan.x = fb.panning.px + (e.clientX - fb.panning.sx);
    fb.pan.y = fb.panning.py + (e.clientY - fb.panning.sy);
    applyCanvasTransform();
    return;
  }
  if (fb.dragging) {
    const wrap = document.getElementById('flow-canvas-wrap');
    const rect = wrap.getBoundingClientRect();
    const cx = (e.clientX - rect.left - fb.pan.x) / fb.zoom;
    const cy = (e.clientY - rect.top  - fb.pan.y) / fb.zoom;
    const node = fb.nodes.find(n => n.id === fb.dragging.nodeId);
    if (node) {
      node.position.x = Math.round(cx - fb.dragging.ox);
      node.position.y = Math.round(cy - fb.dragging.oy);
      renderAll();
    }
    return;
  }
  if (fb.connecting && fb.tempLine) {
    const wrap = document.getElementById('flow-canvas-wrap');
    const rect = wrap.getBoundingClientRect();
    const tx = (e.clientX - rect.left - fb.pan.x) / fb.zoom + 5000;
    const ty = (e.clientY - rect.top  - fb.pan.y) / fb.zoom + 5000;
    fb.tempLine.setAttribute('x2', tx);
    fb.tempLine.setAttribute('y2', ty);
  }
}

function onBuilderMouseup(e) {
  if (fb.panning) {
    fb.panning = null;
    const wrap = document.getElementById('flow-canvas-wrap');
    if (wrap) wrap.style.cursor = '';
  }
  if (fb.dragging) {
    fb.dirty = true; markDirty();
    fb.dragging = null;
  }
  if (fb.connecting) {
    // If released on nothing, cancel
    fb.connecting = null;
    if (fb.tempLine) { fb.tempLine.remove(); fb.tempLine = null; }
  }
}

function onBuilderWheel(e) {
  e.preventDefault();
  const wrap = document.getElementById('flow-canvas-wrap');
  const rect = wrap.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const delta = e.deltaY > 0 ? -0.08 : 0.08;
  const newZoom = Math.min(2, Math.max(0.25, fb.zoom + delta));
  // Zoom toward cursor
  fb.pan.x = mx - (mx - fb.pan.x) * (newZoom / fb.zoom);
  fb.pan.y = my - (my - fb.pan.y) * (newZoom / fb.zoom);
  fb.zoom = newZoom;
  applyCanvasTransform();
}

function onBuilderKey(e) {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    // Only if not focused on an input
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    if (fb.selectedId) { deleteNode(fb.selectedId); }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveFlow();
  }
}

// Expose for inline event handlers
window.nodeMousedown = function(e, nodeId) {
  if (e.button !== 0) return;
  e.stopPropagation();
  const wrap = document.getElementById('flow-canvas-wrap');
  const rect = wrap.getBoundingClientRect();
  const cx = (e.clientX - rect.left - fb.pan.x) / fb.zoom;
  const cy = (e.clientY - rect.top  - fb.pan.y) / fb.zoom;
  const node = fb.nodes.find(n => n.id === nodeId);
  if (!node) return;
  fb.dragging = {
    nodeId,
    ox: cx - node.position.x,
    oy: cy - node.position.y,
  };
  selectNode(nodeId);
};

window.portMousedown = function(e, nodeId, handle) {
  e.stopPropagation();
  e.preventDefault();
  if (fb.connecting) return;
  const svg = document.getElementById('flow-svg');
  const node = fb.nodes.find(n => n.id === nodeId);
  if (!node) return;
  const ports = getPortPositions(node);
  const port  = ports.out.find(p => p.handle === handle);
  if (!port) return;

  // Create a temp SVG line
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  const sx = port.x + 5000;
  const sy = port.y + 5000;
  line.setAttribute('x1', sx); line.setAttribute('y1', sy);
  line.setAttribute('x2', sx); line.setAttribute('y2', sy);
  line.setAttribute('stroke', NODE_COLORS[node.type]?.bg || '#94a3b8');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-dasharray', '6 3');
  line.setAttribute('pointer-events', 'none');
  svg.appendChild(line);

  fb.connecting = { nodeId, handle };
  fb.tempLine   = line;
};

window.portMouseup = function(e, targetNodeId) {
  e.stopPropagation();
  if (!fb.connecting || fb.connecting.nodeId === targetNodeId) {
    fb.connecting = null;
    if (fb.tempLine) { fb.tempLine.remove(); fb.tempLine = null; }
    return;
  }
  addEdge(fb.connecting.nodeId, fb.connecting.handle, targetNodeId);
  fb.connecting = null;
  if (fb.tempLine) { fb.tempLine.remove(); fb.tempLine = null; }
};

// Palette drag-and-drop
window.palDragStart = function(e) {
  e.dataTransfer.setData('nodeType', e.currentTarget.dataset.type);
  e.dataTransfer.effectAllowed = 'copy';
};

window.canvasDragOver = function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };

window.canvasDrop = function(e) {
  e.preventDefault();
  const type = e.dataTransfer.getData('nodeType');
  if (!type) return;
  const wrap = document.getElementById('flow-canvas-wrap');
  const rect = wrap.getBoundingClientRect();
  const cx = (e.clientX - rect.left - fb.pan.x) / fb.zoom - NODE_W / 2;
  const cy = (e.clientY - rect.top  - fb.pan.y) / fb.zoom - 20;
  addNode(type, cx, cy);
};

// Zoom buttons
window.fbZoom = function(delta) {
  const wrap = document.getElementById('flow-canvas-wrap');
  const cx = wrap.clientWidth  / 2;
  const cy = wrap.clientHeight / 2;
  const newZoom = Math.min(2, Math.max(0.25, fb.zoom + delta));
  fb.pan.x = cx - (cx - fb.pan.x) * (newZoom / fb.zoom);
  fb.pan.y = cy - (cy - fb.pan.y) * (newZoom / fb.zoom);
  fb.zoom  = newZoom;
  applyCanvasTransform();
};

window.fbResetView = function() {
  const wrap = document.getElementById('flow-canvas-wrap');
  fb.zoom = 1;
  if (fb.nodes.length) {
    const cx = fb.nodes.reduce((s, n) => s + n.position.x, 0) / fb.nodes.length;
    const cy = fb.nodes.reduce((s, n) => s + n.position.y, 0) / fb.nodes.length;
    fb.pan.x = wrap.clientWidth  / 2 - cx;
    fb.pan.y = wrap.clientHeight / 2 - cy;
  } else {
    fb.pan.x = wrap.clientWidth  / 2 - 100;
    fb.pan.y = wrap.clientHeight / 2 - 100;
  }
  applyCanvasTransform();
};

// ─── Properties Panel ────────────────────────────────────────────────────────
function selectNode(id) {
  fb.selectedId = id;
  renderNodes(); // refresh selected border
  const node = fb.nodes.find(n => n.id === id);
  if (!node) return;

  const panel = document.getElementById('node-props-panel');
  panel.style.display = 'flex';

  document.getElementById('props-panel-title').textContent = NODE_LABELS[node.type] || node.type;
  renderPropsPanel(node);
}

function deselectNode() {
  fb.selectedId = null;
  renderNodes();
  document.getElementById('node-props-panel').style.display = 'none';
}

window.deleteSelectedNode = function() {
  if (fb.selectedId) deleteNode(fb.selectedId);
};

function renderPropsPanel(node) {
  const body = document.getElementById('props-panel-body');
  if (!body) return;
  body.innerHTML = '';

  const field = (label, inputHtml) => {
    const d = document.createElement('div');
    d.className = 'props-field';
    d.innerHTML = `<label>${label}</label>${inputHtml}`;
    body.appendChild(d);
    return d;
  };
  const upd = (key, el) => el.addEventListener('input', e => {
    node.data[key] = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    markDirty();
    // Update summary on node card
    const nodeEl = document.querySelector(`.flow-node[data-id="${node.id}"] .flow-node-body`);
    if (nodeEl) nodeEl.innerHTML = escHtml(getNodeSummary(node)) || '<span style="opacity:.4">Click to configure</span>';
  });

  switch (node.type) {
    case 'trigger': {
      const typeEl = field('Trigger Type',
        `<select><option value="keyword">Keyword</option><option value="any_message">Any Message</option><option value="first_contact">First Contact</option><option value="tag_applied">Tag Applied</option><option value="campaign_reply">Campaign Reply</option></select>`
      ).querySelector('select');
      typeEl.value = fb.trigger.type || 'keyword';
      typeEl.addEventListener('change', e => {
        fb.trigger.type = e.target.value;
        markDirty();
        kwWrap.style.display = e.target.value === 'keyword' ? '' : 'none';
        tagWrap.style.display = e.target.value === 'tag_applied' ? '' : 'none';
      });

      const kwWrap = field('Keywords (comma-separated)',
        `<input type="text" placeholder="hi, hello, start" value="${escHtml((fb.trigger.keywords || []).join(', '))}">`
      );
      kwWrap.style.display = fb.trigger.type === 'keyword' ? '' : 'none';
      const kwEl = kwWrap.querySelector('input');
      kwEl.addEventListener('input', e => {
        fb.trigger.keywords = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
        node.data.keywords = e.target.value;
        markDirty();
      });

      const tagWrap = field('Tag Name', `<input type="text" placeholder="vip" value="${escHtml(fb.trigger.tagName || '')}">`);
      tagWrap.style.display = fb.trigger.type === 'tag_applied' ? '' : 'none';
      const tagEl = tagWrap.querySelector('input');
      tagEl.addEventListener('input', e => { fb.trigger.tagName = e.target.value; markDirty(); });
      break;
    }
    case 'message': {
      const el = field('Message Text', `<textarea placeholder="Hello {{name|Friend}}! How can I help you?">${escHtml(node.data.text || '')}</textarea>`).querySelector('textarea');
      upd('text', el);
      field('', '<p style="font-size:10px;color:#94a3b8;margin:0">Use {{name}}, {{phone}} or {{var|fallback}}</p>');
      break;
    }
    case 'question': {
      const el1 = field('Question Text', `<textarea placeholder="What is your name?">${escHtml(node.data.text || '')}</textarea>`).querySelector('textarea');
      upd('text', el1);
      const el2 = field('Save reply as variable', `<input type="text" placeholder="answer" value="${escHtml(node.data.variable || 'answer')}">`).querySelector('input');
      upd('variable', el2);
      field('', '<p style="font-size:10px;color:#94a3b8;margin:0">Reply is stored as {{answer}} (or your variable name)</p>');
      break;
    }
    case 'condition': {
      const el1 = field('Variable to check', `<input type="text" placeholder="answer" value="${escHtml(node.data.variable || '')}">`).querySelector('input');
      upd('variable', el1);
      const el2 = field('Operator',
        `<select><option value="equals">equals</option><option value="contains">contains</option><option value="starts_with">starts with</option><option value="not_empty">is not empty</option><option value="is_empty">is empty</option></select>`
      ).querySelector('select');
      el2.value = node.data.operator || 'equals';
      upd('operator', el2);
      const el3 = field('Value', `<input type="text" placeholder="yes" value="${escHtml(node.data.value || '')}">`).querySelector('input');
      upd('value', el3);
      field('', '<p style="font-size:10px;color:#94a3b8;margin:0">Connect <strong>YES</strong> and <strong>NO</strong> output ports to branches</p>');
      break;
    }
    case 'tag': {
      const el1 = field('Action',
        `<select><option value="add">Add tag</option><option value="remove">Remove tag</option></select>`
      ).querySelector('select');
      el1.value = node.data.action || 'add';
      upd('action', el1);
      const el2 = field('Tag Name', `<input type="text" placeholder="vip" value="${escHtml(node.data.tag || '')}">`).querySelector('input');
      upd('tag', el2);
      break;
    }
    case 'delay': {
      const el1 = field('Minutes', `<input type="number" min="0" max="60" value="${node.data.minutes || 0}">`).querySelector('input');
      upd('minutes', el1);
      const el2 = field('Seconds', `<input type="number" min="0" max="59" value="${node.data.seconds || 5}">`).querySelector('input');
      upd('seconds', el2);
      field('', '<p style="font-size:10px;color:#94a3b8;margin:0">Delays &gt; 60s are paused until next message from contact</p>');
      break;
    }
    case 'set_variable': {
      const el1 = field('Variable Name', `<input type="text" placeholder="city" value="${escHtml(node.data.variable || '')}">`).querySelector('input');
      upd('variable', el1);
      const el2 = field('Value', `<input type="text" placeholder="{{answer}}" value="${escHtml(node.data.value || '')}">`).querySelector('input');
      upd('value', el2);
      break;
    }
    case 'score': {
      const el = field('Points (use − for negative)', `<input type="number" value="${node.data.points ?? 10}">`).querySelector('input');
      upd('points', el);
      break;
    }
    case 'jump': {
      const opts = fb.allFlows.filter(f => f._id !== fb.flowId).map(f =>
        `<option value="${f._id}"${node.data.flowId === f._id ? ' selected' : ''}>${escHtml(f.name)}</option>`
      ).join('');
      const el = field('Target Flow', `<select><option value="">— select —</option>${opts}</select>`).querySelector('select');
      upd('flowId', el);
      break;
    }
    case 'transfer': {
      const el = field('Transfer Note (optional)', `<input type="text" placeholder="Transferred to human support" value="${escHtml(node.data.note || '')}">`).querySelector('input');
      upd('note', el);
      field('', '<p style="font-size:10px;color:#94a3b8;margin:0">Adds tag <strong>transfer-requested</strong> to contact</p>');
      break;
    }
    case 'end': {
      const el = field('Closing Message (optional)', `<textarea placeholder="Thank you! Have a great day.">${escHtml(node.data.text || '')}</textarea>`).querySelector('textarea');
      upd('text', el);
      break;
    }
  }
}

// ─── Trigger Config (in toolbar area) ────────────────────────────────────────
function renderTriggerConfig() {
  // Trigger is part of trigger-node data, handled in props panel when trigger node is selected
}

// ─── admin.js tabMap hook ────────────────────────────────────────────────────
// This file loads before admin.js, so we expose the loader function
window.loadFlows = loadFlows;
window.newFlow   = newFlow;
window.openFlowBuilder   = openFlowBuilder;
window.exitFlowBuilder   = exitFlowBuilder;
window.saveFlow          = saveFlow;
window.togglePublishFlow = togglePublishFlow;
window.testSendFlow      = testSendFlow;
window.duplicateFlow     = duplicateFlow;
window.deleteFlow        = deleteFlow;
window.selectNode        = selectNode;
window.deselectNode      = deselectNode;
