(async function () {
  const { $, money, signedMoney, escapeHtml, api, toast, confirmDialog, emptyState, monthLabel, currentMonth, icon, initials, dateTime, downloadFile, toCsv } = TC;
  const user = await TC.boot();
  const can = (permission) => user.permissions.includes(permission);

  const EARNINGS = [['basic', 'Basic salary'], ['housing', 'Housing allowance'], ['transport', 'Transport allowance'], ['meal', 'Meal allowance'], ['utility', 'Utility allowance'], ['otherAllowances', 'Other allowances'], ['bonus', 'Bonus'], ['overtime', 'Overtime'], ['commission', 'Commission'], ['arrears', 'Arrears'], ['otherEarnings', 'Other earnings']];
  const DEDUCTIONS = [['paye', 'PAYE tax'], ['pension', 'Pension (8%)'], ['nhf', 'NHF (2.5%)'], ['nhis', 'NHIS'], ['loan', 'Loan repayment'], ['advance', 'Salary advance'], ['absence', 'Absence / unpaid leave'], ['otherDeductions', 'Other deductions']];
  const EMPLOYER = [['employerPension', 'Employer pension (10%)'], ['nsitf', 'NSITF (1%)'], ['itf', 'ITF (1%)']];
  const WORKFLOW = ['Draft', 'Under Review', 'Approved', 'Finalized', 'Paid'];
  const LOCKED = new Set(['Finalized', 'Paid']);
  const state = { employees: [], records: [], users: [], roles: [], audit: [], editing: null };

  const num = (value) => Math.max(0, Number(value) || 0);
  const sumKeys = (record, keys) => keys.reduce((total, [key]) => total + num(record[key]), 0);
  const hydrate = (record) => {
    const gross = sumKeys(record, EARNINGS);
    const deductions = sumKeys(record, DEDUCTIONS);
    const employerCost = sumKeys(record, EMPLOYER);
    return { ...record, gross, deductions, employerCost, net: gross - deductions, department: record.department || 'General' };
  };
  const records = () => state.records.map(hydrate);
  const workflowBadge = (status) => `<span class="badge ${{ Draft: '', 'Under Review': 'amber', Approved: 'blue', Finalized: 'gold', Paid: 'green' }[status] ?? ''}">${escapeHtml(status)}</span>`;
  const paymentBadge = (status) => `<span class="badge ${{ Paid: 'green', Failed: 'red', Pending: 'amber' }[status] ?? ''}">${escapeHtml(status)}</span>`;
  const stepper = (status) => `<span class="stepper" title="${escapeHtml(status)}">${WORKFLOW.map((step, i) => `<i class="${i <= WORKFLOW.indexOf(status) ? 'on' : ''}"></i>`).join('')}</span>`;

  // ── Tabs ──────────────────────────────────────────────────
  if (can('users:manage')) document.querySelectorAll('[data-admin]').forEach((tab) => tab.classList.remove('hidden'));
  function showView(name) {
    document.querySelectorAll('.tab').forEach((tab) => { tab.classList.toggle('active', tab.dataset.view === name); tab.setAttribute('aria-selected', String(tab.dataset.view === name)); });
    document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === `${name}-view`));
    history.replaceState(null, '', `#${name}`);
  }
  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => showView(tab.dataset.view)));
  document.querySelectorAll('[data-print]').forEach((button) => button.addEventListener('click', () => window.print()));

  // ── Selects ───────────────────────────────────────────────
  function populateSelects() {
    const departments = [...new Set([...state.employees.map((e) => e.department || 'General'), ...state.records.map((r) => r.department || 'General')])].sort();
    const people = [...new Map([...state.employees.map((e) => [String(e.id), e.name]), ...state.records.map((r) => [String(r.employeeId), r.employeeName])]).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    const fill = (id, first, options) => { const el = $(id); const value = el.value; el.innerHTML = first + options; if ([...el.options].some((o) => o.value === value)) el.value = value; };
    ['dash-department', 'co-department'].forEach((id) => fill(id, '<option value="">All departments</option>', departments.map((d) => `<option>${escapeHtml(d)}</option>`).join('')));
    fill('rec-employee', '<option value="">All employees</option>', people.map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join(''));
    fill('rep-employee', '<option value="">Select employee</option>', people.map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join(''));
  }

  // ── Dashboard ─────────────────────────────────────────────
  function renderDashboard() {
    const period = $('dash-period').value;
    const department = $('dash-department').value;
    const all = records().filter((r) => !department || r.department === department);
    const selected = all.filter((r) => !period || r.period === period);
    const total = (list, key) => list.reduce((sum, r) => sum + r[key], 0);
    const paid = selected.filter((r) => r.paymentStatus === 'Paid').length;

    $('m-employees').textContent = state.employees.filter((e) => e.status !== 'Inactive').length;
    $('m-gross').textContent = money(total(selected, 'gross'));
    $('m-gross-note').textContent = period ? monthLabel(period) : 'all periods';
    $('m-deductions').textContent = money(total(selected, 'deductions'));
    $('m-net').textContent = money(total(selected, 'net'));
    $('m-paid').textContent = paid;
    $('m-paid-note').textContent = `of ${selected.length} record${selected.length === 1 ? '' : 's'}`;

    const months = [...new Set(all.map((r) => r.period))].sort().slice(-6);
    const series = months.map((month) => { const list = all.filter((r) => r.period === month); return { month, gross: total(list, 'gross'), net: total(list, 'net') }; });
    const max = Math.max(1, ...series.map((s) => s.gross));
    $('trend-chart').innerHTML = series.length ? series.map((s) => `<div class="bar-col" title="${escapeHtml(monthLabel(s.month))}: gross ${money(s.gross)}, net ${money(s.net)}"><div class="bar-pair"><i style="height:${Math.max(2, (s.gross / max) * 100)}%"></i><b style="height:${Math.max(2, (s.net / max) * 100)}%"></b></div><small>${escapeHtml(monthLabel(s.month, 'short'))}</small></div>`).join('') : `<div style="flex:1">${emptyState('trend', 'No history yet', 'Saved monthly records will build the trend.')}</div>`;

    const statuses = [['Paid', '#187A45'], ['Pending', '#C59A3F'], ['Failed', '#B42318']];
    const counts = statuses.map(([status, color]) => ({ status, color, count: selected.filter((r) => r.paymentStatus === status).length }));
    let start = 0;
    const stops = counts.map(({ color, count }) => { const share = selected.length ? (count / selected.length) * 100 : 0; const stop = `${color} ${start}% ${start + share}%`; start += share; return stop; });
    $('status-chart').innerHTML = `<div class="donut" style="background:${selected.length ? `conic-gradient(${stops.join(',')})` : 'var(--surface-3)'}"><div class="donut-center"><span><strong>${selected.length ? Math.round((paid / selected.length) * 100) : 0}%</strong><small>paid</small></span></div></div>
      <div class="chart-legend">${counts.map(({ status, color, count }) => `<span><i class="swatch" style="background:${color}"></i>${status}<b>${count}</b></span>`).join('')}</div>`;

    const byDepartment = [...new Set(selected.map((r) => r.department))].map((name) => [name, total(selected.filter((r) => r.department === name), 'gross')]).sort((a, b) => b[1] - a[1]);
    const depMax = Math.max(1, ...byDepartment.map(([, value]) => value));
    $('department-chart').innerHTML = byDepartment.length ? byDepartment.map(([name, value]) => `<div class="hbar"><span>${escapeHtml(name)}</span><i><b style="width:${(value / depMax) * 100}%"></b></i><strong>${money(value)}</strong></div>`).join('') : emptyState('building', 'No departments', 'Records for this period will appear here.');

    const deductionTotals = DEDUCTIONS.map(([key, label]) => [label, selected.reduce((sum, r) => sum + num(r[key]), 0)]).filter(([, value]) => value > 0);
    const dedMax = Math.max(1, ...deductionTotals.map(([, value]) => value));
    $('deduction-chart').innerHTML = deductionTotals.length ? deductionTotals.map(([label, value]) => `<div class="hbar"><span>${escapeHtml(label)}</span><i><b style="width:${(value / dedMax) * 100}%"></b></i><strong>${money(value)}</strong></div>`).join('') : emptyState('receipt', 'No deductions', 'Nothing recorded for this period.');

    const thisMonth = records().filter((r) => r.period === currentMonth());
    $('hs-review').textContent = records().filter((r) => r.workflowStatus === 'Under Review').length;
    $('hs-pending').textContent = records().filter((r) => r.paymentStatus !== 'Paid').length;
    $('hs-month').textContent = thisMonth.length;
  }

  // ── Records ───────────────────────────────────────────────
  function renderRecords() {
    const query = $('rec-search').value.trim().toLowerCase();
    const filters = { employee: $('rec-employee').value, status: $('rec-status').value, payment: $('rec-payment').value, from: $('rec-from').value, to: $('rec-to').value };
    const list = records().filter((r) => (!query || [r.employeeName, r.employeeId, r.department, r.title, r.reference].some((v) => String(v || '').toLowerCase().includes(query)))
      && (!filters.employee || String(r.employeeId) === filters.employee) && (!filters.status || r.workflowStatus === filters.status)
      && (!filters.payment || r.paymentStatus === filters.payment) && (!filters.from || r.period >= filters.from) && (!filters.to || r.period <= filters.to))
      .sort((a, b) => b.period.localeCompare(a.period) || a.employeeName.localeCompare(b.employeeName));
    $('records-body').innerHTML = list.length ? list.map((r) => {
      const locked = LOCKED.has(r.workflowStatus);
      const next = WORKFLOW[WORKFLOW.indexOf(r.workflowStatus) + 1];
      return `<tr>
        <td><strong>${escapeHtml(monthLabel(r.period, 'short'))}</strong><small>${escapeHtml(r.period)}</small></td>
        <td><div class="person"><span class="avatar">${escapeHtml(initials(r.employeeName))}</span><span><strong>${escapeHtml(r.employeeName)}</strong><small>${escapeHtml(r.department)}</small></span></div></td>
        <td class="num">${money(r.gross)}</td><td class="num">${money(r.deductions)}</td><td class="num"><strong>${signedMoney(r.net)}</strong></td>
        <td><div style="display:grid;gap:6px">${workflowBadge(r.workflowStatus)}${stepper(r.workflowStatus)}</div></td>
        <td>${paymentBadge(r.paymentStatus)}</td>
        <td><div class="row-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-open="${escapeHtml(r.id)}">${locked || !can('payroll:write') ? 'View' : 'Edit'}</button>
          ${next && can('payroll:approve') ? `<button class="btn btn-dark btn-sm" type="button" data-advance="${escapeHtml(r.id)}" title="Move to ${escapeHtml(next)}">${icon('arrow')}${escapeHtml(next === 'Under Review' ? 'Submit' : next === 'Finalized' ? 'Finalise' : next === 'Paid' ? 'Mark paid' : 'Approve')}</button>` : ''}
        </div></td></tr>`;
    }).join('') : `<tr><td colspan="8">${emptyState('file', state.records.length ? 'No records match' : 'No salary records yet', state.records.length ? 'Adjust the filters above.' : 'Record the first monthly payroll to begin the approval workflow.')}</td></tr>`;
  }

  ['rec-search', 'rec-employee', 'rec-status', 'rec-payment', 'rec-from', 'rec-to'].forEach((id) => $(id).addEventListener('input', renderRecords));
  $('records-body').addEventListener('click', async (event) => {
    const open = event.target.closest('[data-open]');
    const advance = event.target.closest('[data-advance]');
    if (open) openRecord(state.records.find((r) => r.id === open.dataset.open));
    if (advance) {
      const record = state.records.find((r) => r.id === advance.dataset.advance);
      const next = WORKFLOW[WORKFLOW.indexOf(record.workflowStatus) + 1];
      if (LOCKED.has(next) && !(await confirmDialog({ title: `Move to ${next}?`, message: `${record.employeeName} · ${monthLabel(record.period)} will be locked and can no longer be edited.`, confirmLabel: next === 'Paid' ? 'Mark as paid' : 'Finalise' }))) return;
      try {
        const { record: updated } = await api('POST', `/api/records/${encodeURIComponent(record.id)}/advance`);
        state.records = state.records.map((r) => (r.id === updated.id ? updated : r));
        renderAll();
        toast(`${updated.employeeName} moved to ${updated.workflowStatus}.`, 'success');
      } catch (error) { toast(error.message, 'error'); }
    }
  });

  // ── Record form ───────────────────────────────────────────
  const fieldHtml = ([key, label]) => `<label class="field"><span>${escapeHtml(label)}</span><div class="input-group"><span class="affix">₦</span><input id="f-${key}" data-key="${key}" type="number" min="0" step="0.01" value="0"></div></label>`;
  $('earnings-fields').innerHTML = EARNINGS.map(fieldHtml).join('');
  $('deduction-fields').innerHTML = DEDUCTIONS.map(fieldHtml).join('');
  $('employer-fields').innerHTML = EMPLOYER.map(fieldHtml).join('');

  function formValues() {
    const values = { employeeId: $('f-employee').value, period: $('f-period').value, annualRent: num($('f-annualRent').value), paymentStatus: $('f-paymentStatus').value, paymentDate: $('f-paymentDate').value, reference: $('f-reference').value.trim(), remarks: $('f-remarks').value.trim() };
    [...EARNINGS, ...DEDUCTIONS, ...EMPLOYER].forEach(([key]) => { values[key] = num($(`f-${key}`).value); });
    return values;
  }

  function updateTotals() {
    const values = formValues();
    const gross = sumKeys(values, EARNINGS);
    const deductions = sumKeys(values, DEDUCTIONS);
    $('t-gross').textContent = money(gross);
    $('t-deductions').textContent = money(deductions);
    $('t-net').textContent = gross - deductions < 0 ? `${signedMoney(gross - deductions)} — deductions exceed gross` : money(gross - deductions);
    $('t-net-box').classList.toggle('neg', gross - deductions < 0);
  }

  function openRecord(record = null) {
    if (!record && !can('payroll:write')) return toast('Your role cannot create payroll records.', 'error');
    state.editing = record;
    const readOnly = record && (LOCKED.has(record.workflowStatus) || !can('payroll:write'));
    $('record-title').textContent = record ? `${record.employeeName} · ${monthLabel(record.period)}` : 'Record monthly payroll';
    $('record-sub').textContent = record ? `${record.workflowStatus}${readOnly && LOCKED.has(record.workflowStatus) ? ' — locked, view only' : ''} · created by ${record.createdBy || '—'}` : 'All amounts are monthly, in naira.';
    const activeEmployees = state.employees.filter((e) => e.status !== 'Inactive' || (record && e.id === record.employeeId));
    $('f-employee').innerHTML = '<option value="">Select employee</option>' + activeEmployees.map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.name)} · ${escapeHtml(e.department || 'General')}</option>`).join('')
      + (record && !activeEmployees.some((e) => e.id === record.employeeId) ? `<option value="${escapeHtml(record.employeeId)}">${escapeHtml(record.employeeName)} (former)</option>` : '');
    $('record-form').reset();
    $('f-employee').value = record?.employeeId || '';
    $('f-period').value = record?.period || currentMonth();
    ['annualRent', 'paymentStatus', 'paymentDate', 'reference', 'remarks', ...[...EARNINGS, ...DEDUCTIONS, ...EMPLOYER].map(([key]) => key)].forEach((key) => { if (record && record[key] !== undefined && $(`f-${key}`)) $(`f-${key}`).value = record[key]; });
    $('record-form').querySelectorAll('input, select, textarea').forEach((el) => { el.disabled = !!readOnly; });
    ['auto-calc', 'fill-from-salary', 'record-submit'].forEach((id) => { $(id).hidden = !!readOnly; });
    $('delete-record').classList.toggle('hidden', !(record && record.workflowStatus === 'Draft' && can('payroll:write')));
    updateTotals();
    $('record-dialog').showModal();
  }

  function fillFromSalary() {
    const employee = state.employees.find((e) => e.id === $('f-employee').value);
    if (!employee) return toast('Choose an employee first.', 'info');
    const split = TaxEngine.DEFAULT_ALLOCATION;
    let rules = null;
    try { rules = JSON.parse(localStorage.getItem('tax-cup-company-rules') || 'null'); } catch (error) { /* ignore */ }
    const allocation = rules?.allocation || split;
    $('f-basic').value = (employee.salary * allocation.basic / 100).toFixed(2);
    $('f-housing').value = (employee.salary * allocation.housing / 100).toFixed(2);
    $('f-transport').value = (employee.salary * allocation.transport / 100).toFixed(2);
    $('f-otherAllowances').value = (employee.salary * allocation.other / 100).toFixed(2);
    ['meal', 'utility', 'bonus', 'overtime', 'commission', 'arrears', 'otherEarnings'].forEach((key) => { $(`f-${key}`).value = 0; });
    $('f-annualRent').value = employee.annualRent || 0;
    autoCalculate();
  }

  // Applies the 2026 PAYE rules to the itemised earnings, assuming this month's pay recurs for the year.
  function autoCalculate() {
    const v = formValues();
    const gross = sumKeys(v, EARNINGS);
    const pensionable = v.basic + v.housing + v.transport;
    const pension = pensionable * TaxEngine.RULES.employeePensionRate;
    const nhf = v.basic * TaxEngine.RULES.nhfRate;
    const taxable = Math.max(0, gross * 12 - (pension + nhf + v.nhis) * 12 - TaxEngine.rentRelief(v.annualRent));
    $('f-pension').value = pension.toFixed(2);
    $('f-nhf').value = nhf.toFixed(2);
    $('f-paye').value = (TaxEngine.annualTax(taxable).total / 12).toFixed(2);
    $('f-employerPension').value = (pensionable * TaxEngine.RULES.employerPensionRate).toFixed(2);
    if (!num($('f-nsitf').value)) $('f-nsitf').value = (gross * 0.01).toFixed(2);
    updateTotals();
    toast('PAYE, pension and NHF calculated with the 2026 rules.', 'success');
  }

  $('new-record').addEventListener('click', () => openRecord());
  if (!can('payroll:write')) $('new-record').hidden = true;
  $('fill-from-salary').addEventListener('click', fillFromSalary);
  $('auto-calc').addEventListener('click', autoCalculate);
  $('record-form').addEventListener('input', updateTotals);
  $('record-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = formValues();
    if (!values.employeeId) return toast('Choose an employee.', 'error');
    if (!values.period) return toast('Choose the payroll month.', 'error');
    if (sumKeys(values, DEDUCTIONS) > sumKeys(values, EARNINGS) && !(await confirmDialog({ title: 'Deductions exceed gross pay', message: 'Net pay will be negative. Save anyway?', confirmLabel: 'Save anyway', danger: true }))) return;
    $('record-submit').disabled = true;
    try {
      const editing = state.editing;
      const { record } = editing ? await api('PUT', `/api/records/${encodeURIComponent(editing.id)}`, values) : await api('POST', '/api/records', values);
      state.records = editing ? state.records.map((r) => (r.id === record.id ? record : r)) : [record, ...state.records];
      $('record-dialog').close();
      renderAll();
      toast(editing ? (editing.workflowStatus === 'Approved' ? 'Record updated and sent back for review.' : 'Record updated.') : 'Payroll record saved as draft.', 'success');
    } catch (error) { toast(error.message, 'error'); } finally { $('record-submit').disabled = false; }
  });
  $('delete-record').addEventListener('click', async () => {
    const record = state.editing;
    if (!record || !(await confirmDialog({ title: 'Delete this draft?', message: `${record.employeeName} · ${monthLabel(record.period)} will be removed.`, confirmLabel: 'Delete draft', danger: true }))) return;
    try {
      await api('DELETE', `/api/records/${encodeURIComponent(record.id)}`);
      state.records = state.records.filter((r) => r.id !== record.id);
      $('record-dialog').close();
      renderAll();
      toast('Draft deleted.', 'success');
    } catch (error) { toast(error.message, 'error'); }
  });

  // ── Employee report ───────────────────────────────────────
  function renderEmployeeReport() {
    const id = $('rep-employee').value;
    const out = $('employee-report');
    if (!id) { out.innerHTML = `<div class="card">${emptyState('users', 'Choose an employee', 'Pick someone above to see their full payroll history.')}</div>`; return; }
    const employee = state.employees.find((e) => String(e.id) === id);
    const from = $('rep-from').value;
    const to = $('rep-to').value;
    const list = records().filter((r) => String(r.employeeId) === id && (!from || r.period >= from) && (!to || r.period <= to)).sort((a, b) => b.period.localeCompare(a.period));
    const name = employee?.name || list[0]?.employeeName || 'Former employee';
    const totals = list.reduce((sum, r) => ({ gross: sum.gross + r.gross, deductions: sum.deductions + r.deductions, net: sum.net + r.net, paye: sum.paye + num(r.paye) }), { gross: 0, deductions: 0, net: 0, paye: 0 });
    out.innerHTML = `<div class="card card-pad" style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
        <span class="avatar" style="width:56px;height:56px;font-size:18px">${escapeHtml(initials(name))}</span>
        <div style="flex:1;min-width:200px"><h2 style="font-size:20px">${escapeHtml(name)}</h2><p class="hint" style="font-size:13px">${escapeHtml(employee?.title || list[0]?.title || 'Employee')} · ${escapeHtml(employee?.department || list[0]?.department || 'General')}${from || to ? ` · ${escapeHtml(from ? monthLabel(from) : 'start')} – ${escapeHtml(to ? monthLabel(to) : 'today')}` : ''}</p></div>
        ${employee ? `<span class="badge ${employee.status === 'Inactive' ? '' : 'green'}">${escapeHtml(employee.status || 'Active')}</span>` : '<span class="badge">Former employee</span>'}
      </div>
      <div class="stats">
        <div class="stat"><span class="label">Records</span><strong>${list.length}</strong></div>
        <div class="stat"><span class="label">Gross earnings</span><strong>${money(totals.gross)}</strong></div>
        <div class="stat"><span class="label">PAYE paid</span><strong>${money(totals.paye)}</strong></div>
        <div class="stat feature"><span class="label">Total net pay</span><strong>${money(totals.net)}</strong></div>
      </div>
      <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Month</th><th class="num">Basic</th><th class="num">Allowances</th><th class="num">Bonus, overtime &amp; other</th><th class="num">Gross</th><th class="num">PAYE</th><th class="num">Other deductions</th><th class="num">Net</th><th>Payment</th></tr></thead><tbody>
      ${list.length ? list.map((r) => { const allowances = ['housing', 'transport', 'meal', 'utility', 'otherAllowances'].reduce((s, k) => s + num(r[k]), 0); return `<tr><td><strong>${escapeHtml(monthLabel(r.period))}</strong></td><td class="num">${money(r.basic)}</td><td class="num">${money(allowances)}</td><td class="num">${money(r.gross - num(r.basic) - allowances)}</td><td class="num">${money(r.gross)}</td><td class="num">${money(r.paye)}</td><td class="num">${money(r.deductions - num(r.paye))}</td><td class="num"><strong>${signedMoney(r.net)}</strong></td><td>${paymentBadge(r.paymentStatus)}</td></tr>`; }).join('') : `<tr><td colspan="9">${emptyState('file', 'No records in this range', 'Try a wider date range.')}</td></tr>`}
      </tbody></table></div></div>`;
  }
  ['rep-employee', 'rep-from', 'rep-to'].forEach((id) => $(id).addEventListener('input', renderEmployeeReport));

  // ── Company report ────────────────────────────────────────
  function companySelection() {
    const period = $('co-period').value;
    const department = $('co-department').value;
    return records().filter((r) => (!period || r.period === period) && (!department || r.department === department)).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }
  function renderCompanyReport() {
    const list = companySelection();
    const allowancesOf = (r) => ['housing', 'transport', 'meal', 'utility', 'otherAllowances'].reduce((s, k) => s + num(r[k]), 0);
    const extrasOf = (r) => ['bonus', 'overtime', 'commission', 'arrears', 'otherEarnings'].reduce((s, k) => s + num(r[k]), 0);
    const t = list.reduce((sum, r) => ({ basic: sum.basic + num(r.basic), allowances: sum.allowances + allowancesOf(r), extras: sum.extras + extrasOf(r), gross: sum.gross + r.gross, paye: sum.paye + num(r.paye), other: sum.other + r.deductions - num(r.paye), net: sum.net + r.net, employer: sum.employer + r.employerCost }), { basic: 0, allowances: 0, extras: 0, gross: 0, paye: 0, other: 0, net: 0, employer: 0 });
    $('co-print-meta').textContent = `${$('co-period').value ? monthLabel($('co-period').value) : 'All periods'}${$('co-department').value ? ` · ${$('co-department').value}` : ''}`;
    $('co-summary').innerHTML = [['Employees', list.length, 'users'], ['Gross payroll', money(t.gross), 'wallet'], ['PAYE to remit', money(t.paye), 'receipt'], ['Employer contributions', money(t.employer), 'building']].map(([label, value, ic]) => `<div class="stat"><span class="label">${icon(ic)}${label}</span><strong>${value}</strong></div>`).join('') + `<div class="stat feature"><span class="label">${icon('trend')}Net payable</span><strong>${money(t.net)}</strong></div>`;
    $('co-body').innerHTML = list.length ? list.map((r) => `<tr><td><strong>${escapeHtml(r.employeeName)}</strong><small>${escapeHtml(r.title || '')}</small></td><td>${escapeHtml(r.department)}</td><td class="num">${money(r.basic)}</td><td class="num">${money(allowancesOf(r))}</td><td class="num">${money(extrasOf(r))}</td><td class="num">${money(r.gross)}</td><td class="num">${money(r.paye)}</td><td class="num">${money(r.deductions - num(r.paye))}</td><td class="num"><strong>${signedMoney(r.net)}</strong></td><td class="num">${money(r.employerCost)}</td><td>${workflowBadge(r.workflowStatus)}</td></tr>`).join('') : `<tr><td colspan="11">${emptyState('receipt', 'No records for this selection', 'Choose another period or department.')}</td></tr>`;
    $('co-foot').innerHTML = list.length ? `<tr><td colspan="2">Total</td><td class="num">${money(t.basic)}</td><td class="num">${money(t.allowances)}</td><td class="num">${money(t.extras)}</td><td class="num">${money(t.gross)}</td><td class="num">${money(t.paye)}</td><td class="num">${money(t.other)}</td><td class="num">${signedMoney(t.net)}</td><td class="num">${money(t.employer)}</td><td></td></tr>` : '';
  }
  ['co-period', 'co-department'].forEach((id) => $(id).addEventListener('input', renderCompanyReport));
  $('export-csv').addEventListener('click', async () => {
    if (!can('reports:export')) return toast('Your role cannot export reports.', 'error');
    const list = companySelection();
    if (!list.length) return toast('There is nothing to export.', 'info');
    const header = ['Period', 'Employee ID', 'Employee', 'Department', ...EARNINGS.map(([, l]) => l), 'Gross', ...DEDUCTIONS.map(([, l]) => l), 'Total deductions', 'Net pay', ...EMPLOYER.map(([, l]) => l), 'Workflow', 'Payment', 'Payment date', 'Reference'];
    const rows = list.map((r) => [r.period, r.employeeId, r.employeeName, r.department, ...EARNINGS.map(([k]) => num(r[k]).toFixed(2)), r.gross.toFixed(2), ...DEDUCTIONS.map(([k]) => num(r[k]).toFixed(2)), r.deductions.toFixed(2), r.net.toFixed(2), ...EMPLOYER.map(([k]) => num(r[k]).toFixed(2)), r.workflowStatus, r.paymentStatus, r.paymentDate || '', r.reference || '']);
    downloadFile(`payroll-report-${$('co-period').value || 'all'}.csv`, toCsv([header, ...rows]), 'text/csv');
    api('POST', '/api/audit/export', { scope: $('co-period').value || 'All periods' }).then(() => can('audit:read') && loadAudit()).catch(() => {});
  });
  if (!can('reports:export')) $('export-csv').hidden = true;

  // ── Users ─────────────────────────────────────────────────
  const ROLE_NOTES = {
    'Super Administrator': 'Full access, including users, roles and the audit trail.',
    Accountant: 'Records, edits and approves payroll; exports reports.',
    'Payroll Officer': 'Maintains employees and prepares payroll records for approval.',
    'HR Manager': 'Maintains the employee directory and views payroll.',
    Management: 'Read-only access to payroll reports and dashboards.',
    Member: 'Self-registered. Uses the calculators only until given a role.',
  };
  function renderUsers() {
    $('users-body').innerHTML = state.users.map((u) => {
      const self = u.id === user.id;
      return `<tr>
        <td><div class="person"><span class="avatar">${escapeHtml(initials(u.name))}</span><span><strong>${escapeHtml(u.name)}${self ? ' <span class="badge gold" style="margin-left:4px">You</span>' : ''}</strong><small>${escapeHtml(u.email)}${u.department ? ` · ${escapeHtml(u.department)}` : ''}</small></span></div></td>
        <td>${self ? escapeHtml(u.role) : `<select class="input" style="min-height:34px;padding:4px 8px;width:auto" data-role="${escapeHtml(u.id)}" aria-label="Role for ${escapeHtml(u.name)}">${state.roles.map((role) => `<option ${role === u.role ? 'selected' : ''}>${escapeHtml(role)}</option>`).join('')}</select>`}</td>
        <td>${u.active ? '<span class="badge green">Active</span>' : '<span class="badge red">Inactive</span>'}</td>
        <td>${escapeHtml(u.lastActivity ? dateTime(u.lastActivity) : 'Never')}</td>
        <td><div class="row-actions">${self ? '' : `<button class="btn btn-ghost btn-sm" type="button" data-reset="${escapeHtml(u.id)}">Reset password</button><button class="btn ${u.active ? 'btn-danger' : 'btn-ghost'} btn-sm" type="button" data-toggle="${escapeHtml(u.id)}">${u.active ? 'Deactivate' : 'Activate'}</button>`}</div></td></tr>`;
    }).join('');
    $('role-cards').innerHTML = state.roles.map((role) => `<div class="card card-pad"><span class="badge gold">${state.users.filter((u) => u.role === role && u.active).length} active</span><h3 style="font-size:15px;margin:10px 0 4px">${escapeHtml(role)}</h3><p class="hint" style="font-size:13px">${escapeHtml(ROLE_NOTES[role] || '')}</p></div>`).join('');
    $('u-role').innerHTML = state.roles.map((role) => `<option ${role === 'Payroll Officer' ? 'selected' : ''}>${escapeHtml(role)}</option>`).join('');
  }
  async function patchUser(id, body, success) {
    try {
      const { user: updated } = await api('PATCH', `/api/users/${encodeURIComponent(id)}`, body);
      state.users = state.users.map((u) => (u.id === updated.id ? updated : u));
      renderUsers();
      loadAudit();
      toast(success(updated), 'success');
    } catch (error) { toast(error.message, 'error'); renderUsers(); }
  }
  $('users-body').addEventListener('change', (event) => {
    const select = event.target.closest('[data-role]');
    if (select) patchUser(select.dataset.role, { role: select.value }, (u) => `${u.name} is now ${u.role}.`);
  });
  let resetTarget = null;
  $('users-body').addEventListener('click', async (event) => {
    const toggle = event.target.closest('[data-toggle]');
    const reset = event.target.closest('[data-reset]');
    if (toggle) {
      const target = state.users.find((u) => u.id === toggle.dataset.toggle);
      if (target.active && !(await confirmDialog({ title: `Deactivate ${target.name}?`, message: 'They will be signed out immediately and cannot sign in until reactivated.', confirmLabel: 'Deactivate', danger: true }))) return;
      patchUser(target.id, { active: !target.active }, (u) => `${u.name} ${u.active ? 'activated' : 'deactivated'}.`);
    }
    if (reset) {
      resetTarget = state.users.find((u) => u.id === reset.dataset.reset);
      $('password-for').textContent = `${resetTarget.name} · ${resetTarget.email}`;
      $('password-form').reset();
      $('password-dialog').showModal();
    }
  });
  $('password-form').addEventListener('submit', (event) => {
    event.preventDefault();
    $('password-dialog').close();
    patchUser(resetTarget.id, { password: $('new-password').value }, (u) => `Password reset for ${u.name}.`);
  });
  $('new-user').addEventListener('click', () => { $('user-form').reset(); renderUsers(); $('user-dialog').showModal(); });
  $('user-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const { user: created } = await api('POST', '/api/users', { name: $('u-name').value, email: $('u-email').value, department: $('u-department').value, title: $('u-title').value, role: $('u-role').value, password: $('u-password').value });
      state.users.unshift(created);
      $('user-dialog').close();
      renderUsers();
      loadAudit();
      toast(`${created.name} can now sign in as ${created.role}.`, 'success');
    } catch (error) { toast(error.message, 'error'); }
  });
  document.querySelectorAll('dialog [data-close]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));

  // ── Audit ─────────────────────────────────────────────────
  function renderAudit() {
    const query = $('audit-search').value.trim().toLowerCase();
    const list = state.audit.filter((e) => !query || [e.user, e.action, e.affected, e.change].some((v) => String(v || '').toLowerCase().includes(query)));
    $('audit-body').innerHTML = list.length ? list.map((e) => `<tr><td>${escapeHtml(dateTime(e.at))}</td><td>${escapeHtml(e.user)}</td><td><strong>${escapeHtml(e.action)}</strong></td><td>${escapeHtml(e.affected)}</td><td>${escapeHtml(e.change || '—')}</td></tr>`).join('') : `<tr><td colspan="5">${emptyState('clock', 'No audit events', query ? 'Nothing matches this search.' : 'Actions will be recorded here.')}</td></tr>`;
  }
  async function loadAudit() {
    if (!can('audit:read')) return;
    try { state.audit = (await api('GET', '/api/audit')).entries; renderAudit(); } catch (error) { /* shown elsewhere */ }
  }
  $('audit-search').addEventListener('input', renderAudit);

  // ── Load ──────────────────────────────────────────────────
  function renderAll() {
    populateSelects();
    renderDashboard();
    renderRecords();
    renderEmployeeReport();
    renderCompanyReport();
    loadAudit();
  }
  ['dash-period', 'dash-department'].forEach((id) => $(id).addEventListener('input', renderDashboard));

  $('dash-period').value = currentMonth();
  $('co-period').value = currentMonth();
  try {
    const [employees, recs] = await Promise.all([api('GET', '/api/employees'), api('GET', '/api/records')]);
    state.employees = employees.employees;
    state.records = recs.records;
  } catch (error) { toast(error.message, 'error'); }
  renderAll();
  if (can('users:manage')) {
    try { const data = await api('GET', '/api/users'); state.users = data.users; state.roles = data.roles; renderUsers(); } catch (error) { toast(error.message, 'error'); }
    loadAudit();
  }
  const initial = location.hash.slice(1);
  if (initial && document.querySelector(`.tab[data-view="${initial}"]:not(.hidden)`)) showView(initial);
}());
