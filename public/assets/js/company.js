(async function () {
  const { $, money, escapeHtml, api, toast, confirmDialog, emptyState, monthLabel, monthParts, currentMonth, icon, initials, downloadFile, toCsv } = TC;
  const user = await TC.boot();
  const canEditEmployees = user.permissions.includes('employees:write');
  const canSaveRuns = user.permissions.includes('payroll:write');
  const KEYS = ['basic', 'housing', 'transport', 'other'];
  const SETTINGS_KEY = 'tax-cup-company-rules';
  const state = { employees: [], runs: [], selectedRun: null, editingId: null, rows: [] };

  // ── Rules ─────────────────────────────────────────────────
  const allocation = () => Object.fromEntries(KEYS.map((key) => [key, Math.max(0, Number(document.querySelector(`.allocation[data-key="${key}"]`).value) || 0)]));
  const rules = () => ({ allocation: allocation(), pension: $('pension').checked, nhf: $('nhf').checked, nhisRate: Number($('nhis-rate').value) || 0, nsitfRate: Number($('nsitf-rate').value) || 0, itfRate: Number($('itf-rate').value) || 0 });

  function applyRules(saved) {
    if (!saved) return;
    Object.entries(saved.allocation || {}).forEach(([key, value]) => { const input = document.querySelector(`.allocation[data-key="${key}"]`); if (input) input.value = value; });
    if (typeof saved.pension === 'boolean') $('pension').checked = saved.pension;
    if (typeof saved.nhf === 'boolean') $('nhf').checked = saved.nhf;
    ['nhisRate:nhis-rate', 'nsitfRate:nsitf-rate', 'itfRate:itf-rate'].forEach((pair) => { const [key, id] = pair.split(':'); if (saved[key] !== undefined) $(id).value = saved[key]; });
  }

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

  function liveRows() {
    if (!renderAllocation()) return [];
    const r = rules();
    return state.employees.filter((employee) => employee.status !== 'Inactive').map((employee) => ({ employee, result: TaxEngine.compute(employee.salary, { ...r, annualRent: employee.annualRent }) }));
  }

  // Older saved runs store a flat result object; normalise both shapes for display.
  function normalise(item) {
    const r = item.result || {};
    return {
      employee: item.employee || {},
      result: {
        gross: r.gross ?? item.employee?.salary ?? 0,
        earnings: r.earnings || { basic: r.basic || 0, housing: r.housing || 0, transport: r.transport || 0, other: r.other || 0 },
        paye: r.paye || 0, pension: r.pension || 0, nhf: r.nhf || 0, nhis: r.nhis || 0, net: r.net || 0,
        costToCompany: r.costToCompany ?? (r.gross ?? item.employee?.salary ?? 0),
      },
    };
  }

  // ── Directory ─────────────────────────────────────────────
  function renderDirectory() {
    $('directory').innerHTML = state.employees.length ? state.employees.map((employee) => `<tr>
      <td><div class="person"><span class="avatar">${escapeHtml(initials(employee.name))}</span><span><strong>${escapeHtml(employee.name)}</strong><small>${escapeHtml(employee.title || 'Employee')} · ${escapeHtml(employee.department || 'General')}</small></span></div></td>
      <td class="num"><strong>${money(employee.salary)}</strong></td>
      <td class="num">${money(employee.annualRent)}</td>
      <td><span class="badge ${employee.status === 'Inactive' ? '' : 'green'}">${escapeHtml(employee.status || 'Active')}</span></td>
      <td>${canEditEmployees ? `<div class="row-actions"><button class="icon-btn" type="button" data-edit="${escapeHtml(employee.id)}" title="Edit" aria-label="Edit ${escapeHtml(employee.name)}">${icon('edit')}</button><button class="icon-btn" type="button" data-remove="${escapeHtml(employee.id)}" title="Remove" aria-label="Remove ${escapeHtml(employee.name)}">${icon('trash')}</button></div>` : ''}</td></tr>`).join('')
      : `<tr><td colspan="5">${emptyState('users', 'Your directory is empty', canEditEmployees ? 'Add your first employee to start running payroll.' : 'Ask an HR manager or payroll officer to add employees.')}</td></tr>`;
    const departments = [...new Set(state.employees.map((employee) => employee.department || 'General'))].sort();
    const select = $('filter-department');
    const current = select.value;
    select.innerHTML = '<option value="">All departments</option>' + departments.map((department) => `<option>${escapeHtml(department)}</option>`).join('');
    select.value = departments.includes(current) ? current : '';
    $('department-options').innerHTML = departments.map((department) => `<option value="${escapeHtml(department)}">`).join('');
    const active = state.employees.filter((employee) => employee.status !== 'Inactive').length;
    $('st-count').textContent = active;
    $('st-count-note').textContent = state.employees.length > active ? `${state.employees.length - active} inactive` : 'active in directory';
  }

  function openEmployee(employee = null) {
    state.editingId = employee?.id || null;
    $('employee-dialog-title').textContent = employee ? 'Edit employee' : 'Add employee';
    $('emp-name').value = employee?.name || '';
    $('emp-department').value = employee?.department || '';
    $('emp-title').value = employee?.title || '';
    $('emp-salary').value = employee?.salary ?? '';
    $('emp-rent').value = employee?.annualRent ?? 0;
    $('emp-status').value = employee?.status || 'Active';
    $('employee-dialog').showModal();
    $('emp-name').focus();
  }

  $('add-employee').addEventListener('click', () => openEmployee());
  if (!canEditEmployees) $('add-employee').hidden = true;
  document.querySelectorAll('#employee-dialog [data-close]').forEach((button) => button.addEventListener('click', () => $('employee-dialog').close()));
  $('employee-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = { name: $('emp-name').value.trim(), department: $('emp-department').value.trim(), title: $('emp-title').value.trim(), salary: Number($('emp-salary').value) || 0, annualRent: Number($('emp-rent').value) || 0, status: $('emp-status').value };
    if (!body.name) return toast('Enter the employee name.', 'error');
    $('emp-submit').disabled = true;
    try {
      if (state.editingId) {
        const { employee } = await api('PATCH', `/api/employees/${encodeURIComponent(state.editingId)}`, body);
        state.employees = state.employees.map((item) => (item.id === employee.id ? employee : item));
        toast(`${employee.name} updated.`, 'success');
      } else {
        const { employee } = await api('POST', '/api/employees', body);
        state.employees.push(employee);
        toast(`${employee.name} added to the directory.`, 'success');
      }
      $('employee-dialog').close();
      renderDirectory();
      renderPayroll();
    } catch (error) { toast(error.message, 'error'); } finally { $('emp-submit').disabled = false; }
  });

  $('directory').addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit]');
    const remove = event.target.closest('[data-remove]');
    if (edit) openEmployee(state.employees.find((item) => item.id === edit.dataset.edit));
    if (remove) {
      const employee = state.employees.find((item) => item.id === remove.dataset.remove);
      if (!employee || !(await confirmDialog({ title: `Remove ${employee.name}?`, message: 'They will be removed from the directory. Saved payroll runs keep their historical figures.', confirmLabel: 'Remove', danger: true }))) return;
      try {
        await api('DELETE', `/api/employees/${encodeURIComponent(employee.id)}`);
        state.employees = state.employees.filter((item) => item !== employee);
        renderDirectory();
        renderPayroll();
        toast(`${employee.name} removed.`, 'success');
      } catch (error) { toast(error.message, 'error'); }
    }
  });

  // ── Payroll table ─────────────────────────────────────────
  function renderPayroll() {
    const live = liveRows();
    const sum = (rows, pick) => rows.reduce((total, row) => total + pick(row.result), 0);
    $('st-gross').textContent = money(sum(live, (r) => r.gross));
    $('st-paye').textContent = money(sum(live, (r) => r.paye));
    $('st-cost').textContent = money(sum(live, (r) => r.costToCompany));
    $('st-net').textContent = money(sum(live, (r) => r.net));

    const run = state.selectedRun;
    const rows = run ? (run.results || []).map(normalise) : live;
    const query = $('filter-search').value.trim().toLowerCase();
    const department = $('filter-department').value;
    const visible = rows.filter(({ employee }) => (!query || String(employee.name || '').toLowerCase().includes(query)) && (!department || (employee.department || 'General') === department));
    state.rows = visible;

    $('report-title').textContent = run ? `Payroll run · ${monthLabel(run.period)}` : 'Live payroll';
    $('report-note').textContent = run ? `Locked snapshot saved ${TC.dateTime(run.savedAt)} by ${run.savedBy || '—'}.` : 'Calculated from the current directory and rules.';
    $('back-live').classList.toggle('hidden', !run);
    $('print-meta').textContent = run ? monthLabel(run.period) : `Live · ${monthLabel(currentMonth())}`;

    if (!run && !renderAllocation()) {
      $('payroll').innerHTML = `<tr><td colspan="12">${emptyState('alert', 'Salary structure must total 100%', 'Adjust the payroll rules before calculating.')}</td></tr>`;
      $('payroll-totals').innerHTML = '';
      return;
    }
    $('payroll').innerHTML = visible.length ? visible.map(({ employee, result }) => `<tr>
      <td><div class="person"><span class="avatar">${escapeHtml(initials(employee.name))}</span><span><strong>${escapeHtml(employee.name || 'Employee')}</strong><small>${escapeHtml(employee.department || 'General')}</small></span></div></td>
      <td class="num">${money(result.gross)}</td><td class="num">${money(result.earnings.basic)}</td><td class="num">${money(result.earnings.housing)}</td><td class="num">${money(result.earnings.transport)}</td><td class="num">${money(result.earnings.other)}</td>
      <td class="num">${money(result.paye)}</td><td class="num">${money(result.pension)}</td><td class="num">${money(result.nhf)}</td><td class="num">${money(result.nhis)}</td><td class="num"><strong>${money(result.net)}</strong></td><td class="num">${money(result.costToCompany)}</td></tr>`).join('')
      : `<tr><td colspan="12">${emptyState('file', rows.length ? 'No matching employees' : 'No payroll to show', rows.length ? 'Clear the search or department filter.' : 'Add active employees to the directory.')}</td></tr>`;
    $('payroll-totals').innerHTML = visible.length ? `<tr><td>Total · ${visible.length}</td>${[(r) => r.gross, (r) => r.earnings.basic, (r) => r.earnings.housing, (r) => r.earnings.transport, (r) => r.earnings.other, (r) => r.paye, (r) => r.pension, (r) => r.nhf, (r) => r.nhis, (r) => r.net, (r) => r.costToCompany].map((pick) => `<td class="num">${money(sum(visible, pick))}</td>`).join('')}</tr>` : '';
  }

  function onRulesChange() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(rules())); } catch (error) { /* ignore */ }
    renderPayroll();
  }
  document.querySelectorAll('.allocation, #nhis-rate, #nsitf-rate, #itf-rate').forEach((input) => input.addEventListener('input', onRulesChange));
  ['pension', 'nhf'].forEach((id) => $(id).addEventListener('change', onRulesChange));
  ['filter-search', 'filter-department'].forEach((id) => $(id).addEventListener('input', renderPayroll));
  $('back-live').addEventListener('click', () => { state.selectedRun = null; renderRuns(); renderPayroll(); });
  $('print-btn').addEventListener('click', () => window.print());
  $('export-csv').addEventListener('click', () => {
    if (!state.rows.length) return toast('There is nothing to export.', 'info');
    const header = ['Employee', 'Department', 'Gross', 'Basic', 'Housing', 'Transport', 'Other', 'PAYE', 'Pension', 'NHF', 'NHIS', 'Net pay', 'Cost to company'];
    const rows = state.rows.map(({ employee, result }) => [employee.name, employee.department || 'General', result.gross, result.earnings.basic, result.earnings.housing, result.earnings.transport, result.earnings.other, result.paye, result.pension, result.nhf, result.nhis, result.net, result.costToCompany].map((value) => (typeof value === 'number' ? value.toFixed(2) : value)));
    downloadFile(`company-payroll-${state.selectedRun?.period || currentMonth()}.csv`, toCsv([header, ...rows]), 'text/csv');
  });

  // ── Runs ──────────────────────────────────────────────────
  function renderRuns() {
    const query = $('run-search').value.trim().toLowerCase();
    const runs = state.runs.filter((run) => !query || [run.period, monthLabel(run.period), ...(run.results || []).map((item) => item.employee?.name)].some((value) => String(value || '').toLowerCase().includes(query)));
    $('runs').innerHTML = runs.length ? runs.map((run) => {
      const { month, year } = monthParts(run.period);
      return `<div class="list-item ${state.selectedRun?.id === run.id ? 'selected' : ''}"><span class="cal-icon"><span><b>${escapeHtml(month)}</b><small>${escapeHtml(year)}</small></span></span>
        <button class="grow" type="button" data-open="${escapeHtml(run.id)}"><strong>${escapeHtml(monthLabel(run.period))}</strong><small>${run.count} employees · saved by ${escapeHtml(run.savedBy || '—')} · ${escapeHtml(TC.dateTime(run.savedAt))}</small></button>
        <span class="badge dark">Locked</span>
        <span class="amount">${money(run.totalNet)}<small>net payroll</small></span>
        ${canSaveRuns ? `<button class="icon-btn" type="button" data-delete="${escapeHtml(run.id)}" title="Delete" aria-label="Delete ${escapeHtml(monthLabel(run.period))} run">${icon('trash')}</button>` : ''}</div>`;
    }).join('') : emptyState('clock', state.runs.length ? 'No matches' : 'No payroll runs saved', state.runs.length ? 'Try another month or name.' : 'Save the live payroll to create this month’s permanent record.');
  }

  $('run-search').addEventListener('input', renderRuns);
  $('runs').addEventListener('click', async (event) => {
    const open = event.target.closest('[data-open]');
    const del = event.target.closest('[data-delete]');
    if (open) {
      state.selectedRun = state.runs.find((run) => run.id === open.dataset.open) || null;
      renderRuns();
      renderPayroll();
      document.getElementById('report-title').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (del) {
      const run = state.runs.find((item) => item.id === del.dataset.delete);
      if (!run || !(await confirmDialog({ title: `Delete ${monthLabel(run.period)} run?`, message: 'This permanently removes the saved snapshot for this month.', confirmLabel: 'Delete run', danger: true }))) return;
      try {
        await api('DELETE', `/api/runs/${encodeURIComponent(run.id)}`);
        state.runs = state.runs.filter((item) => item !== run);
        if (state.selectedRun === run) state.selectedRun = null;
        renderRuns();
        renderPayroll();
        toast('Payroll run deleted.', 'success');
      } catch (error) { toast(error.message, 'error'); }
    }
  });

  $('save-run').addEventListener('click', async () => {
    const period = $('run-month').value;
    const live = liveRows();
    if (!period) return toast('Choose the payroll month.', 'error');
    if (!live.length) return toast('There are no active employees to save, or the salary structure is not 100%.', 'error');
    try {
      const results = live.map(({ employee, result }) => ({ employee: { id: employee.id, name: employee.name, department: employee.department, title: employee.title, salary: employee.salary, annualRent: employee.annualRent }, result: { gross: result.gross, earnings: result.earnings, paye: result.paye, pension: result.pension, nhf: result.nhf, nhis: result.nhis, net: result.net, rentRelief: result.rentRelief, employer: result.employer, costToCompany: result.costToCompany } }));
      const { run } = await api('POST', '/api/runs', { period, settings: rules(), results });
      state.runs.unshift(run);
      state.selectedRun = run;
      renderRuns();
      renderPayroll();
      toast(`${monthLabel(period)} payroll saved and locked.`, 'success');
    } catch (error) {
      if (error.status === 409 && error.data?.run) {
        state.selectedRun = state.runs.find((run) => run.id === error.data.run.id) || error.data.run;
        renderRuns();
        renderPayroll();
      }
      toast(error.message, 'error');
    }
  });
  if (!canSaveRuns) $('save-run').disabled = true;

  // ── Start ─────────────────────────────────────────────────
  try { applyRules(JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')); } catch (error) { /* ignore */ }
  $('run-month').value = currentMonth();
  $('directory').innerHTML = '<tr><td colspan="5"><div class="skeleton" style="height:120px"></div></td></tr>';
  try {
    const [employees, runs] = await Promise.all([api('GET', '/api/employees'), api('GET', '/api/runs').catch(() => ({ runs: [] }))]);
    state.employees = employees.employees;
    state.runs = runs.runs;
  } catch (error) { toast(error.message, 'error'); }
  renderDirectory();
  renderPayroll();
  renderRuns();
}());
