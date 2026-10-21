(async function () {
  const { $, money, percent, escapeHtml, api, toast, confirmDialog, emptyState, monthLabel, monthParts, currentMonth, icon } = TC;
  const user = await TC.boot();
  const canSave = user.permissions.includes('calc:write');
  const state = { mode: 'gross', unit: 'monthly', result: null, archive: [] };
  const KEYS = ['basic', 'housing', 'transport', 'other'];
  const NAMES = { basic: 'Basic salary', housing: 'Housing allowance', transport: 'Transport allowance', other: 'Other allowances' };

  const allocation = () => Object.fromEntries(KEYS.map((key) => [key, Math.max(0, Number(document.querySelector(`[data-allocation="${key}"]`).value) || 0)]));

  function options() {
    return {
      allocation: allocation(),
      pension: $('pension').checked,
      nhf: $('nhf').checked,
      annualRent: $('annual-rent').value,
      nhisRate: $('nhis-rate').value,
      otherStatutory: $('statutory').value,
      otherDeductions: $('other').value,
    };
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

  function row(label, value, extra = '') {
    return `<div class="kv-row ${extra}"><span>${label}</span><strong>${value}</strong></div>`;
  }

  function render() {
    if (!renderAllocation()) return;
    const entered = (Number($('salary').value) || 0) / (state.unit === 'annual' ? 12 : 1);
    const result = state.mode === 'net' ? TaxEngine.grossForNet(entered, options()) : TaxEngine.compute(entered, options());
    state.result = result;
    const factor = state.unit === 'annual' ? 12 : 1;
    const name = $('employee-name').value.trim();

    $('report-name').textContent = name ? `Salary report for ${name}` : 'Employee salary report';
    $('result-label').textContent = state.mode === 'net' ? 'Required gross salary' : 'Estimated net pay';
    $('result-value').textContent = money((state.mode === 'net' ? result.gross : result.net) * factor);
    $('result-sub').textContent = state.mode === 'net'
      ? `${state.unit === 'annual' ? 'per year' : 'per month'} to take home ${money(result.net * factor)}`
      : `${state.unit === 'annual' ? 'per year' : 'per month'} from ${money(result.gross * factor)} gross`;
    $('chip-paye').textContent = money(result.paye);
    $('chip-rate').textContent = percent(result.effectiveRate);
    $('chip-gross').textContent = money(result.annualGross);
    $('print-meta').textContent = `${name || 'Employee'} · ${monthLabel($('archive-month').value)}`;

    const total = Math.max(result.gross, 1);
    const otherDed = result.nhis + result.otherStatutory + result.otherDeductions;
    const slices = [['net', 'Net pay', result.net], ['paye', 'PAYE', result.paye], ['pension', 'Pension', result.pension], ['nhf', 'NHF', result.nhf], ['otherded', 'Other deductions', otherDed]];
    $('pay-bar').innerHTML = slices.map(([key, , value]) => `<i class="c-${key}" style="width:${(value / total) * 100}%"></i>`).join('');
    $('pay-legend').innerHTML = slices.map(([key, label, value]) => `<span><i class="swatch c-${key}"></i>${label}<b>${money(value)}</b></span>`).join('');

    $('payslip').innerHTML = [
      ...KEYS.map((key) => row(`<i class="swatch c-${key}"></i>${NAMES[key]} <small>${allocation()[key]}%</small>`, money(result.earnings[key]))),
      row('<b>Gross pay</b>', money(result.gross), 'total'),
      row('PAYE tax', `−${money(result.paye)}`, 'minus'),
      row('Pension (8%)', `−${money(result.pension)}`, 'minus'),
      row('NHF (2.5%)', `−${money(result.nhf)}`, 'minus'),
      result.nhis ? row('NHIS', `−${money(result.nhis)}`, 'minus') : '',
      result.otherStatutory ? row('Other statutory', `−${money(result.otherStatutory)}`, 'minus') : '',
      result.otherDeductions ? row('Loans &amp; other', `−${money(result.otherDeductions)}`, 'minus') : '',
      row('<b>Net pay</b>', money(result.net), 'total'),
    ].join('');

    $('annual').innerHTML = [
      row('Annual gross income', money(result.annualGross)),
      row('Pension, NHF &amp; NHIS', `−${money((result.pension + result.nhf + result.nhis) * 12)}`),
      row(`Rent relief <small>20% of ${money(result.annualRent)}</small>`, `−${money(result.rentRelief)}`),
      row('<b>Taxable income</b>', money(result.annualTaxable), 'total'),
      row('Annual PAYE', money(result.annualPaye)),
      row('Effective tax rate', percent(result.effectiveRate)),
    ].join('');

    const maxTaxable = Math.max(...result.bands.map((band) => band.taxable), 1);
    $('band-list').innerHTML = result.bands.map((band) => `<div class="band ${band.taxable ? '' : 'idle'}"><span class="name">${band.label}</span><span class="rate">${Math.round(band.rate * 100)}%</span><span class="tax">${money(band.tax)}</span><span class="track"><i style="width:${(band.taxable / maxTaxable) * 100}%"></i></span></div>`).join('')
      + `<div class="kv-row total" style="margin-top:6px"><span>Total annual PAYE</span><strong>${money(result.annualPaye)}</strong></div>`;

    $('employer').innerHTML = [
      row('Gross salary', money(result.gross)),
      row('Employer pension <small>10% of basic + housing + transport</small>', money(result.employer.pension)),
      row('<b>Monthly cost to company</b>', money(result.costToCompany), 'total'),
    ].join('');
  }

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll('[data-mode]').forEach((button) => { button.classList.toggle('active', button.dataset.mode === mode); button.setAttribute('aria-selected', String(button.dataset.mode === mode)); });
    $('salary-label').textContent = mode === 'net' ? 'Target take-home pay' : 'Gross salary';
    $('salary-hint').textContent = mode === 'net' ? 'The net amount the employee should receive.' : 'Total earnings before any deductions.';
  }

  function setUnit(unit) {
    state.unit = unit;
    document.querySelectorAll('[data-unit]').forEach((button) => button.classList.toggle('active', button.dataset.unit === unit));
    $('salary-suffix').textContent = unit === 'annual' ? '/ year' : '/ month';
    $('period-label').textContent = 'Monthly';
  }

  document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => { setMode(button.dataset.mode); render(); }));
  document.querySelectorAll('[data-unit]').forEach((button) => button.addEventListener('click', () => {
    if (state.unit === button.dataset.unit) return;
    const value = Number($('salary').value) || 0;
    $('salary').value = Math.round(button.dataset.unit === 'annual' ? value * 12 : value / 12);
    setUnit(button.dataset.unit);
    render();
  }));
  $('calc-form').addEventListener('input', render);
  $('calc-form').addEventListener('submit', (event) => { event.preventDefault(); render(); });
  $('reset-allocation').addEventListener('click', () => { Object.entries(TaxEngine.DEFAULT_ALLOCATION).forEach(([key, value]) => { document.querySelector(`[data-allocation="${key}"]`).value = value; }); render(); });
  $('print-btn').addEventListener('click', () => window.print());

  // ── Saved calculations ────────────────────────────────────
  function snapshot() {
    return { salary: $('salary').value, employeeName: $('employee-name').value, mode: state.mode, unit: state.unit, allocations: allocation(), pension: $('pension').checked, nhf: $('nhf').checked, annualRent: $('annual-rent').value, nhisRate: $('nhis-rate').value, statutory: $('statutory').value, other: $('other').value };
  }

  function restore(item) {
    const s = item.snapshot;
    if (!s) return toast('This older record has no saved inputs. Recalculate and save it again.', 'error');
    $('archive-month').value = item.period;
    $('salary').value = s.salary;
    $('employee-name').value = s.employeeName || '';
    $('pension').checked = s.pension !== false;
    $('nhf').checked = s.nhf !== false;
    $('annual-rent').value = s.annualRent || 0;
    $('nhis-rate').value = s.nhisRate || 0;
    $('statutory').value = s.statutory || 0;
    $('other').value = s.otherDeductions === false ? 0 : (s.other || 0);
    Object.entries(s.allocations || {}).forEach(([key, value]) => { const input = document.querySelector(`[data-allocation="${key}"]`); if (input) input.value = value; });
    setMode(s.mode || 'gross');
    setUnit(s.unit || 'monthly');
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast(`Opened ${item.title} for ${monthLabel(item.period)}.`, 'success');
  }

  function renderArchive() {
    const query = $('archive-search').value.trim().toLowerCase();
    const items = state.archive.filter((item) => !query || [item.title, item.employeeName, item.period, monthLabel(item.period)].some((value) => String(value || '').toLowerCase().includes(query)));
    const list = $('archive-list');
    if (!items.length) {
      list.innerHTML = emptyState('file', state.archive.length ? 'No matches' : 'No saved calculations yet', state.archive.length ? 'Try a different name or month.' : 'Calculate a salary, pick the payroll month and save it here.');
      return;
    }
    list.innerHTML = items.map((item) => {
      const { month, year } = monthParts(item.period);
      return `<div class="list-item"><span class="cal-icon"><span><b>${escapeHtml(month)}</b><small>${escapeHtml(year)}</small></span></span>
        <button class="grow" type="button" data-open="${escapeHtml(item.id)}"><strong>${escapeHtml(item.employeeName || item.title)}</strong><small>${escapeHtml(monthLabel(item.period))} · saved by ${escapeHtml(item.savedBy || '—')}</small></button>
        <span class="amount">${money(item.totalNet)}<small>net / month</small></span>
        ${canSave ? `<button class="icon-btn" type="button" data-delete="${escapeHtml(item.id)}" title="Delete" aria-label="Delete saved calculation">${icon('trash')}</button>` : ''}</div>`;
    }).join('');
  }

  async function loadArchive() {
    try {
      state.archive = (await api('GET', '/api/archive?type=single')).items;
    } catch (error) {
      state.archive = [];
      if (error.status !== 403) toast(error.message, 'error');
    }
    renderArchive();
    const requested = new URLSearchParams(location.search).get('payroll');
    const match = requested && state.archive.find((item) => String(item.id) === requested);
    if (match) restore(match);
  }

  $('archive-list').addEventListener('click', async (event) => {
    const open = event.target.closest('[data-open]');
    const del = event.target.closest('[data-delete]');
    if (open) restore(state.archive.find((item) => String(item.id) === open.dataset.open));
    if (del) {
      const item = state.archive.find((entry) => String(entry.id) === del.dataset.delete);
      if (!item || !(await confirmDialog({ title: 'Delete saved calculation?', message: `${item.employeeName || item.title} — ${monthLabel(item.period)} will be removed for everyone.`, confirmLabel: 'Delete', danger: true }))) return;
      try { await api('DELETE', `/api/archive/${encodeURIComponent(item.id)}`); state.archive = state.archive.filter((entry) => entry !== item); renderArchive(); toast('Calculation deleted.', 'success'); } catch (error) { toast(error.message, 'error'); }
    }
  });
  $('archive-search').addEventListener('input', renderArchive);
  $('archive-save').addEventListener('click', async () => {
    if (!state.result) return toast('Balance the salary structure to 100% first.', 'error');
    if (!$('archive-month').value) return toast('Choose the payroll month.', 'error');
    const name = $('employee-name').value.trim() || 'Unnamed employee';
    try {
      const { item } = await api('POST', '/api/archive', { type: 'single', period: $('archive-month').value, title: `${name} payroll`, employeeName: name, count: 1, totalNet: state.result.net, snapshot: snapshot() });
      state.archive.unshift(item);
      renderArchive();
      toast(`Saved ${name} for ${monthLabel(item.period)}.`, 'success');
    } catch (error) { toast(error.message, 'error'); }
  });
  if (!canSave) $('archive-save').disabled = true;

  $('archive-month').value = currentMonth();
  render();
  loadArchive();
}());
