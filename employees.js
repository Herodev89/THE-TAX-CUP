// ── Tax bands (Schedule 6 · 2026 Tax Act) ──────────────────────────────────
const TAX_BANDS = [
  { amount: 800000, rate: 0 },
  { amount: 2200000, rate: 0.15 },
  { amount: 9000000, rate: 0.18 },
  { amount: 13000000, rate: 0.21 },
  { amount: 25000000, rate: 0.23 },
  { amount: Infinity, rate: 0.25 },
];

// ── Shared employee store key (unified with company.html / payroll.html) ────
const EMPLOYEE_STORE_KEY = 'tax-cup-employees';

const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Math.max(0, value));
const number = (value) => Number(value) || 0;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

// ── Persist/load employees from unified localStorage store ──────────────────
function loadEmployees() {
  try {
    const stored = JSON.parse(localStorage.getItem(EMPLOYEE_STORE_KEY) || '[]');
    if (Array.isArray(stored) && stored.length > 0) {
      // Map company store format → batch calculator format
      return stored.map((e) => ({
        id: e.id,
        name: e.name || '',
        salary: number(e.salary),
        annualRent: number(e.annualRent || 0),
      }));
    }
  } catch (err) { /* ignore */ }
  return [{ id: 1, name: '', salary: 500000, annualRent: 0 }];
}

function saveEmployees() {
  // Merge back into unified store (preserve fields like role/department if present)
  try {
    const stored = JSON.parse(localStorage.getItem(EMPLOYEE_STORE_KEY) || '[]');
    const updated = employees.map((batchEmp) => {
      const existing = stored.find((s) => String(s.id) === String(batchEmp.id)) || {};
      return { ...existing, id: batchEmp.id, name: batchEmp.name, salary: batchEmp.salary, annualRent: batchEmp.annualRent };
    });
    localStorage.setItem(EMPLOYEE_STORE_KEY, JSON.stringify(updated));
  } catch (err) { /* ignore */ }
}

// ── Inject rent column header ───────────────────────────────────────────────
const rentLayoutStyle = document.createElement('style');
rentLayoutStyle.textContent = '.employee-head,.employee-row{grid-template-columns:1.4fr 1fr 1fr 35px}.employee-row .row-money{min-width:0}';
document.head.appendChild(rentLayoutStyle);

let employees = loadEmployees();
const employeeHead = document.querySelector('.employee-head');
if (employeeHead) {
  const resultHead = employeeHead.querySelector('span:nth-child(3)');
  const rentHead = document.createElement('span');
  rentHead.textContent = 'Annual rent';
  employeeHead.insertBefore(rentHead, resultHead);
}
const resultsHead = document.querySelector('#results-body')?.closest('table')?.querySelector('thead tr');
if (resultsHead) {
  const payeHead = [...resultsHead.children].find((cell) => cell.textContent === 'PAYE');
  const rentHead = document.createElement('th');
  rentHead.textContent = 'Rent relief';
  resultsHead.insertBefore(rentHead, payeHead);
}

// ── CRA calculation ─────────────────────────────────────────────────────────
// CRA = higher of (₦200,000 or 1% of annual gross) + 20% of annual gross
function computeCRA(annualGross) {
  return Math.max(200000, annualGross * 0.01) + annualGross * 0.20;
}

// ── Tax computation ─────────────────────────────────────────────────────────
function tax(income) {
  let remaining = Math.max(0, income);
  let total = 0;
  for (const band of TAX_BANDS) {
    const portion = Math.min(remaining, band.amount);
    if (portion <= 0) break;
    total += portion * band.rate;
    remaining -= portion;
  }
  return total;
}

// ── Salary allocation settings ──────────────────────────────────────────────
function allocations() {
  return Object.fromEntries([...document.querySelectorAll('.allocation')].map((input) => [input.dataset.key, Math.max(0, number(input.value))]));
}

function validAllocation() {
  const total = Object.values(allocations()).reduce((sum, value) => sum + value, 0);
  $('allocation-total').textContent = `${total.toFixed(2).replace(/\.00$/, '')}%`;
  const valid = Math.abs(total - 100) < 0.005;
  $('allocation-status').textContent = valid ? 'Ready to calculate' : `${Math.abs(100 - total).toFixed(2).replace(/\.00$/, '')}% ${total < 100 ? 'remaining' : 'over'}`;
  $('allocation-status').classList.toggle('invalid', !valid);
  return valid;
}

