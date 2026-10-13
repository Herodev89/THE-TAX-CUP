const TAX_BANDS = [
  { amount: 800000, rate: 0 },
  { amount: 2200000, rate: 0.15 },
  { amount: 9000000, rate: 0.18 },
  { amount: 13000000, rate: 0.21 },
  { amount: 25000000, rate: 0.23 },
  { amount: Infinity, rate: 0.25 }
];

const RENT_RELIEF_RATE = 0.2;
const RENT_RELIEF_CAP = 500000;
const state = { mode: 'gross', unit: 'monthly' };
let currentResult;
const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Math.max(0, value));
const numeric = (value) => Number(value) || 0;
const allocationNames = { basic: 'Basic salary', housing: 'Housing allowance', transport: 'Transport allowance', other: 'Other allowances' };
const taxBandNames = ['First ₦800,000', 'Next ₦2,200,000', 'Next ₦9,000,000', 'Next ₦13,000,000', 'Next ₦25,000,000', 'Excess above ₦50,000,000'];

function getAllocations() {
  return Object.fromEntries(Object.keys(allocationNames).map((key) => [key, Math.max(0, numeric(document.querySelector(`[data-allocation="${key}"]`).value))]));
}

function allocationTotal() {
  return Object.values(getAllocations()).reduce((total, percentage) => total + percentage, 0);
}

function updateAllocationStatus() {
  const total = allocationTotal();
  const difference = 100 - total;
  $('allocation-total').textContent = `${total.toFixed(2).replace(/\.00$/, '')}%`;
  $('allocation-status').textContent = Math.abs(difference) < 0.005 ? 'Ready to calculate' : `${Math.abs(difference).toFixed(2).replace(/\.00$/, '')}% ${difference > 0 ? 'remaining' : 'over'}`;
  $('allocation-status').classList.toggle('invalid', Math.abs(difference) >= 0.005);
  $('calculate-button').disabled = Math.abs(difference) >= 0.005;
  return Math.abs(difference) < 0.005;
}

function annualTax(taxableIncome) {
  let remaining = Math.max(0, taxableIncome);
  let tax = 0;
  for (const band of TAX_BANDS) {
    const taxableInBand = Math.min(remaining, band.amount);
    if (taxableInBand <= 0) break;
    tax += taxableInBand * band.rate;
    remaining -= taxableInBand;
  }
  return tax;
}

// CRA = higher of (₦200,000 or 1% of gross annual) + 20% of gross annual
function computeCRA(annualGross) {
  const baseRelief = Math.max(200000, annualGross * 0.01);
  return baseRelief + annualGross * 0.20;
}

function calculate(grossMonthly) {
  const allocations = getAllocations();
  const earnings = Object.fromEntries(Object.keys(allocations).map((key) => [key, grossMonthly * allocations[key] / 100]));
  const pensionablePay = earnings.basic + earnings.housing + earnings.transport;
  const nhfPay = earnings.basic;
  const pension = $('pension').checked ? pensionablePay * 0.08 : 0;
  const nhf = $('nhf').checked ? nhfPay * 0.025 : 0;
  const statutory = numeric($('statutory-deductions').value);
  const other = $('other-deductions').checked ? numeric($('other').value) : 0;
  const annualGross = grossMonthly * 12;
  const annualRent = numeric($('annual-rent').value);
  const rentRelief = Math.min(annualRent * RENT_RELIEF_RATE, RENT_RELIEF_CAP);
  const cra = computeCRA(annualGross);
  const annualTaxable = Math.max(0, annualGross - (pension + nhf) * 12 - rentRelief - cra);
  const paye = annualTax(annualTaxable) / 12;
  const net = Math.max(0, grossMonthly - pension - nhf - paye - statutory - other);
  return { employeeName: $('employee-name').value.trim() || 'Employee salary report', grossMonthly, pension, nhf, statutory, other, paye, net, annualGross, annualPaye: paye * 12, annualRent, rentRelief, cra, allocations, earnings };
}

