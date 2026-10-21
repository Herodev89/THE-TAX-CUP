(async function () {
  const { $, money, escapeHtml, api, toast, confirmDialog, emptyState, monthLabel, monthParts, currentMonth, icon, downloadFile, toCsv } = TC;
  const user = await TC.boot();
  const canSave = user.permissions.includes('calc:write');
  const DRAFT_KEY = 'tax-cup-team-draft';
  const KEYS = ['basic', 'housing', 'transport', 'other'];
  const state = { mode: 'gross', unit: 'monthly', rows: [], results: [], archive: [] };
  let nextId = 1;

  function loadDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (draft?.rows?.length) return draft;
    } catch (error) { /* ignore */ }
    return null;
  }
  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ rows: state.rows, mode: state.mode, unit: state.unit })); } catch (error) { /* storage unavailable */ }
  }

  const allocation = () => Object.fromEntries(KEYS.map((key) => [key, Math.max(0, Number(document.querySelector(`.allocation[data-key="${key}"]`).value) || 0)]));
  const options = (row) => ({ allocation: allocation(), pension: $('pension').checked, nhf: $('nhf').checked, nhisRate: $('nhis-rate').value, annualRent: row.annualRent });

  function renderAllocation() {
    const parts = allocation();
    const total = TaxEngine.allocationTotal(parts);
    const balanced = Math.abs(total - 100) < 0.005;
    $('alloc-total').textContent = `${+total.toFixed(2)}%`;
    $('alloc-state').textContent = balanced ? 'Balanced' : `${+Math.abs(100 - total).toFixed(2)}% ${total < 100 ? 'unallocated' : 'over'}`;
    $('alloc-state').className = balanced ? 'ok' : 'bad';
    $('alloc-bar').innerHTML = KEYS.map((key) => `<i class="c-${key}" style="width:${Math.min(100, parts[key])}%"></i>`).join('');
    return balanced;
  }

  function renderRows() {
    const per = state.unit === 'annual' ? 'year' : 'month';
    $('salary-head').textContent = state.mode === 'net' ? `Target net / ${per}` : `Gross / ${per}`;
    $('result-head').textContent = state.mode === 'net' ? 'Gross needed / month' : 'Net / month';
    $('rows').innerHTML = state.rows.length ? state.rows.map((row) => `
      <div class="team-row" data-id="${row.id}">
        <div class="name-cell"><input class="input" data-field="name" type="text" placeholder="Full name" value="${escapeHtml(row.name)}" aria-label="Employee name"></div>
        <div class="input-group"><span class="affix">₦</span><input data-field="salary" type="number" min="0" step="any" value="${escapeHtml(row.salary)}" aria-label="Salary"></div>
        <div class="input-group"><span class="affix">₦</span><input data-field="annualRent" type="number" min="0" step="any" value="${escapeHtml(row.annualRent || 0)}" aria-label="Annual rent"></div>
        <div class="out" data-out="${row.id}">—</div>
        <button class="icon-btn" type="button" data-remove="${row.id}" aria-label="Remove employee" title="Remove">${icon('trash')}</button>
      </div>`).join('') : emptyState('users', 'No team members yet', 'Add employees one by one or load your company directory.');
  }

  function calculate() {
    if (!renderAllocation()) {
      state.results = [];
      $('results').innerHTML = `<tr><td colspan="12">${emptyState('alert', 'Salary structure must total 100%', 'Adjust the basic, housing, transport and other percentages.')}</td></tr>`;
      $('totals').innerHTML = '';
      return;
    }
    const divisor = state.unit === 'annual' ? 12 : 1;
    state.results = state.rows.map((row) => {
      const amount = (Number(row.salary) || 0) / divisor;
      return { row, result: state.mode === 'net' ? TaxEngine.grossForNet(amount, options(row)) : TaxEngine.compute(amount, options(row)) };
    });
    const sum = (pick) => state.results.reduce((total, item) => total + pick(item.result), 0);
    const totals = { gross: sum((r) => r.gross), paye: sum((r) => r.paye), pension: sum((r) => r.pension), nhf: sum((r) => r.nhf), nhis: sum((r) => r.nhis), net: sum((r) => r.net), cost: sum((r) => r.costToCompany), relief: sum((r) => r.rentRelief), basic: sum((r) => r.earnings.basic), housing: sum((r) => r.earnings.housing), transport: sum((r) => r.earnings.transport), other: sum((r) => r.earnings.other) };

    state.results.forEach(({ row, result }) => {
      const cell = document.querySelector(`[data-out="${row.id}"]`);
      if (cell) cell.innerHTML = `${money(state.mode === 'net' ? result.gross : result.net)}<small>PAYE ${money(result.paye)}</small>`;
    });

    $('results').innerHTML = state.results.length ? state.results.map(({ row, result }) => `<tr>
      <td><div class="person"><span class="avatar">${escapeHtml(TC.initials(row.name || '?'))}</span><strong>${escapeHtml(row.name || 'Unnamed employee')}</strong></div></td>
      <td class="num">${money(result.gross)}</td><td class="num">${money(result.earnings.basic)}</td><td class="num">${money(result.earnings.housing)}</td><td class="num">${money(result.earnings.transport)}</td><td class="num">${money(result.earnings.other)}</td>
      <td class="num">${money(result.rentRelief)}<small>per year</small></td><td class="num">${money(result.paye)}</td><td class="num">${money(result.pension)}</td><td class="num">${money(result.nhf)}</td><td class="num">${money(result.nhis)}</td><td class="num"><strong>${money(result.net)}</strong></td></tr>`).join('')
      : `<tr><td colspan="12">${emptyState('file', 'Nothing to show yet', 'Add team members above to build the schedule.')}</td></tr>`;
    $('totals').innerHTML = state.results.length ? `<tr><td>Total · ${state.results.length} employees</td><td class="num">${money(totals.gross)}</td><td class="num">${money(totals.basic)}</td><td class="num">${money(totals.housing)}</td><td class="num">${money(totals.transport)}</td><td class="num">${money(totals.other)}</td><td class="num">${money(totals.relief)}</td><td class="num">${money(totals.paye)}</td><td class="num">${money(totals.pension)}</td><td class="num">${money(totals.nhf)}</td><td class="num">${money(totals.nhis)}</td><td class="num">${money(totals.net)}</td></tr>` : '';

    $('st-gross').textContent = money(totals.gross);
    $('st-paye').textContent = money(totals.paye);
    $('st-statutory').textContent = money(totals.pension + totals.nhf);
    $('st-cost').textContent = money(totals.cost);
    $('st-net').textContent = money(totals.net);
    $('hs-count').textContent = state.results.length;
    $('hs-net').textContent = money(totals.net);
    $('hs-paye').textContent = money(totals.paye);
    $('summary').textContent = `${state.results.length} employee${state.results.length === 1 ? '' : 's'} · ${state.mode === 'net' ? 'net targets → gross' : 'gross → net'} · salaries entered ${state.unit}`;
    $('print-meta').textContent = monthLabel($('archive-month').value);
    state.totals = totals;
  }

  function refresh() { renderRows(); calculate(); saveDraft(); }

  function setSegment(id, value) {
    state[id] = value;
    document.querySelectorAll(`#${id} button`).forEach((button) => button.classList.toggle('active', button.dataset.value === value));
  }

  ['mode', 'unit'].forEach((id) => document.querySelectorAll(`#${id} button`).forEach((button) => button.addEventListener('click', () => { setSegment(id, button.dataset.value); refresh(); })));
  document.querySelectorAll('.allocation, #nhis-rate').forEach((input) => input.addEventListener('input', calculate));
  ['pension', 'nhf'].forEach((id) => $(id).addEventListener('change', calculate));

  $('rows').addEventListener('input', (event) => {
    const field = event.target.dataset.field;
    const rowEl = event.target.closest('[data-id]');
    if (!field || !rowEl) return;
    const row = state.rows.find((item) => String(item.id) === rowEl.dataset.id);
    row[field] = field === 'name' ? event.target.value : Number(event.target.value) || 0;
    calculate();
    saveDraft();
  });
  $('rows').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove]');
    if (!button) return;
    state.rows = state.rows.filter((row) => String(row.id) !== button.dataset.remove);
    refresh();
  });
  $('add-row').addEventListener('click', () => {
    state.rows.push({ id: nextId++, name: '', salary: 0, annualRent: 0 });
    refresh();
    document.querySelector('#rows .team-row:last-child [data-field="name"]')?.focus();
  });

  $('load-directory').addEventListener('click', async () => {
    try {
      const { employees } = await api('GET', '/api/employees');
      const active = employees.filter((employee) => employee.status !== 'Inactive');
      if (!active.length) return toast('The company directory is empty. Add employees in Company workspace.', 'info');
      if (state.rows.some((row) => row.name || row.salary) && !(await confirmDialog({ title: 'Replace team list?', message: `Load ${active.length} employees from the company directory? Unsaved rows here will be replaced.`, confirmLabel: 'Load directory' }))) return;
      setSegment('mode', 'gross');
      setSegment('unit', 'monthly');
      state.rows = active.map((employee) => ({ id: nextId++, name: employee.name, salary: employee.salary, annualRent: employee.annualRent || 0 }));
      refresh();
      toast(`Loaded ${active.length} employees.`, 'success');
    } catch (error) { toast(error.message, 'error'); }
  });

  $('print-btn').addEventListener('click', () => window.print());
  $('export-csv').addEventListener('click', () => {
    if (!state.results.length) return toast('Add employees first.', 'info');
    const header = ['Employee', 'Gross', 'Basic', 'Housing', 'Transport', 'Other', 'Annual rent relief', 'PAYE', 'Pension', 'NHF', 'NHIS', 'Net pay', 'Employer pension', 'Cost to company'];
    const rows = state.results.map(({ row, result }) => [row.name || 'Unnamed employee', result.gross, result.earnings.basic, result.earnings.housing, result.earnings.transport, result.earnings.other, result.rentRelief, result.paye, result.pension, result.nhf, result.nhis, result.net, result.employer.pension, result.costToCompany].map((value) => (typeof value === 'number' ? value.toFixed(2) : value)));
    downloadFile(`team-payroll-${$('archive-month').value || 'current'}.csv`, toCsv([header, ...rows]), 'text/csv');
  });

  // ── Saved team payrolls ───────────────────────────────────
  function renderArchive() {
    const query = $('archive-search').value.trim().toLowerCase();
    const items = state.archive.filter((item) => !query || [item.title, item.period, monthLabel(item.period), ...(item.snapshot?.employees || []).map((e) => e.name)].some((value) => String(value || '').toLowerCase().includes(query)));
    $('archive-list').innerHTML = items.length ? items.map((item) => {
      const { month, year } = monthParts(item.period);
      return `<div class="list-item"><span class="cal-icon"><span><b>${escapeHtml(month)}</b><small>${escapeHtml(year)}</small></span></span>
        <button class="grow" type="button" data-open="${escapeHtml(item.id)}"><strong>${escapeHtml(item.title || 'Team payroll')} · ${item.count} employees</strong><small>${escapeHtml(monthLabel(item.period))} · saved by ${escapeHtml(item.savedBy || '—')}</small></button>
        <span class="amount">${money(item.totalNet)}<small>net payroll</small></span>
        ${canSave ? `<button class="icon-btn" type="button" data-delete="${escapeHtml(item.id)}" aria-label="Delete saved payroll" title="Delete">${icon('trash')}</button>` : ''}</div>`;
    }).join('') : emptyState('file', state.archive.length ? 'No matches' : 'No saved team payrolls', state.archive.length ? 'Try another search.' : 'Save this calculation against a month to keep a record.');
  }

  function restore(item) {
    const s = item.snapshot;
    if (!s?.employees) return toast('This older record has no saved inputs.', 'error');
    state.rows = s.employees.map((employee) => ({ id: nextId++, name: employee.name || '', salary: Number(employee.salary) || 0, annualRent: Number(employee.annualRent) || 0 }));
    Object.entries(s.allocations || {}).forEach(([key, value]) => { const input = document.querySelector(`.allocation[data-key="${key}"]`); if (input) input.value = value; });
    $('pension').checked = s.pension !== false;
    $('nhf').checked = s.nhf !== false;
    $('nhis-rate').value = s.nhisRate || 0;
    setSegment('mode', s.mode || 'gross');
    setSegment('unit', s.unit || 'monthly');
    $('archive-month').value = item.period;
    refresh();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast(`Opened team payroll for ${monthLabel(item.period)}.`, 'success');
  }

  $('archive-search').addEventListener('input', renderArchive);
  $('archive-list').addEventListener('click', async (event) => {
    const open = event.target.closest('[data-open]');
    const del = event.target.closest('[data-delete]');
    if (open) restore(state.archive.find((item) => String(item.id) === open.dataset.open));
    if (del) {
      const item = state.archive.find((entry) => String(entry.id) === del.dataset.delete);
      if (!item || !(await confirmDialog({ title: 'Delete saved payroll?', message: `The team payroll for ${monthLabel(item.period)} will be removed for everyone.`, confirmLabel: 'Delete', danger: true }))) return;
      try { await api('DELETE', `/api/archive/${encodeURIComponent(item.id)}`); state.archive = state.archive.filter((entry) => entry !== item); renderArchive(); toast('Saved payroll deleted.', 'success'); } catch (error) { toast(error.message, 'error'); }
    }
  });
  $('archive-save').addEventListener('click', async () => {
    if (!state.results.length) return toast('Add at least one employee and balance the salary structure.', 'error');
    if (!$('archive-month').value) return toast('Choose the payroll month.', 'error');
    try {
      const snapshot = { employees: state.rows.map(({ name, salary, annualRent }) => ({ name, salary, annualRent })), allocations: allocation(), pension: $('pension').checked, nhf: $('nhf').checked, nhisRate: $('nhis-rate').value, mode: state.mode, unit: state.unit };
      const { item } = await api('POST', '/api/archive', { type: 'batch', period: $('archive-month').value, title: 'Team payroll', count: state.results.length, totalNet: state.totals.net, snapshot });
      state.archive.unshift(item);
      renderArchive();
      toast(`Team payroll saved for ${monthLabel(item.period)}.`, 'success');
    } catch (error) { toast(error.message, 'error'); }
  });
  if (!canSave) $('archive-save').disabled = true;
  if (!user.permissions.includes('employees:read')) $('load-directory').hidden = true;

  // ── Start ─────────────────────────────────────────────────
  const draft = loadDraft();
  if (draft) {
    state.rows = draft.rows.map((row) => ({ ...row, id: nextId++ }));
    setSegment('mode', draft.mode || 'gross');
    setSegment('unit', draft.unit || 'monthly');
  } else {
    state.rows = [{ id: nextId++, name: '', salary: 500000, annualRent: 0 }];
  }
  $('archive-month').value = currentMonth();
  refresh();
  try {
    state.archive = (await api('GET', '/api/archive?type=batch')).items;
  } catch (error) { state.archive = []; }
  renderArchive();
  const requested = new URLSearchParams(location.search).get('payroll');
  const match = requested && state.archive.find((item) => String(item.id) === requested);
  if (match) restore(match);
}());
