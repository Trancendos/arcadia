/**
 * Arcadian Exchange — Admin Dashboard JavaScript
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

const API = window.location.origin + '/api/v1/admin';

// ── Navigation ────────────────────────────────────────────────────────

document.querySelectorAll('.nav-item[data-page]').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    item.classList.add('active');
    const page = document.getElementById('page-' + item.dataset.page);
    if (page) page.classList.add('active');
    loadPageData(item.dataset.page);
  });
});

function loadPageData(page) {
  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'keys': loadKeys(); break;
    case 'apikeys': loadAPIKeys(); break;
    case 'links': loadLinks(); break;
    case 'services': loadServices(); break;
    case 'nanoservices': loadNanoservices(); break;
    case 'futureproof': loadFutureProof(); break;
    case 'config': loadConfig(); break;
    case 'audit': loadAudit(); break;
  }
}

// ── API Helpers ────────────────────────────────────────────────────────

async function api(path, opts = {}) {
  try {
    const res = await fetch(API + path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (err) {
    toast(err.message, 'error');
    throw err;
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────

async function loadDashboard() {
  try {
    const data = await api('/dashboard');
    const s = data.data;
    document.getElementById('dashboard-stats').innerHTML = `
      <div class="stat-card accent">
        <div class="stat-label">Stored Keys</div>
        <div class="stat-value">${s.admin.activeStoredKeys}</div>
        <div class="stat-meta">${s.admin.totalStoredKeys} total · ${s.admin.expiredKeys} expired</div>
      </div>
      <div class="stat-card success">
        <div class="stat-label">API Keys</div>
        <div class="stat-value">${s.admin.activeAPIKeys}</div>
        <div class="stat-meta">${s.admin.totalAPIKeys} total</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-label">Service Links</div>
        <div class="stat-value">${s.admin.activeServiceLinks}</div>
        <div class="stat-meta">${s.admin.totalServiceLinks} total</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Encryption</div>
        <div class="stat-value" style="font-size:1rem">${s.admin.encryptionAlgorithm}</div>
        <div class="stat-meta">${s.admin.keyDerivation} · ${s.admin.integrityChain}</div>
      </div>
      <div class="stat-card success">
        <div class="stat-label">Cache Hit Rate</div>
        <div class="stat-value">${s.smart?.cache?.hitRate ?? 0}%</div>
        <div class="stat-meta">${s.smart?.cache?.entries ?? 0} entries · ${s.smart?.cache?.sizeMB ?? 0}MB</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Future-Proof Score</div>
        <div class="stat-value">${s.smart?.futureProof?.readinessScore ?? 0}%</div>
        <div class="stat-meta">Trancendos 2060 Standard</div>
      </div>
    `;

    // Recent audit
    const audit = await api('/audit?limit=10');
    const el = document.getElementById('recent-audit');
    el.innerHTML = (audit.data || []).reverse().map(a => `
      <div class="audit-entry">
        <div class="audit-time">${new Date(a.timestamp).toLocaleString()}</div>
        <div class="audit-action">${a.action}</div>
        <div class="audit-details">${a.details}</div>
      </div>
    `).join('') || '<p style="color:var(--text-muted)">No activity yet</p>';

    // System health
    document.getElementById('system-health').innerHTML = `
      <div style="display:grid;gap:0.75rem">
        <div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)">Memory</span><span>${s.smart?.resources?.memoryMB ?? '—'}MB (${s.smart?.resources?.memoryPercent ?? '—'}%)</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)">Audit Chain</span><span class="tag">${s.admin.lastAuditHash}</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)">Configs</span><span>${s.admin.totalConfigs} entries</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)">Scaling</span><span>${s.smart?.scaling?.direction ?? 'stable'}</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)">Nanoservices</span><span>${s.smart?.nanoservices?.manifests ?? 0} manifests</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)">Uptime</span><span>${formatUptime(s.smart?.uptime ?? 0)}</span></div>
      </div>
    `;
  } catch (err) { console.error('Dashboard load failed:', err); }
}

// ── Keys ──────────────────────────────────────────────────────────────

async function loadKeys() {
  const data = await api('/keys');
  document.getElementById('keys-table').innerHTML = (data.data || []).map(k => `
    <tr>
      <td style="font-weight:600">${esc(k.name)}</td>
      <td><span class="tag">${esc(k.service)}</span></td>
      <td>${esc(k.keyType)}</td>
      <td><span class="status ${k.status}">${k.status}</span></td>
      <td><code style="color:var(--text-muted);font-size:0.75rem">${k.fingerprint}</code></td>
      <td style="color:var(--text-muted);font-size:0.8rem">${new Date(k.createdAt).toLocaleDateString()}</td>
      <td>
        <button class="btn btn-sm" onclick="retrieveKey('${k.id}')" title="Decrypt & View">👁</button>
        <button class="btn btn-sm btn-warning" onclick="promptRotateKey('${k.id}')" title="Rotate">🔄</button>
        <button class="btn btn-sm btn-danger" onclick="revokeKey('${k.id}')" title="Revoke">✕</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">No keys stored yet. Click "+ Store Key" to add one.</td></tr>';
}

async function storeKey() {
  const body = {
    name: v('sk-name'), service: v('sk-service'), keyType: v('sk-type'),
    value: v('sk-value'), description: v('sk-desc'),
    expiresAt: v('sk-expires') ? new Date(v('sk-expires')).toISOString() : undefined,
  };
  if (!body.name || !body.service || !body.value) return toast('Name, service and value required', 'error');
  await api('/keys', { method: 'POST', body });
  hideModal('store-key-modal');
  toast('Key encrypted and stored securely', 'success');
  clearForm('sk-name', 'sk-service', 'sk-value', 'sk-desc', 'sk-expires');
  loadKeys();
}

async function retrieveKey(id) {
  if (!confirm('Decrypt and display this key? This action is audited.')) return;
  const data = await api(`/keys/${id}/decrypt`, { method: 'POST', body: { performedBy: 'admin' } });
  const modal = document.getElementById('generate-secret-modal');
  document.querySelector('#generate-secret-modal .modal-header h3').textContent = 'Decrypted Key Value';
  document.getElementById('gs-output').textContent = data.data;
  showModal('generate-secret-modal');
}

async function revokeKey(id) {
  if (!confirm('Revoke this key? It cannot be undone.')) return;
  await api(`/keys/${id}/revoke`, { method: 'POST', body: { performedBy: 'admin' } });
  toast('Key revoked', 'warning');
  loadKeys();
}

async function promptRotateKey(id) {
  const newValue = prompt('Enter new key value for rotation:');
  if (!newValue) return;
  await api(`/keys/${id}/rotate`, { method: 'POST', body: { newValue, performedBy: 'admin' } });
  toast('Key rotated — old key revoked, new key stored', 'success');
  loadKeys();
}

// ── API Keys ──────────────────────────────────────────────────────────

async function loadAPIKeys() {
  const data = await api('/apikeys');
  document.getElementById('apikeys-table').innerHTML = (data.data || []).map(k => `
    <tr>
      <td style="font-weight:600">${esc(k.name)}</td>
      <td><span class="tag">${esc(k.service)}</span></td>
      <td><code>${esc(k.keyPrefix)}…</code></td>
      <td>${(k.permissions || []).map(p => `<span class="tag" style="margin:0.1rem">${p}</span>`).join(' ')}</td>
      <td>${k.rateLimit}/min</td>
      <td><span class="status ${k.status}">${k.status}</span></td>
      <td>${k.usageCount.toLocaleString()}</td>
      <td>
        <button class="btn btn-sm btn-warning" onclick="rotateAPIKey('${k.id}')" title="Rotate">🔄</button>
        <button class="btn btn-sm btn-danger" onclick="revokeAPIKeyAction('${k.id}')" title="Revoke">✕</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">No API keys. Click "+ Generate API Key".</td></tr>';
}

async function generateAPIKey() {
  const body = {
    name: v('ak-name'), service: v('ak-service'),
    rateLimit: parseInt(v('ak-ratelimit')) || 1000,
    expiresInDays: parseInt(v('ak-expires')) || undefined,
    permissions: v('ak-perms') ? v('ak-perms').split(',').map(s => s.trim()) : ['read'],
    description: v('ak-desc'),
  };
  if (!body.name || !body.service) return toast('Name and service required', 'error');
  const data = await api('/apikeys/generate', { method: 'POST', body });
  hideModal('generate-apikey-modal');
  clearForm('ak-name', 'ak-service', 'ak-ratelimit', 'ak-expires', 'ak-perms', 'ak-desc');

  // Show result
  document.getElementById('akr-key').textContent = data.data.apiKey;
  document.getElementById('akr-id').textContent = data.data.id;
  document.getElementById('akr-prefix').textContent = data.data.keyPrefix;
  showModal('apikey-result-modal');
  loadAPIKeys();
}

async function rotateAPIKey(id) {
  if (!confirm('Rotate this API key? The old key will be revoked immediately.')) return;
  const data = await api(`/apikeys/${id}/rotate`, { method: 'POST', body: { performedBy: 'admin' } });
  document.getElementById('akr-key').textContent = data.data.newApiKey;
  document.getElementById('akr-id').textContent = data.data.newId;
  document.getElementById('akr-prefix').textContent = '';
  showModal('apikey-result-modal');
  toast('API key rotated — old key revoked', 'success');
  loadAPIKeys();
}

async function revokeAPIKeyAction(id) {
  if (!confirm('Revoke this API key?')) return;
  await api(`/apikeys/${id}/revoke`, { method: 'POST', body: { performedBy: 'admin' } });
  toast('API key revoked', 'warning');
  loadAPIKeys();
}

function copyAPIKeyResult() {
  const text = document.getElementById('akr-key').textContent;
  navigator.clipboard.writeText(text).then(() => toast('API key copied!', 'success'));
}

// ── Service Links ─────────────────────────────────────────────────────

async function loadLinks() {
  const data = await api('/links');
  document.getElementById('links-table').innerHTML = (data.data || []).map(l => `
    <tr>
      <td style="font-weight:600">${esc(l.name)}</td>
      <td><span class="tag">${esc(l.service)}</span></td>
      <td style="font-family:var(--mono);font-size:0.75rem">${esc(l.baseUrl)}</td>
      <td>${esc(l.authType)}</td>
      <td><span class="status ${l.status}">${l.status}</span></td>
      <td style="color:var(--text-muted);font-size:0.8rem">${new Date(l.createdAt).toLocaleDateString()}</td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="deleteLink('${l.id}')" title="Delete">✕</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">No service links. Click "+ Add Service".</td></tr>';
}

async function createLink() {
  const body = {
    name: v('lk-name'), service: v('lk-service'), baseUrl: v('lk-url'),
    authType: v('lk-authtype'), apiKeyHeaderName: v('lk-header') || 'Authorization',
    apiKeyValue: v('lk-apikey') || undefined, description: v('lk-desc'),
  };
  if (!body.name || !body.service || !body.baseUrl) return toast('Name, service and URL required', 'error');
  await api('/links', { method: 'POST', body });
  hideModal('create-link-modal');
  clearForm('lk-name', 'lk-service', 'lk-url', 'lk-header', 'lk-apikey', 'lk-desc');
  toast('Service link created', 'success');
  loadLinks();
}

async function deleteLink(id) {
  if (!confirm('Delete this service link?')) return;
  await api(`/links/${id}`, { method: 'DELETE' });
  toast('Service link deleted', 'warning');
  loadLinks();
}

// ── Smart Services ────────────────────────────────────────────────────

async function loadServices() {
  const data = await api('/smart/dashboard');
  const s = data.data;
  document.getElementById('services-stats').innerHTML = `
    <div class="stat-card success"><div class="stat-label">Healthy</div><div class="stat-value">${s.services.healthy}</div></div>
    <div class="stat-card warning"><div class="stat-label">Degraded</div><div class="stat-value">${s.services.degraded}</div></div>
    <div class="stat-card danger"><div class="stat-label">Unhealthy</div><div class="stat-value">${s.services.unhealthy}</div></div>
    <div class="stat-card"><div class="stat-label">Cache Hit Rate</div><div class="stat-value">${s.cache.hitRate}%</div><div class="stat-meta">${s.cache.hits} hits / ${s.cache.misses} misses</div></div>
    <div class="stat-card accent"><div class="stat-label">Health Rules</div><div class="stat-value">${s.healthRules.active}</div><div class="stat-meta">${s.healthRules.triggered} triggered</div></div>
    <div class="stat-card"><div class="stat-label">Uptime</div><div class="stat-value">${formatUptime(s.uptime)}</div></div>
  `;

  const rules = await api('/smart/health-rules');
  document.getElementById('health-rules-table').innerHTML = (rules.data || []).map(r => `
    <tr>
      <td>${esc(r.serviceName)}</td>
      <td><span class="tag">${r.metric}</span></td>
      <td>${r.operator} ${r.threshold}</td>
      <td><span class="status ${r.action === 'restart' ? 'warning' : 'active'}">${r.action}</span></td>
      <td>${r.triggerCount}</td>
      <td><span class="status ${r.isActive ? 'active' : 'revoked'}">${r.isActive ? 'Yes' : 'No'}</span></td>
    </tr>
  `).join('');
}

// ── Nanoservices ──────────────────────────────────────────────────────

async function loadNanoservices() {
  const data = await api('/smart/nanoservices');
  const colors = { lambda: 'var(--warning)', cloudflare_worker: 'var(--info)', container: 'var(--success)', wasm: 'var(--accent)', edge_function: '#a78bfa', deno_deploy: '#06b6d4' };
  document.getElementById('nano-cards').innerHTML = (data.data || []).map(n => `
    <div class="card">
      <div class="card-header">
        <h3>${esc(n.name)}</h3>
        <span class="status active" style="color:${colors[n.target] || 'var(--text-muted)'}">${n.target}</span>
      </div>
      <div class="card-body">
        <p style="color:var(--text-secondary);font-size:0.8rem;margin-bottom:1rem">${esc(n.description)}</p>
        <div style="display:grid;gap:0.5rem;font-size:0.8rem">
          <div><span style="color:var(--text-muted)">Source:</span> <code>${esc(n.sourceModule)}</code></div>
          <div><span style="color:var(--text-muted)">Entry:</span> <code>${esc(n.entryFunction)}</code></div>
          <div><span style="color:var(--text-muted)">Cold Start:</span> ${n.estimatedColdStartMs}ms</div>
          <div><span style="color:var(--text-muted)">Memory:</span> ${n.estimatedMemoryMB}MB</div>
          <div><span style="color:var(--text-muted)">Scaling:</span> ${n.scaling.minInstances}–${n.scaling.maxInstances} instances</div>
          <div><span style="color:var(--text-muted)">Triggers:</span> ${n.triggers.map(t => `<span class="tag" style="margin:0.1rem">${esc(t)}</span>`).join(' ')}</div>
        </div>
      </div>
    </div>
  `).join('');
}

// ── Future-Proof ──────────────────────────────────────────────────────

async function loadFutureProof() {
  const data = await api('/smart/tech-adapter');
  const t = data.data;
  const el = document.getElementById('futureproof-content');

  let html = `
    <div class="stats-grid" style="margin-bottom:2rem">
      <div class="stat-card accent"><div class="stat-label">Readiness Score</div><div class="stat-value">${t.readinessScore}%</div><div class="stat-meta">Trancendos 2060 Standard</div></div>
    </div>
    <div class="card"><div class="card-header"><h3>Current Technology Stack</h3></div><div class="card-body">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem">
        ${Object.entries(t.currentStack).map(([k, v]) => `
          <div style="display:flex;justify-content:space-between;padding:0.5rem;border-bottom:1px solid var(--border)">
            <span style="color:var(--text-muted);text-transform:capitalize">${k}</span>
            <span class="tag">${esc(v)}</span>
          </div>
        `).join('')}
      </div>
    </div></div>
    <div class="card"><div class="card-header"><h3>Technology Migration Path</h3></div><div class="card-body table-wrapper">
      <table>
        <thead><tr><th>Domain</th><th>Current</th><th>2030</th><th>2040</th><th>2060</th></tr></thead>
        <tbody>
          ${Object.entries(t.migrationPath).map(([domain, path]) => `
            <tr>
              <td style="font-weight:600;text-transform:capitalize">${domain}</td>
              <td><span class="tag">${esc(path.current)}</span></td>
              <td style="color:var(--info)">${esc(path.target2030)}</td>
              <td style="color:var(--warning)">${esc(path.target2040)}</td>
              <td style="color:var(--accent)">${esc(path.target2060)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div></div>
    <div class="card"><div class="card-header"><h3>Recommendations</h3></div><div class="card-body">
      ${t.recommendations.map((r, i) => `<div style="padding:0.5rem 0;border-bottom:1px solid var(--border);color:var(--text-secondary)"><span style="color:var(--accent);font-weight:600">${i + 1}.</span> ${esc(r)}</div>`).join('')}
    </div></div>
  `;
  el.innerHTML = html;
}

// ── Config ────────────────────────────────────────────────────────────

async function loadConfig() {
  const data = await api('/config');
  const configs = data.data || [];
  const categories = [...new Set(configs.map(c => c.category))];

  document.getElementById('config-tabs').innerHTML = categories.map((cat, i) =>
    `<div class="tab ${i === 0 ? 'active' : ''}" data-cat="${cat}" onclick="switchConfigTab('${cat}')">${cat}</div>`
  ).join('');

  window._configs = configs;
  if (categories.length > 0) renderConfigCategory(categories[0]);
}

function switchConfigTab(cat) {
  document.querySelectorAll('#config-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.cat === cat));
  renderConfigCategory(cat);
}

function renderConfigCategory(cat) {
  const configs = (window._configs || []).filter(c => c.category === cat);
  document.getElementById('config-content').innerHTML = `
    <div class="card"><div class="card-body">
      ${configs.map(c => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:0.6rem 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-weight:600;font-size:0.85rem">${esc(c.key)}</div>
            <div style="font-size:0.7rem;color:var(--text-muted)">Updated: ${new Date(c.updatedAt).toLocaleString()} by ${c.updatedBy}</div>
          </div>
          <div class="tag" style="font-size:0.8rem">${c.isSecret ? '••••••••' : esc(c.value)}</div>
        </div>
      `).join('')}
    </div></div>
  `;
}

// ── Audit ─────────────────────────────────────────────────────────────

async function loadAudit() {
  const filter = document.getElementById('audit-filter')?.value;
  const url = '/audit?limit=100' + (filter ? `&action=${filter}` : '');
  const data = await api(url);
  document.getElementById('audit-log').innerHTML = (data.data || []).reverse().map(a => `
    <div class="audit-entry">
      <div class="audit-time">${new Date(a.timestamp).toLocaleString()}</div>
      <div class="audit-action">${a.action}</div>
      <div class="audit-details">${esc(a.details)}</div>
    </div>
  `).join('') || '<p style="color:var(--text-muted)">No audit entries yet.</p>';
}

// ── Secret Generator ──────────────────────────────────────────────────

async function generateSecret() {
  const length = parseInt(document.getElementById('gs-length').value) || 64;
  const data = await api('/generate-secret', { method: 'POST', body: { length } });
  document.getElementById('gs-output').textContent = data.data;
  document.querySelector('#generate-secret-modal .modal-header h3').textContent = 'Generate Cryptographic Secret';
}

function copySecret() {
  const text = document.getElementById('gs-output').textContent;
  navigator.clipboard.writeText(text).then(() => toast('Copied!', 'success'));
}

// ── Utilities ─────────────────────────────────────────────────────────

function v(id) { return document.getElementById(id)?.value?.trim() || ''; }
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
function clearForm(...ids) { ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); }

function showModal(id) { document.getElementById(id)?.classList.add('show'); }
function hideModal(id) { document.getElementById(id)?.classList.remove('show'); }

function toast(message, type = 'info') {
  const container = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 4000);
}

function formatUptime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function refreshAll() { loadDashboard(); toast('Refreshed', 'info'); }

// ── Init ──────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
});
</script>