function grossForNet(targetNet) {
  let low = targetNet;
  let high = targetNet * 2 + 100000;
  while (calculate(high).net < targetNet) high *= 1.5;
  for (let index = 0; index < 60; index += 1) {
    const middle = (low + high) / 2;
    if (calculate(middle).net < targetNet) low = middle;
    else high = middle;
  }
  return calculate(high);
}

function render(result) {
  const headlineValue = state.mode === 'net' ? result.grossMonthly : result.net;
  const displayValue = state.unit === 'annual' ? headlineValue * 12 : headlineValue;
  $('net-result').textContent = money(displayValue);
  $('report-employee').textContent = result.employeeName;
  $('paye-result').textContent = money(result.annualPaye);
  $('gross-result').textContent = money(result.annualGross);
  $('rent-relief-result').textContent = money(result.rentRelief);
  $('statutory-result').textContent = money(result.statutory);
  if ($('cra-result')) $('cra-result').textContent = money(result.cra);
  $('tax-band-list').innerHTML = TAX_BANDS.map((band, index) => `<div class="tax-band-row"><span>${taxBandNames[index]}</span><strong>${(band.rate * 100).toFixed(0)}%</strong></div>`).join('');
  $('gross-legend').textContent = money(result.grossMonthly);
  $('pension-legend').textContent = money(result.pension);
  $('nhf-legend').textContent = money(result.nhf);
  $('tax-legend').textContent = money(result.paye);
  $('statutory-legend').textContent = money(result.statutory);
  $('allowance-list').innerHTML = Object.keys(result.earnings).map((key) => `<div class="allowance-row"><span><i class="allowance-swatch ${key}"></i>${allocationNames[key]} <small>${result.allocations[key]}%</small></span><strong>${money(result.earnings[key])}</strong></div>`).join('');
  const total = Math.max(result.grossMonthly, 1);
  document.querySelector('.gross-bar').style.width = `${(result.net / total) * 100}%`;
  document.querySelector('.pension-bar').style.width = `${(result.pension / total) * 100}%`;
  document.querySelector('.nhf-bar').style.width = `${(result.nhf / total) * 100}%`;
  document.querySelector('.tax-bar').style.width = `${(result.paye / total) * 100}%`;
}

function runCalculation(event) {
  if (event) event.preventDefault();
  if (!updateAllocationStatus()) return;
  const entered = numeric($('salary').value) * (state.unit === 'annual' ? 1 / 12 : 1);
  const result = state.mode === 'net' ? grossForNet(entered) : calculate(entered);
  currentResult = result;
  $('result-label').textContent = state.mode === 'net' ? 'Required gross pay' : 'Estimated net pay';
  $('result-period').textContent = state.unit === 'annual' ? 'annual equivalent' : 'per month';
  $('breakdown-period').textContent = 'Monthly view';
  render(result);
}

document.querySelectorAll('.mode').forEach((button) => button.addEventListener('click', () => {
  state.mode = button.dataset.mode;
  document.querySelectorAll('.mode').forEach((item) => item.classList.toggle('active', item === button));
  document.querySelectorAll('.mode').forEach((item) => item.setAttribute('aria-selected', item === button ? 'true' : 'false'));
  $('salary-label').textContent = state.mode === 'net' ? 'Target net salary' : 'Gross salary';
  $('salary-hint').textContent = state.mode === 'net' ? 'Enter the take-home amount the employee wants to receive.' : "Enter the employee's gross salary before deductions.";
  runCalculation();
}));

document.querySelectorAll('.unit').forEach((button) => button.addEventListener('click', () => {
  state.unit = button.dataset.unit;
  document.querySelectorAll('.unit').forEach((item) => item.classList.toggle('active', item === button));
  $('input-suffix').textContent = state.unit === 'annual' ? '/ year' : '/ month';
  runCalculation();
}));