// ── Per-employee calculation (with CRA + other deductions fix) ──────────────
function calculate(grossMonthly, employee) {
  const parts = allocations();
  const basic = grossMonthly * parts.basic / 100;
  const housing = grossMonthly * parts.housing / 100;
  const transport = grossMonthly * parts.transport / 100;
  const other = grossMonthly * parts.other / 100;
  const pension = $('shared-pension').checked ? (basic + housing + transport) * 0.08 : 0;
  const nhf = $('shared-nhf').checked ? basic * 0.025 : 0;
  const annualRent = number(employee?.annualRent);
  const rentRelief = Math.min(annualRent * 0.2, 500000);
  const annualGross = grossMonthly * 12;
  const cra = computeCRA(annualGross);
  const taxableAnnual = Math.max(0, annualGross - (pension + nhf) * 12 - rentRelief - cra);
  const paye = tax(taxableAnnual) / 12;
  const net = Math.max(0, grossMonthly - paye - pension - nhf);
  return { gross: grossMonthly, basic, housing, transport, other, annualRent, paye, pension, nhf, net, rentRelief, cra };
}

function grossForNet(target, employee) {
  let low = target;
  let high = target * 2 + 100000;
  while (calculate(high, employee).net < target) high *= 1.5;
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    if (calculate(mid, employee).net < target) low = mid;
    else high = mid;
  }
  return calculate(high, employee);
}

// ── Render employee input rows ───────────────────────────────────────────────
function renderInputs() {
  const container = $('employee-rows');
  container.innerHTML = employees.map((employee) => `<div class="employee-row" data-id="${escapeHtml(employee.id)}"><input class="employee-name" type="text" placeholder="Employee full name" value="${escapeHtml(employee.name)}"><div class="row-money"><span>₦</span><input class="employee-salary" type="number" step="any" value="${escapeHtml(employee.salary)}"></div><div class="row-money"><span>₦</span><input class="employee-rent" type="number" min="0" step="any" placeholder="Annual rent" value="${escapeHtml(employee.annualRent || 0)}"></div><button class="remove-employee" type="button" title="Remove employee">×</button></div>`).join('');
  $('empty-state').classList.toggle('hidden', employees.length > 0);
  document.querySelectorAll('.employee-name').forEach((input) => input.addEventListener('input', updateEmployee));
  document.querySelectorAll('.employee-salary,.employee-rent').forEach((input) => input.addEventListener('input', updateEmployee));
  document.querySelectorAll('.remove-employee').forEach((button) => button.addEventListener('click', removeEmployee));
}

function updateEmployee(event) {
  const row = event.target.closest('.employee-row');
  const employee = employees.find((item) => String(item.id) === row.dataset.id);
  if (!employee) return;
  if (event.target.classList.contains('employee-name')) employee.name = event.target.value;
  else if (event.target.classList.contains('employee-rent')) employee.annualRent = number(event.target.value);
  else employee.salary = number(event.target.value);
  saveEmployees();
  calculateAll();
}

function removeEmployee(event) {
  employees = employees.filter((item) => String(item.id) !== event.target.closest('.employee-row').dataset.id);
  saveEmployees();
  renderInputs();
  calculateAll();
}

// ── Batch calculation & results render ──────────────────────────────────────
function calculateAll() {
  if (!validAllocation()) {
    $('results-body').innerHTML = '';
    $('report-summary').textContent = 'Complete the allocation to 100% before calculating';
    return;
  }
  const mode = $('batch-mode').value;
  const unit = $('batch-unit').value;
  const results = employees.map((employee) => ({
    employee,
    result: mode === 'net'
      ? grossForNet(employee.salary * (unit === 'annual' ? 1 / 12 : 1), employee)
      : calculate(employee.salary * (unit === 'annual' ? 1 / 12 : 1), employee),
  }));
  $('results-body').innerHTML = results.map(({ employee, result }) => `<tr><td>${escapeHtml(employee.name || 'Unnamed employee')}</td><td>${money(result.gross)}</td><td>${money(result.basic)}</td><td>${money(result.housing)}</td><td>${money(result.transport)}</td><td>${money(result.other)}</td><td>${money(result.rentRelief)}</td><td>${money(result.paye)}</td><td>${money(result.pension)}</td><td>${money(result.nhf)}</td><td><strong>${money(result.net)}</strong></td></tr>`).join('');
  $('total-net').textContent = money(results.reduce((sum, item) => sum + item.result.net, 0));
  $('report-summary').textContent = `${results.length} employee${results.length === 1 ? '' : 's'} / ${mode === 'net' ? 'net targets to gross' : 'gross to net'} / ${unit}`;
}

