// Shared application shell: navigation, session, API client, formatting and UI helpers.
(function () {
  const ICONS = {
    calculator: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7h7M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5v3M8.5 17.5h.01M12 17.5h.01"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.2 2.5 3.5 5.2"/>',
    building: '<path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V21M15 10h3.5a1.5 1.5 0 0 1 1.5 1.5V21M2.5 21h19"/><path d="M8 8h3M8 12h3M8 16h3"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
    home: '<path d="M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1z"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5M4.5 19.5h15"/>',
    printer: '<path d="M7 9V3.5h10V9M7 17.5H5a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4.5a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="7" rx="1"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12.5A1.5 1.5 0 0 0 8 21h8a1.5 1.5 0 0 0 1.5-1.5L18.5 7M9 7V4.5h6V7"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    save: '<path d="M5 3h11l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1z"/><path d="M8 3v5h8M8 21v-7h8v7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/>',
    alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
    wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><path d="M4 7.5V18a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5z"/><circle cx="16" cy="14.5" r="1"/>',
    trend: '<path d="M3.5 17 9 11.5l4 4L20.5 8"/><path d="M15 8h5.5v5.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    upload: '<path d="M12 16V5M7 9.5l5-5 5 5M4.5 19.5h15"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l2.5 2.5M15 8l2 2"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  };

  const icon = (name, attrs = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${attrs}>${ICONS[name] || ''}</svg>`;

  const ngn = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
  const money = (value) => ngn.format(Math.max(0, Number(value) || 0));
  const signedMoney = (value) => (value < 0 ? `−${money(Math.abs(value))}` : money(value));
  const percent = (value, digits = 1) => `${(Number(value || 0) * 100).toFixed(digits)}%`;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  const currentMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const monthLabel = (value, style = 'long') => {
    if (!value) return 'No month';
    const date = new Date(`${value}-01T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-NG', { month: style, year: 'numeric' });
  };
  const monthParts = (value) => {
    const date = new Date(`${value}-01T00:00:00`);
    if (Number.isNaN(date.getTime())) return { month: '—', year: '' };
    return { month: date.toLocaleDateString('en-NG', { month: 'short' }), year: String(date.getFullYear()) };
  };
  const dateTime = (value) => (value ? new Date(value).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
  const $ = (id) => document.getElementById(id);

  // ── API client ────────────────────────────────────────────
  async function api(method, url, body) {
    let response;
    try {
      response = await fetch(url, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    } catch (error) {
      throw new Error('Cannot reach the server. Check your connection and try again.');
    }
    if (response.status === 401 && !url.startsWith('/api/login')) {
      window.location.href = `login.html?redirect=${encodeURIComponent(location.pathname.split('/').pop() || 'index.html')}`;
      throw new Error('Your session has ended.');
    }
    let data = {};
    try { data = await response.json(); } catch (error) { /* empty body */ }
    if (!response.ok || data.ok === false) {
      const error = new Error(data.message || 'The request could not be completed.');
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  // ── Toasts & confirm dialog ───────────────────────────────
  function toast(message, type = 'info') {
    let host = document.querySelector('.toasts');
    if (!host) { host = document.createElement('div'); host.className = 'toasts'; host.setAttribute('role', 'status'); document.body.appendChild(host); }
    const item = document.createElement('div');
    item.className = `toast ${type}`;
    item.innerHTML = `${icon(type === 'error' ? 'alert' : type === 'success' ? 'check' : 'info')}<span></span>`;
    item.querySelector('span').textContent = message;
    host.appendChild(item);
    setTimeout(() => { item.style.transition = 'opacity .3s'; item.style.opacity = '0'; setTimeout(() => item.remove(), 300); }, type === 'error' ? 6000 : 3600);
  }

  function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
      const dialog = document.createElement('dialog');
      dialog.className = 'modal sm';
      dialog.innerHTML = `<div class="modal-head"><h2></h2></div><div class="modal-body"><p></p></div><div class="modal-foot"><button class="btn btn-ghost" value="cancel" type="button">Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="ok" type="button"></button></div>`;
      dialog.querySelector('h2').textContent = title;
      dialog.querySelector('p').textContent = message;
      dialog.querySelector('[value="ok"]').textContent = confirmLabel;
      document.body.appendChild(dialog);
      const close = (result) => { dialog.close(); dialog.remove(); resolve(result); };
      dialog.querySelector('[value="cancel"]').addEventListener('click', () => close(false));
      dialog.querySelector('[value="ok"]').addEventListener('click', () => close(true));
      dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(false); });
      dialog.showModal();
    });
  }

  function downloadFile(filename, content, type) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type }));
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function toCsv(rows) {
    return rows.map((row) => row.map((value) => {
      let cell = String(value ?? '');
      if (/^[=+\-@\t\r]/.test(cell) && Number.isNaN(Number(cell))) cell = `'${cell}`; // spreadsheet formula injection guard
      return `"${cell.replaceAll('"', '""')}"`;
    }).join(',')).join('\r\n');
  }

  function emptyState(iconName, title, message) {
    return `<div class="empty"><div class="empty-icon">${icon(iconName)}</div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>`;
  }

  // ── Shell ─────────────────────────────────────────────────
  const NAV = [
    { href: 'index.html', key: 'calculator', label: 'PAYE calculator', icon: 'calculator' },
    { href: 'employees.html', key: 'team', label: 'Team payroll', icon: 'users' },
    { href: 'company.html', key: 'company', label: 'Company workspace', icon: 'building', permission: 'employees:read' },
    { href: 'payroll.html', key: 'payroll', label: 'Control room', icon: 'shield', permission: 'payroll:read' },
  ];

  function renderShell(user) {
    const page = document.body.dataset.page;
    const title = document.body.dataset.title || '';
    const shell = document.querySelector('.app-shell');
    const allowed = (item) => !item.permission || user.permissions.includes(item.permission);
    const sidebar = document.createElement('aside');
    sidebar.className = 'sidebar';
    sidebar.setAttribute('aria-label', 'Main navigation');
    sidebar.innerHTML = `
      <a class="sidebar-brand" href="index.html"><img src="assets/img/tax-cup-logo.svg" alt=""><span><strong>THE <em>TAX</em> CUP</strong><small>Simplifying tax &amp; compliance</small></span></a>
      <div class="nav-label">Workspace</div>
      ${NAV.filter(allowed).map((item) => `<a class="nav-link ${item.key === page ? 'active' : ''}" href="${item.href}" ${item.key === page ? 'aria-current="page"' : ''}>${icon(item.icon)}<span>${item.label}</span></a>`).join('')}
      <div class="nav-label">Resources</div>
      <a class="nav-link" href="landing.html">${icon('home')}<span>Product overview</span></a>
      <div class="sidebar-spacer"></div>
      <div class="sidebar-card"><strong>Nigeria Tax Act 2025</strong>PAYE bands effective 1 January 2026. Rent relief replaces CRA.</div>
      <div class="user-chip"><span class="avatar">${escapeHtml(initials(user.name))}</span><span class="who"><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.role)}</small></span><button class="icon-btn" id="sign-out" type="button" title="Sign out" aria-label="Sign out">${icon('logout')}</button></div>`;
    shell.prepend(sidebar);

    const topbar = document.createElement('header');
    topbar.className = 'topbar no-print';
    topbar.innerHTML = `<button class="icon-btn menu-btn" type="button" aria-label="Open navigation">${icon('menu')}</button>
      <nav class="crumbs" aria-label="Breadcrumb"><span>Workspace</span>${icon('chevron')}<strong>${escapeHtml(title)}</strong></nav>
      <div class="topbar-actions"><span class="tag"><span class="dot"></span>2026 tax rules</span></div>`;
    document.querySelector('.main').prepend(topbar);

    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    document.body.appendChild(scrim);
    topbar.querySelector('.menu-btn').addEventListener('click', () => document.body.classList.add('nav-open'));
    scrim.addEventListener('click', () => document.body.classList.remove('nav-open'));

    $('sign-out').addEventListener('click', async () => {
      try { await api('POST', '/api/logout'); } catch (error) { /* still leave */ }
      window.location.href = 'login.html';
    });
  }

  // Offers to move data that older versions stored only in this browser.
  function offerLegacyImport(user) {
    if (!user.permissions.includes('users:manage')) return;
    const read = (key) => { try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch (error) { return []; } };
    const payload = { employees: read('tax-cup-employees'), records: read('tax-cup-salary-records'), runs: read('tax-cup-payroll-runs'), archive: read('tax-cup-monthly-payrolls') };
    const total = Object.values(payload).reduce((sum, list) => sum + list.length, 0);
    if (!total || localStorage.getItem('tax-cup-import-dismissed')) return;
    const banner = document.createElement('div');
    banner.className = 'banner no-print';
    banner.innerHTML = `<span class="empty-icon" style="width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--gold-soft);color:var(--gold-text)">${icon('upload', 'width="20" height="20"')}</span><div class="grow"><strong>Data found in this browser</strong>${payload.employees.length} employees, ${payload.records.length} salary records and ${payload.runs.length + payload.archive.length} saved payrolls from the previous version. Import them so your whole team can see them.</div><button class="btn btn-ghost btn-sm" data-act="dismiss" type="button">Not now</button><button class="btn btn-primary btn-sm" data-act="import" type="button">Import data</button>`;
    document.querySelector('.content').prepend(banner);
    banner.querySelector('[data-act="dismiss"]').addEventListener('click', () => { localStorage.setItem('tax-cup-import-dismissed', '1'); banner.remove(); });
    banner.querySelector('[data-act="import"]').addEventListener('click', async () => {
      try {
        const { counts } = await api('POST', '/api/import', payload);
        ['tax-cup-employees', 'tax-cup-salary-records', 'tax-cup-payroll-runs', 'tax-cup-monthly-payrolls', 'tax-cup-users', 'tax-cup-audit'].forEach((key) => localStorage.removeItem(key));
        banner.remove();
        toast(`Imported ${counts.employees} employees, ${counts.records} records and ${counts.runs + counts.archive} saved payrolls.`, 'success');
        setTimeout(() => location.reload(), 900);
      } catch (error) { toast(error.message, 'error'); }
    });
  }

  // <span data-icon="x"></span> becomes the icon; on buttons/links the icon is prepended to the label.
  function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach((element) => {
      const svg = icon(element.dataset.icon);
      element.removeAttribute('data-icon');
      if (element.tagName === 'SPAN' && !element.textContent.trim()) element.outerHTML = svg;
      else element.insertAdjacentHTML('afterbegin', svg);
    });
  }
  hydrateIcons();

  async function boot() {
    const { authenticated, user } = await api('GET', '/api/session');
    if (!authenticated) {
      window.location.href = `login.html?redirect=${encodeURIComponent(location.pathname.split('/').pop() || 'index.html')}`;
      return new Promise(() => {});
    }
    renderShell(user);
    offerLegacyImport(user);
    return user;
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  window.TC = { icon, money, signedMoney, percent, escapeHtml, currentMonth, monthLabel, monthParts, dateTime, initials, $, api, toast, confirmDialog, downloadFile, toCsv, emptyState, hydrateIcons, boot };
}());