document.querySelectorAll('.allocation').forEach((input) => input.addEventListener('input', () => {
  updateAllocationStatus();
  if (Math.abs(100 - allocationTotal()) < 0.005) runCalculation();
}));

$('employee-name').addEventListener('input', runCalculation);

$('other-deductions').addEventListener('change', () => $('other-wrap').classList.toggle('hidden', !$('other-deductions').checked));
$('pension').addEventListener('change', runCalculation);
$('nhf').addEventListener('change', runCalculation);
$('annual-rent').addEventListener('input', runCalculation);
$('statutory-deductions').addEventListener('input', runCalculation);
$('other').addEventListener('input', runCalculation);
$('calculator-form').addEventListener('submit', runCalculation);
$('print').addEventListener('click', () => window.print());
const today = new Date();
$('single-payroll-month').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
function singleSnapshot() {
  return { salary: $('salary').value, employeeName: $('employee-name').value, mode: state.mode, unit: state.unit, allocations: getAllocations(), pension: $('pension').checked, nhf: $('nhf').checked, annualRent: $('annual-rent').value, statutory: $('statutory-deductions').value, otherDeductions: $('other-deductions').checked, other: $('other').value };
}
function openSinglePayroll(record) {
  const snapshot = record.snapshot;
  if (!snapshot) {
    $('report-employee').textContent = 'Older record - please recalculate and save again';
    return;
  }
  $('single-payroll-month').value = record.period;
  $('salary').value = snapshot.salary;
  $('employee-name').value = snapshot.employeeName;
  $('pension').checked = snapshot.pension;
  $('nhf').checked = snapshot.nhf;
  $('annual-rent').value = snapshot.annualRent;
  $('statutory-deductions').value = snapshot.statutory || 0;
  $('other-deductions').checked = snapshot.otherDeductions;
  $('other').value = snapshot.other;
  Object.entries(snapshot.allocations).forEach(([key, value]) => { document.querySelector(`[data-allocation="${key}"]`).value = value; });
  state.mode = snapshot.mode;
  state.unit = snapshot.unit;
  document.querySelectorAll('.mode').forEach((item) => { item.classList.toggle('active', item.dataset.mode === state.mode); item.setAttribute('aria-selected', item.dataset.mode === state.mode ? 'true' : 'false'); });
  document.querySelectorAll('.unit').forEach((item) => item.classList.toggle('active', item.dataset.unit === state.unit));
  $('salary-label').textContent = state.mode === 'net' ? 'Target net salary' : 'Gross salary';
  $('salary-hint').textContent = state.mode === 'net' ? 'Enter the take-home amount the employee wants to receive.' : "Enter the employee's gross salary before deductions.";
  $('input-suffix').textContent = state.unit === 'annual' ? '/ year' : '/ month';
  $('other-wrap').classList.toggle('hidden', !snapshot.otherDeductions);
  runCalculation();
}
function navigateToSinglePayroll(record) {
  window.location.href = `${window.location.pathname}?payroll=${encodeURIComponent(record.id)}`;
}
const singleArchive = { type: 'single', search: $('single-archive-search'), list: $('single-archive-list'), empty: $('single-archive-empty'), onOpen: navigateToSinglePayroll };
$('single-archive-search').addEventListener('input', () => archiveRender(singleArchive));
$('save-single-payroll').addEventListener('click', () => {
  if (!currentResult || !$('single-payroll-month').value) return;
  archiveAdd({ type: 'single', period: $('single-payroll-month').value, title: `${currentResult.employeeName} payroll`, employeeName: currentResult.employeeName, count: 1, totalNet: currentResult.net, snapshot: singleSnapshot() });
  archiveRender(singleArchive);
});
runCalculation();
archiveRender(singleArchive);
const savedSingleId = new URLSearchParams(window.location.search).get('payroll');
const savedSingleRecord = archiveLoad().find((record) => String(record.id) === savedSingleId && record.type === 'single');
if (savedSingleRecord) openSinglePayroll(savedSingleRecord);

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