// ── Event listeners ──────────────────────────────────────────────────────────
$('add-employee').addEventListener('click', () => {
  employees.push({ id: Date.now(), name: '', salary: 0, annualRent: 0 });
  saveEmployees();
  renderInputs();
  document.querySelector('.employee-row:last-child .employee-name').focus();
});
document.querySelectorAll('.allocation').forEach((input) => input.addEventListener('input', calculateAll));
$('shared-rent').addEventListener('input', calculateAll);
$('shared-pension').addEventListener('change', calculateAll);
$('shared-nhf').addEventListener('change', calculateAll);
$('batch-mode').addEventListener('change', calculateAll);
$('batch-unit').addEventListener('change', () => {
  $('salary-column').textContent = $('batch-mode').value === 'net'
    ? `Target net / ${$('batch-unit').value}`
    : `Gross salary / ${$('batch-unit').value}`;
  calculateAll();
});
$('print').addEventListener('click', () => window.print());

// ── Archive ──────────────────────────────────────────────────────────────────
renderInputs();
calculateAll();
const today = new Date();
$('batch-payroll-month').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

function batchSnapshot() {
  return {
    employees: employees.map((employee) => ({ ...employee })),
    allocations: allocations(),
    rent: $('shared-rent').value,
    pension: $('shared-pension').checked,
    nhf: $('shared-nhf').checked,
    mode: $('batch-mode').value,
    unit: $('batch-unit').value,
  };
}

function openBatchPayroll(record) {
  const snapshot = record.snapshot;
  if (!snapshot) {
    $('report-summary').textContent = 'Older record - please recalculate and save again';
    return;
  }
  $('batch-payroll-month').value = record.period;
  employees = snapshot.employees.map((employee) => ({ ...employee }));
  Object.entries(snapshot.allocations).forEach(([key, value]) => {
    const input = document.querySelector(`[data-key="${key}"]`);
    if (input) input.value = value;
  });
  $('shared-rent').value = snapshot.rent;
  $('shared-pension').checked = snapshot.pension;
  $('shared-nhf').checked = snapshot.nhf;
  $('batch-mode').value = snapshot.mode;
  $('batch-unit').value = snapshot.unit;
  $('salary-column').textContent = snapshot.mode === 'net' ? `Target net / ${snapshot.unit}` : `Gross salary / ${snapshot.unit}`;
  renderInputs();
  calculateAll();
}

function navigateToBatchPayroll(record) {
  window.location.href = `${window.location.pathname}?payroll=${encodeURIComponent(record.id)}`;
}

const batchArchive = {
  type: 'batch',
  search: $('batch-archive-search'),
  list: $('batch-archive-list'),
  empty: $('batch-archive-empty'),
  onOpen: navigateToBatchPayroll,
};

$('batch-archive-search').addEventListener('input', () => archiveRender(batchArchive));
$('save-batch-payroll').addEventListener('click', () => {
  if (!employees.length || !validAllocation() || !$('batch-payroll-month').value) return;
  const mode = $('batch-mode').value;
  const unit = $('batch-unit').value;
  const results = employees.map((employee) => ({
    employee,
    result: mode === 'net' ? grossForNet(employee.salary * (unit === 'annual' ? 1 / 12 : 1), employee) : calculate(employee.salary * (unit === 'annual' ? 1 / 12 : 1), employee),
  }));
  archiveAdd({
    type: 'batch',
    period: $('batch-payroll-month').value,
    title: 'Team payroll',
    count: results.length,
    totalNet: results.reduce((sum, item) => sum + item.result.net, 0),
    snapshot: batchSnapshot(),
  });
  archiveRender(batchArchive);
});

archiveRender(batchArchive);
const savedBatchId = new URLSearchParams(window.location.search).get('payroll');
const savedBatchRecord = archiveLoad().find((record) => String(record.id) === savedBatchId && record.type === 'batch');
if (savedBatchRecord) openBatchPayroll(savedBatchRecord);

// ── Sign-out ────────────────────────────────────────────────────────────────
const navLogout = document.getElementById('nav-logout');
if (navLogout) {
  navLogout.addEventListener('click', async (event) => {
    event.preventDefault();
    try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); }
    finally {
      localStorage.removeItem('tax-cup-current-user');
      localStorage.removeItem('tax-cup-current-role');
      window.location.href = 'login.html';
    }
  });
}