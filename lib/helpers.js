const crypto = require('crypto');

const EARNING_KEYS = [
  'basic', 'housing', 'transport', 'meal', 'utility',
  'otherAllowances', 'bonus', 'overtime', 'commission', 'arrears', 'otherEarnings'
];
const DEDUCTION_KEYS = [
  'paye', 'pension', 'nhf', 'nhis', 'loan', 'advance', 'absence', 'otherDeductions'
];
const EMPLOYER_KEYS = ['employerPension', 'nsitf', 'itf'];
const WORKFLOW = ['Draft', 'Under Review', 'Approved', 'Finalized', 'Paid'];
const LOCKED_STATES = new Set(['Finalized', 'Paid']);
const ALLOWED_REDIRECTS = new Set(['index.html', 'employees.html', 'company.html', 'payroll.html']);

const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);

const amount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
};

const isMonth = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));

const newId = (prefix) => `${prefix}-${crypto.randomUUID()}`;

const totalOf = (record, keys) => keys.reduce((sum, key) => sum + amount(record?.[key]), 0);

function cleanEmployee(body, existing = {}) {
  return {
    ...existing,
    name: text(body.name ?? existing.name, 120),
    department: text(body.department ?? existing.department, 120) || 'General',
    title: text(body.title ?? existing.title, 120) || 'Employee',
    salary: amount(body.salary ?? existing.salary),
    annualRent: amount(body.annualRent ?? existing.annualRent),
    status: ['Active', 'Inactive'].includes(body.status) ? body.status : (existing.status || 'Active'),
  };
}

function cleanRecord(body, employee) {
  const record = {
    employeeId: String(employee.id),
    employeeName: employee.name,
    department: employee.department || '',
    title: employee.title || '',
    period: body.period,
    annualRent: amount(body.annualRent),
    paymentStatus: ['Pending', 'Paid', 'Failed'].includes(body.paymentStatus) ? body.paymentStatus : 'Pending',
    paymentDate: /^\d{4}-\d{2}-\d{2}$/.test(String(body.paymentDate || '')) ? body.paymentDate : '',
    reference: text(body.reference, 120),
    remarks: text(body.remarks, 1000),
  };
  [...EARNING_KEYS, ...DEDUCTION_KEYS, ...EMPLOYER_KEYS].forEach((key) => {
    record[key] = amount(body[key]);
  });
  return record;
}

module.exports = {
  EARNING_KEYS,
  DEDUCTION_KEYS,
  EMPLOYER_KEYS,
  WORKFLOW,
  LOCKED_STATES,
  ALLOWED_REDIRECTS,
  text,
  amount,
  isMonth,
  newId,
  totalOf,
  cleanEmployee,
  cleanRecord,
};
