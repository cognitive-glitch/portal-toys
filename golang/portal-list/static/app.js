// Neo-Brutalist Portal List Controller

const STATE = {
  items: [],
  filter: '',
  loading: false,
  error: null,
  lastUpdated: null,
  refreshAbort: null
};

// Elements
const els = {
  list: document.getElementById('list'),
  status: document.getElementById('statusBar'),
  refreshBtn: document.getElementById('refresh'),
  search: document.getElementById('searchBox'),
  addInput: document.getElementById('portalInput'),
  addBtn: document.getElementById('portalAddBtn'),
  toastCont: document.getElementById('toastContainer')
};

// --- UTILS ---

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[c]));
}

function timeAgo(isoDate) {
  const t = Date.parse(isoDate);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}

function showToast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  els.toastCont.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// --- RENDER ---

function render() {
  // Status Bar
  if (STATE.loading) {
    els.status.textContent = 'FETCHING_DATA...';
    els.status.className = 'status-badge loading';
    els.refreshBtn.classList.add('spinning');
  } else if (STATE.error) {
    els.status.textContent = 'SYSTEM_ERROR';
    els.status.className = 'status-badge error';
    els.refreshBtn.classList.remove('spinning');
  } else {
    els.status.textContent = `SYSTEM_ONLINE // UPDATED_${new Date().toLocaleTimeString()}`;
    els.status.className = 'status-badge ready';
    els.refreshBtn.classList.remove('spinning');
  }

  // List Content
  els.list.innerHTML = '';

  // 1. Error State
  if (STATE.error) {
    els.list.innerHTML = `
      <div class="empty-state">
        <div style="color:var(--accent-error); font-size:2rem;">⚠</div>
        <p>CONNECTION FAILURE</p>
        <small>${escapeHtml(STATE.error)}</small>
      </div>
    `;
    return;
  }

  // 2. Loading State (if empty)
  if (STATE.loading && STATE.items.length === 0) {
    for (let i = 0; i < 6; i++) {
      els.list.innerHTML += `
        <article class="card skeleton">
          <header class="card-header">
            <span>UID_LOADING</span>
            <div class="card-status-dot"></div>
          </header>
          <div class="card-body">
            <div class="card-name"></div>
            <span class="card-link"></span>
          </div>
          <footer class="card-footer">Waiting for flux...</footer>
        </article>
      `;
    }
    return;
  }

  // 3. Filter & Render Items
  const q = STATE.filter.toLowerCase();
  const filtered = STATE.items.filter(it => {
    const name = (it.name || it.Name || '').toLowerCase();
    const link = (it.link || it.Link || '').toLowerCase();
    return name.includes(q) || link.includes(q);
  });

  if (filtered.length === 0) {
    els.list.innerHTML = `
      <div class="empty-state">
        <p>NO_TARGETS_FOUND</p>
        ${q ? '<small>Refine search criteria</small>' : '<small>Register a new node above</small>'}
      </div>
    `;
    return;
  }

  const frag = document.createDocumentFragment();
  filtered.forEach(it => {
    const name = it.name || it.Name || 'UNKNOWN_NODE';
    const linkRaw = it.link || it.Link || '#';
    const link = /^https?:/.test(linkRaw) ? linkRaw : ('https:' + linkRaw.replace(/^\/+/, '//'));
    const conn = (it.connected ?? it.Connected);
    const ok = !!(it.healthy ?? it.Healthy ?? conn);
    const checkedAt = it.checkedAt || it.CheckedAt || null;
    const ago = checkedAt ? timeAgo(checkedAt) : null;
    const isStale = (ago == null || ago >= 60);

    const card = document.createElement('article');
    card.className = `card ${isStale ? 'stale' : ''}`;
    card.tabIndex = 0; // Make keyboard focusable
    
    // Keyboard interaction: Enter opens link
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') window.open(link, '_blank');
    });
    // Click interaction
    card.addEventListener('click', (e) => {
      // Prevent double open if clicking the actual anchor
      if (e.target.tagName !== 'A') window.open(link, '_blank');
    });

    card.innerHTML = `
      <header class="card-header">
        <span>ID: ${escapeHtml(name.substring(0, 8))}...</span>
        <div class="card-status-dot ${ok ? 'ok' : ''}" title="${ok ? 'Healthy' : 'Unhealthy'}"></div>
      </header>
      <div class="card-body">
        <div class="card-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
        <a href="${escapeHtml(link)}" class="card-link" target="_blank">${escapeHtml(link)}</a>
      </div>
      <footer class="card-footer">
        <span>STATUS: ${ok ? 'OK' : 'ERR'}</span>
        <span class="ago-timer" data-time="${escapeHtml(checkedAt || '')}">
          ${ago !== null ? ago + 's ago' : 'PENDING'}
        </span>
      </footer>
    `;
    frag.appendChild(card);
  });
  els.list.appendChild(frag);
}

function updateTimers() {
  document.querySelectorAll('.ago-timer').forEach(el => {
    const iso = el.dataset.time;
    if (!iso) return;
    const ago = timeAgo(iso);
    el.textContent = ago !== null ? `${ago}s ago` : 'PENDING';
    
    // Update stale visual state live
    const card = el.closest('.card');
    if (card) {
      if (ago >= 60) card.classList.add('stale');
      else card.classList.remove('stale');
    }
  });
}

// --- ACTIONS ---

async function fetchData() {
  if (STATE.refreshAbort) STATE.refreshAbort.abort();
  STATE.refreshAbort = new AbortController();
  
  STATE.loading = true;
  STATE.error = null;
  render();

  try {
    const res = await fetch('/api/health', { signal: STATE.refreshAbort.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    STATE.items = Array.isArray(data) ? data : (data.data || []);
    STATE.lastUpdated = new Date();
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error(err);
    STATE.error = err.message;
    showToast('Sync Failed', 'error');
  } finally {
    STATE.loading = false;
    STATE.refreshAbort = null;
    render();
  }
}

async function registerPortal() {
  const url = els.addInput.value.trim();
  if (!url) {
    showToast('URL Required', 'error');
    return;
  }

  // Optimistic UI feedback
  els.addBtn.disabled = true;
  els.addBtn.textContent = 'SENDING...';

  try {
    const res = await fetch('/api/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(txt || `HTTP ${res.status}`);
    }

    els.addInput.value = '';
    showToast('Node Registered', 'success');
    fetchData(); // Refresh list
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    els.addBtn.disabled = false;
    els.addBtn.textContent = 'REGISTER_NODE';
  }
}

// --- EVENTS ---

els.refreshBtn.addEventListener('click', fetchData);

els.search.addEventListener('input', (e) => {
  STATE.filter = e.target.value;
  render();
});

els.addBtn.addEventListener('click', registerPortal);

els.addInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    registerPortal();
  }
});

// Init
fetchData();
setInterval(updateTimers, 1000);
setInterval(fetchData, 5000);