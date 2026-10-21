const express = require('express');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const store = require('./lib/store');

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const publicDir = path.join(__dirname, 'public');
const isProduction = process.env.NODE_ENV === 'production';
const SESSION_COOKIE = 'taxcup_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const MIN_PASSWORD_LENGTH = 8;
const DEMO_EMAIL = 'admin@taxcup.local';
const demoEnabled = !isProduction && process.env.DEMO_MODE !== 'false';

// ── Configuration ────────────────────────────────────────────────────────────
function loadSessionSecret() {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv) {
    if (fromEnv.length < 32) return { error: `SESSION_SECRET is only ${fromEnv.length} characters long. It must be at least 32 characters.` };
    return { secret: fromEnv };
  }
  if (isProduction) return { error: 'SESSION_SECRET is not set. Production needs it so every server instance signs sign-in sessions with the same key.' };
  return { secret: store.readOrCreateSecret() };
}
const { secret: sessionSecret, error: configError } = loadSessionSecret();

// Without a valid secret nobody can sign in safely, so explain the fix instead of crashing.
if (configError) {
  console.error(`[config] ${configError}`);
  app.use((req, res) => {
    res.status(503).setHeader('Cache-Control', 'no-store');
    if (req.path.startsWith('/api/')) return res.json({ ok: false, message: `Server not configured: ${configError}` });
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Setup needed · The Tax Cup</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F7F3EC;font:16px/1.6 system-ui,sans-serif;color:#3E372F}main{max-width:560px;margin:24px;padding:36px;background:#fff;border:1px solid #ECE4D6;border-radius:18px}h1{margin:0 0 8px;color:#1A1612;font-size:24px}b{color:#8A6418}code{background:#F4EEE3;padding:2px 6px;border-radius:6px}ol{padding-left:20px}</style></head>
<body><main><h1>The Tax Cup needs one more setting</h1><p><b>${configError.replace(/[<>&]/g, '')}</b></p><ol><li>Open your hosting dashboard (on Vercel: <em>Project → Settings → Environment Variables</em>).</li><li>Add <code>SESSION_SECRET</code> with a random value of 32+ characters.</li><li>Also add <code>ADMIN_EMAIL</code> and <code>ADMIN_PASSWORD</code> for the first administrator.</li><li>Redeploy.</li></ol></main></body></html>`);
  });
}

if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
else if (process.env.VERCEL) app.set('trust proxy', 1);

// ── Roles & permissions (enforced on the server) ─────────────────────────────
const ROLES = {
  'Super Administrator': ['*'],
  'HR Manager': ['employees:read', 'employees:write', 'payroll:read', 'reports:read', 'calc:write'],
  Accountant: ['employees:read', 'payroll:read', 'payroll:write', 'payroll:approve', 'reports:read', 'reports:export', 'calc:write'],
  'Payroll Officer': ['employees:read', 'employees:write', 'payroll:read', 'payroll:write', 'reports:read', 'reports:export', 'calc:write'],
  Management: ['employees:read', 'payroll:read', 'reports:read'],
};
const ALL_PERMISSIONS = ['employees:read', 'employees:write', 'payroll:read', 'payroll:write', 'payroll:approve', 'reports:read', 'reports:export', 'calc:write', 'users:manage', 'audit:read'];

function permissionsFor(role) {
  const granted = ROLES[role] || [];
  return granted.includes('*') ? ALL_PERMISSIONS : granted;
}

function can(user, permission) {
  return permissionsFor(user?.role).includes(permission);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const amount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
};
const isMonth = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
const newId = (prefix) => `${prefix}-${crypto.randomUUID()}`;

function publicUser(user) {
  const { id, name, email, department, title, role, active, createdAt, lastActivity } = user;
  return { id, name, email, department, title, role, active: active !== false, createdAt, lastActivity, permissions: permissionsFor(role) };
}

function hashPassword(value) {
  return bcrypt.hashSync(String(value), 10);
}

function verifyPassword(plain, storedHash) {
  if (!storedHash || !plain) return false;
  if (storedHash.startsWith('$2')) return bcrypt.compareSync(String(plain), storedHash);
  // Legacy unsalted SHA-256 hashes are upgraded to bcrypt on the next successful login.
  const sha = Buffer.from(crypto.createHash('sha256').update(String(plain)).digest('hex'));
  const stored = Buffer.from(String(storedHash));
  return sha.length === stored.length && crypto.timingSafeEqual(sha, stored);
}

function audit(actor, action, affected, change = '') {
  const entries = store.list('audit');
  entries.unshift({ id: newId('AUD'), at: new Date().toISOString(), userId: actor?.id || null, user: actor ? `${actor.name} (${actor.role})` : 'System', action, affected: text(affected, 300), change: text(change, 300) });
  store.save('audit', entries.slice(0, 5000));
}

// Wraps handlers so storage failures surface as a clear 503 instead of a fake success.
const handle = (fn) => (req, res, next) => {
  try {
    fn(req, res, next);
  } catch (error) {
    if (error instanceof store.StorageError) return res.status(503).json({ ok: false, message: error.message });
    next(error);
  }
};

// ── Bootstrap accounts ───────────────────────────────────────────────────────
function bootstrapUsers() {
  const users = store.list('users');
  const adminEmail = text(process.env.ADMIN_EMAIL).toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  const demoIndex = users.findIndex((user) => user.email === DEMO_EMAIL);

  // Never leave the well-known demo password usable outside local demo mode.
  if (!demoEnabled && demoIndex !== -1 && users[demoIndex].active !== false && verifyPassword('demo-password', users[demoIndex].passwordHash)) {
    users[demoIndex].active = false;
    users[demoIndex].sessionVersion = (users[demoIndex].sessionVersion || 0) + 1;
    store.save('users', users, { memoryFallback: true });
    console.warn(`Disabled ${DEMO_EMAIL} because it still uses the public demo password.`);
  }

  const hasActiveAdmin = users.some((user) => user.active !== false && user.role === 'Super Administrator');
  if (!hasActiveAdmin && adminEmail && adminPassword && !users.some((user) => user.email?.toLowerCase() === adminEmail)) {
    users.push({ id: newId('USR'), name: text(process.env.ADMIN_NAME) || 'Administrator', email: adminEmail, department: 'Finance', title: 'System administrator', role: 'Super Administrator', passwordHash: hashPassword(adminPassword), sessionVersion: 0, active: true, createdAt: new Date().toISOString(), lastActivity: null });
    store.save('users', users, { memoryFallback: true });
    console.log(`Created administrator ${adminEmail} from ADMIN_EMAIL / ADMIN_PASSWORD.`);
    return;
  }

  if (demoEnabled && demoIndex === -1 && !users.length) {
    users.push({ id: 'USR-ADMIN', name: 'Demo administrator', email: DEMO_EMAIL, department: 'Finance', title: 'System administrator', role: 'Super Administrator', passwordHash: hashPassword(process.env.DEMO_PASSWORD || 'demo-password'), sessionVersion: 0, active: true, createdAt: new Date().toISOString(), lastActivity: null });
    store.save('users', users, { memoryFallback: true });
    return;
  }

  if (!users.some((user) => user.active !== false)) {
    console.warn('No active users. Set ADMIN_EMAIL and ADMIN_PASSWORD to create the first administrator.');
  }
}
bootstrapUsers();

// ── Sessions ─────────────────────────────────────────────────────────────────
function sign(value) {
  return crypto.createHmac('sha256', sessionSecret).update(value).digest('base64url');
}

function setSessionCookie(res, user) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, sv: user.sessionVersion || 0, exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  res.cookie(SESSION_COOKIE, `${payload}.${sign(payload)}`, { httpOnly: true, sameSite: 'lax', secure: isProduction, maxAge: SESSION_TTL_MS, path: '/' });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: isProduction, path: '/' });
}

function sessionUser(req) {
  const value = req.cookies?.[SESSION_COOKIE];
  if (!value) return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data?.id || !Number.isFinite(data.exp) || data.exp < Date.now()) return null;
    const user = store.list('users').find((item) => item.id === data.id && item.active !== false);
    if (!user || (user.sessionVersion || 0) !== data.sv) return null;
    return user;
  } catch (error) {
    return null;
  }
}

function requireSession(req, res, next) {
  const user = sessionUser(req);
  if (!user) return res.status(401).json({ ok: false, message: 'Your session has ended. Please sign in again.' });
  req.user = user;
  next();
}

const requirePermission = (permission) => (req, res, next) => {
  if (!can(req.user, permission)) return res.status(403).json({ ok: false, message: 'Your role does not allow this action.' });
  next();
};

// ── Middleware ───────────────────────────────────────────────────────────────
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://images.unsplash.com",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '));
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Too many sign-in attempts. Please try again in 15 minutes.' },
});

// ── Auth API ─────────────────────────────────────────────────────────────────
const ALLOWED_REDIRECTS = new Set(['index.html', 'employees.html', 'company.html', 'payroll.html']);

app.get('/api/health', (req, res) => res.json({ ok: true, name: 'Tax Cup API' }));
app.get('/api/config', (req, res) => res.json({ demo: demoEnabled, demoEmail: demoEnabled ? DEMO_EMAIL : null }));

app.get('/api/session', (req, res) => {
  const user = sessionUser(req);
  res.json({ authenticated: !!user, user: user ? publicUser(user) : null });
});

app.post('/api/login', loginLimiter, handle((req, res) => {
  const email = text(req.body?.email).toLowerCase();
  const password = String(req.body?.password || '');
  const users = store.list('users');
  const user = users.find((item) => item.email?.toLowerCase() === email && item.active !== false);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ ok: false, message: 'The email or password is incorrect, or the account is inactive.' });
  }
  if (!user.passwordHash.startsWith('$2')) user.passwordHash = hashPassword(password);
  user.lastActivity = new Date().toISOString();
  store.save('users', users, { memoryFallback: true });
  setSessionCookie(res, user);
  const requested = String(req.body?.redirect || '');
  res.json({ ok: true, user: publicUser(user), redirect: ALLOWED_REDIRECTS.has(requested) ? requested : 'index.html' });
}));

app.post('/api/logout', handle((req, res) => {
  const user = sessionUser(req);
  if (user) {
    // Bumping the version revokes this cookie (and any copy of it) on the server.
    const users = store.list('users');
    const stored = users.find((item) => item.id === user.id);
    stored.sessionVersion = (stored.sessionVersion || 0) + 1;
    store.save('users', users, { memoryFallback: true });
  }
  clearSessionCookie(res);
  res.json({ ok: true });
}));

// ── Users API (administrators) ───────────────────────────────────────────────
app.get('/api/users', requireSession, requirePermission('users:manage'), (req, res) => {
  res.json({ ok: true, users: store.list('users').map(publicUser), roles: Object.keys(ROLES) });
});

app.post('/api/users', requireSession, requirePermission('users:manage'), handle((req, res) => {
  const body = req.body || {};
  const name = text(body.name, 120);
  const email = text(body.email, 160).toLowerCase();
  const password = String(body.password || '');
  const role = text(body.role) || 'HR Manager';
  if (!name || !email || !password) return res.status(400).json({ ok: false, message: 'Name, email and password are required.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, message: 'Please provide a valid email address.' });
  if (password.length < MIN_PASSWORD_LENGTH) return res.status(400).json({ ok: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.` });
  if (!ROLES[role]) return res.status(400).json({ ok: false, message: 'Unknown role.' });
  const users = store.list('users');
  if (users.some((item) => item.email?.toLowerCase() === email)) return res.status(409).json({ ok: false, message: 'A user with this email already exists.' });
  const user = { id: newId('USR'), name, email, department: text(body.department, 120), title: text(body.title, 120), role, passwordHash: hashPassword(password), sessionVersion: 0, active: true, createdAt: new Date().toISOString(), lastActivity: null };
  users.unshift(user);
  store.save('users', users);
  audit(req.user, 'Created user', email, `Role ${role}`);
  res.status(201).json({ ok: true, user: publicUser(user) });
}));

app.patch('/api/users/:id', requireSession, requirePermission('users:manage'), handle((req, res) => {
  const users = store.list('users');
  const user = users.find((item) => item.id === req.params.id);
  if (!user) return res.status(404).json({ ok: false, message: 'User not found.' });
  const body = req.body || {};
  const changes = [];
  if (req.user.id === user.id && (body.active === false || (body.role && body.role !== user.role))) {
    return res.status(400).json({ ok: false, message: 'You cannot deactivate or change the role of your own account.' });
  }
  if (typeof body.active === 'boolean' && body.active !== (user.active !== false)) {
    user.active = body.active;
    if (!body.active) user.sessionVersion = (user.sessionVersion || 0) + 1;
    changes.push(body.active ? 'Activated' : 'Deactivated');
  }
  if (body.role !== undefined) {
    if (!ROLES[body.role]) return res.status(400).json({ ok: false, message: 'Unknown role.' });
    if (body.role !== user.role) changes.push(`Role ${user.role} → ${body.role}`);
    user.role = body.role;
  }
  if (typeof body.department === 'string') user.department = text(body.department, 120);
  if (typeof body.title === 'string') user.title = text(body.title, 120);
  if (body.password !== undefined) {
    if (String(body.password).length < MIN_PASSWORD_LENGTH) return res.status(400).json({ ok: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.` });
    user.passwordHash = hashPassword(body.password);
    user.sessionVersion = (user.sessionVersion || 0) + 1;
    changes.push('Password reset');
  }
  store.save('users', users);
  audit(req.user, 'Updated user', user.email, changes.join(', ') || 'Profile details');
  res.json({ ok: true, user: publicUser(user) });
}));

app.delete('/api/users/:id', requireSession, requirePermission('users:manage'), handle((req, res) => {
  if (req.user.id === req.params.id) return res.status(400).json({ ok: false, message: 'You cannot delete your own account.' });
  const users = store.list('users');
  const user = users.find((item) => item.id === req.params.id);
  if (!user) return res.status(404).json({ ok: false, message: 'User not found.' });
  store.save('users', users.filter((item) => item.id !== user.id));
  audit(req.user, 'Deleted user', user.email);
  res.json({ ok: true });
}));

// ── Employees API ────────────────────────────────────────────────────────────
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

app.get('/api/employees', requireSession, requirePermission('employees:read'), (req, res) => {
  res.json({ ok: true, employees: store.list('employees') });
});

app.post('/api/employees', requireSession, requirePermission('employees:write'), handle((req, res) => {
  const employee = { id: newId('EMP'), ...cleanEmployee(req.body || {}), createdAt: new Date().toISOString() };
  if (!employee.name) return res.status(400).json({ ok: false, message: 'Employee name is required.' });
  const employees = store.list('employees');
  employees.push(employee);
  store.save('employees', employees);
  audit(req.user, 'Added employee', employee.name, `Salary ${employee.salary}`);
  res.status(201).json({ ok: true, employee });
}));

app.patch('/api/employees/:id', requireSession, requirePermission('employees:write'), handle((req, res) => {
  const employees = store.list('employees');
  const index = employees.findIndex((item) => String(item.id) === req.params.id);
  if (index === -1) return res.status(404).json({ ok: false, message: 'Employee not found.' });
  const before = employees[index];
  const updated = cleanEmployee(req.body || {}, before);
  if (!updated.name) return res.status(400).json({ ok: false, message: 'Employee name is required.' });
  employees[index] = updated;
  store.save('employees', employees);
  audit(req.user, 'Updated employee', updated.name, before.salary !== updated.salary ? `Salary ${before.salary} → ${updated.salary}` : '');
  res.json({ ok: true, employee: updated });
}));

app.delete('/api/employees/:id', requireSession, requirePermission('employees:write'), handle((req, res) => {
  const employees = store.list('employees');
  const employee = employees.find((item) => String(item.id) === req.params.id);
  if (!employee) return res.status(404).json({ ok: false, message: 'Employee not found.' });
  store.save('employees', employees.filter((item) => item !== employee && String(item.id) !== req.params.id));
  audit(req.user, 'Removed employee', employee.name);
  res.json({ ok: true });
}));

// ── Payroll records API (control room) ───────────────────────────────────────
const EARNING_KEYS = ['basic', 'housing', 'transport', 'meal', 'utility', 'otherAllowances', 'bonus', 'overtime', 'commission', 'arrears', 'otherEarnings'];
const DEDUCTION_KEYS = ['paye', 'pension', 'nhf', 'nhis', 'loan', 'advance', 'absence', 'otherDeductions'];
const EMPLOYER_KEYS = ['employerPension', 'nsitf', 'itf'];
const WORKFLOW = ['Draft', 'Under Review', 'Approved', 'Finalized', 'Paid'];
const LOCKED_STATES = new Set(['Finalized', 'Paid']);

function cleanRecord(body, employee) {
  const record = {
    employeeId: String(employee.id),
    employeeName: employee.name,
    department: employee.department,
    title: employee.title,
    period: body.period,
    annualRent: amount(body.annualRent),
    paymentStatus: ['Pending', 'Paid', 'Failed'].includes(body.paymentStatus) ? body.paymentStatus : 'Pending',
    paymentDate: /^\d{4}-\d{2}-\d{2}$/.test(String(body.paymentDate || '')) ? body.paymentDate : '',
    reference: text(body.reference, 120),
    remarks: text(body.remarks, 1000),
  };
  [...EARNING_KEYS, ...DEDUCTION_KEYS, ...EMPLOYER_KEYS].forEach((key) => { record[key] = amount(body[key]); });
  return record;
}

const totalOf = (record, keys) => keys.reduce((sum, key) => sum + amount(record[key]), 0);

app.get('/api/records', requireSession, requirePermission('payroll:read'), (req, res) => {
  res.json({ ok: true, records: store.list('records'), workflow: WORKFLOW });
});

app.post('/api/records', requireSession, requirePermission('payroll:write'), handle((req, res) => {
  const body = req.body || {};
  const employee = store.list('employees').find((item) => String(item.id) === String(body.employeeId));
  if (!employee) return res.status(400).json({ ok: false, message: 'Choose an employee from the directory.' });
  if (!isMonth(body.period)) return res.status(400).json({ ok: false, message: 'Choose a valid payroll month.' });
  const records = store.list('records');
  if (records.some((item) => item.employeeId === String(employee.id) && item.period === body.period)) {
    return res.status(409).json({ ok: false, message: 'A payroll record already exists for this employee and month. Edit the existing record instead.' });
  }
  const record = { id: newId('PR'), ...cleanRecord(body, employee), workflowStatus: 'Draft', createdAt: new Date().toISOString(), createdBy: req.user.name };
  records.unshift(record);
  store.save('records', records);
  audit(req.user, 'Created payroll record', `${record.employeeName} / ${record.period}`, `Net ${Math.round(totalOf(record, EARNING_KEYS) - totalOf(record, DEDUCTION_KEYS))}`);
  res.status(201).json({ ok: true, record });
}));

app.put('/api/records/:id', requireSession, requirePermission('payroll:write'), handle((req, res) => {
  const records = store.list('records');
  const index = records.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ ok: false, message: 'Record not found.' });
  const existing = records[index];
  if (LOCKED_STATES.has(existing.workflowStatus)) return res.status(409).json({ ok: false, message: `${existing.workflowStatus} records are locked and cannot be edited.` });
  const body = { ...req.body, period: req.body?.period || existing.period };
  if (!isMonth(body.period)) return res.status(400).json({ ok: false, message: 'Choose a valid payroll month.' });
  const employee = store.list('employees').find((item) => String(item.id) === String(body.employeeId || existing.employeeId))
    || { id: existing.employeeId, name: existing.employeeName, department: existing.department, title: existing.title };
  if (records.some((item, i) => i !== index && item.employeeId === String(employee.id) && item.period === body.period)) {
    return res.status(409).json({ ok: false, message: 'Another record already exists for this employee and month.' });
  }
  // Edits send an approved record back for review.
  const workflowStatus = existing.workflowStatus === 'Approved' ? 'Under Review' : existing.workflowStatus;
  const record = { ...existing, ...cleanRecord(body, employee), workflowStatus, updatedAt: new Date().toISOString(), updatedBy: req.user.name };
  records[index] = record;
  store.save('records', records);
  const beforeNet = Math.round(totalOf(existing, EARNING_KEYS) - totalOf(existing, DEDUCTION_KEYS));
  const afterNet = Math.round(totalOf(record, EARNING_KEYS) - totalOf(record, DEDUCTION_KEYS));
  audit(req.user, 'Edited payroll record', `${record.employeeName} / ${record.period}`, `Net ${beforeNet} → ${afterNet}`);
  res.json({ ok: true, record });
}));

app.post('/api/records/:id/advance', requireSession, requirePermission('payroll:approve'), handle((req, res) => {
  const records = store.list('records');
  const record = records.find((item) => item.id === req.params.id);
  if (!record) return res.status(404).json({ ok: false, message: 'Record not found.' });
  const current = WORKFLOW.includes(record.workflowStatus) ? record.workflowStatus : 'Draft';
  const next = WORKFLOW[WORKFLOW.indexOf(current) + 1];
  if (!next) return res.status(409).json({ ok: false, message: 'This record is already paid.' });
  record.workflowStatus = next;
  if (next === 'Paid') {
    record.paymentStatus = 'Paid';
    record.paymentDate = record.paymentDate || new Date().toISOString().slice(0, 10);
  }
  store.save('records', records);
  audit(req.user, `Moved payroll to ${next}`, `${record.employeeName} / ${record.period}`, `${current} → ${next}`);
  res.json({ ok: true, record });
}));

app.delete('/api/records/:id', requireSession, requirePermission('payroll:write'), handle((req, res) => {
  const records = store.list('records');
  const record = records.find((item) => item.id === req.params.id);
  if (!record) return res.status(404).json({ ok: false, message: 'Record not found.' });
  if (record.workflowStatus !== 'Draft') return res.status(409).json({ ok: false, message: 'Only draft records can be deleted.' });
  store.save('records', records.filter((item) => item.id !== record.id));
  audit(req.user, 'Deleted draft payroll record', `${record.employeeName} / ${record.period}`);
  res.json({ ok: true });
}));

app.post('/api/audit/export', requireSession, requirePermission('reports:export'), handle((req, res) => {
  audit(req.user, 'Exported payroll report', text(req.body?.scope, 120) || 'All periods');
  res.json({ ok: true });
}));

// ── Saved runs & calculator archive ──────────────────────────────────────────
app.get('/api/runs', requireSession, requirePermission('payroll:read'), (req, res) => {
  res.json({ ok: true, runs: store.list('runs') });
});

app.post('/api/runs', requireSession, requirePermission('payroll:write'), handle((req, res) => {
  const body = req.body || {};
  if (!isMonth(body.period)) return res.status(400).json({ ok: false, message: 'Choose a valid payroll month.' });
  if (!Array.isArray(body.results) || !body.results.length) return res.status(400).json({ ok: false, message: 'There are no employees in this run.' });
  const runs = store.list('runs');
  const duplicate = runs.find((run) => run.period === body.period);
  if (duplicate) return res.status(409).json({ ok: false, message: 'A payroll run for this month already exists.', run: duplicate });
  const run = { id: newId('RUN'), period: body.period, savedAt: new Date().toISOString(), savedBy: req.user.name, settings: body.settings || {}, count: body.results.length, totalNet: body.results.reduce((sum, item) => sum + amount(item?.result?.net), 0), results: body.results.slice(0, 5000) };
  runs.unshift(run);
  store.save('runs', runs);
  audit(req.user, 'Saved company payroll run', run.period, `${run.count} employees`);
  res.status(201).json({ ok: true, run });
}));

app.delete('/api/runs/:id', requireSession, requirePermission('payroll:write'), handle((req, res) => {
  const runs = store.list('runs');
  const run = runs.find((item) => String(item.id) === req.params.id);
  if (!run) return res.status(404).json({ ok: false, message: 'Run not found.' });
  store.save('runs', runs.filter((item) => item !== run && String(item.id) !== req.params.id));
  audit(req.user, 'Deleted company payroll run', run.period);
  res.json({ ok: true });
}));

app.get('/api/archive', requireSession, requirePermission('payroll:read'), (req, res) => {
  const type = req.query.type;
  res.json({ ok: true, items: store.list('archive').filter((item) => !type || item.type === type) });
});

app.post('/api/archive', requireSession, requirePermission('calc:write'), handle((req, res) => {
  const body = req.body || {};
  if (!['single', 'batch'].includes(body.type)) return res.status(400).json({ ok: false, message: 'Unknown archive type.' });
  if (!isMonth(body.period)) return res.status(400).json({ ok: false, message: 'Choose a valid payroll month.' });
  const item = { id: newId('ARC'), type: body.type, period: body.period, title: text(body.title, 160), employeeName: text(body.employeeName, 120), count: Math.max(1, Number(body.count) || 1), totalNet: amount(body.totalNet), snapshot: body.snapshot || null, savedAt: new Date().toISOString(), savedBy: req.user.name };
  const items = store.list('archive');
  items.unshift(item);
  store.save('archive', items.slice(0, 2000));
  audit(req.user, body.type === 'single' ? 'Saved individual calculation' : 'Saved team calculation', `${item.title} / ${item.period}`);
  res.status(201).json({ ok: true, item });
}));

app.delete('/api/archive/:id', requireSession, requirePermission('calc:write'), handle((req, res) => {
  const items = store.list('archive');
  const item = items.find((entry) => String(entry.id) === req.params.id);
  if (!item) return res.status(404).json({ ok: false, message: 'Saved calculation not found.' });
  store.save('archive', items.filter((entry) => entry !== item && String(entry.id) !== req.params.id));
  audit(req.user, 'Deleted saved calculation', `${item.title} / ${item.period}`);
  res.json({ ok: true });
}));

app.get('/api/audit', requireSession, requirePermission('audit:read'), (req, res) => {
  res.json({ ok: true, entries: store.list('audit').slice(0, 1000) });
});

// One-time import of data that older versions kept in each browser's localStorage.
app.post('/api/import', requireSession, requirePermission('users:manage'), handle((req, res) => {
  const body = req.body || {};
  const counts = { employees: 0, records: 0, runs: 0, archive: 0 };
  const employees = store.list('employees');
  const idMap = new Map();
  (Array.isArray(body.employees) ? body.employees : []).forEach((raw) => {
    const name = text(raw?.name, 120);
    if (!name) return;
    const match = employees.find((item) => item.legacyId === String(raw.id) || item.name.toLowerCase() === name.toLowerCase());
    if (match) { idMap.set(String(raw.id), match.id); return; }
    const employee = { id: newId('EMP'), legacyId: String(raw.id), ...cleanEmployee({ ...raw, title: raw.title || raw.role }), createdAt: new Date().toISOString() };
    employees.push(employee);
    idMap.set(String(raw.id), employee.id);
    counts.employees += 1;
  });
  store.save('employees', employees);

  const records = store.list('records');
  (Array.isArray(body.records) ? body.records : []).forEach((raw) => {
    if (!raw || String(raw.id || '').startsWith('SEED-') || !isMonth(raw.period)) return;
    const employeeId = idMap.get(String(raw.employeeId));
    const employee = employees.find((item) => item.id === employeeId);
    if (!employee || records.some((item) => item.employeeId === employee.id && item.period === raw.period)) return;
    // Older versions deducted employer NSITF from the employee; it is kept as an employer cost now.
    records.push({ id: newId('PR'), ...cleanRecord(raw, employee), workflowStatus: WORKFLOW.includes(raw.workflowStatus) ? raw.workflowStatus : 'Draft', createdAt: raw.createdAt || new Date().toISOString(), createdBy: `${req.user.name} (import)` });
    counts.records += 1;
  });
  store.save('records', records);

  const runs = store.list('runs');
  (Array.isArray(body.runs) ? body.runs : []).forEach((raw) => {
    if (!raw?.results || !isMonth(raw.period) || runs.some((run) => run.period === raw.period)) return;
    runs.push({ id: newId('RUN'), period: raw.period, savedAt: new Date().toISOString(), savedBy: `${req.user.name} (import)`, settings: {}, count: raw.results.length, totalNet: amount(raw.total), results: raw.results, legacy: true });
    counts.runs += 1;
  });
  store.save('runs', runs);

  const archive = store.list('archive');
  (Array.isArray(body.archive) ? body.archive : []).forEach((raw) => {
    if (!['single', 'batch'].includes(raw?.type) || !isMonth(raw.period)) return;
    archive.push({ id: newId('ARC'), type: raw.type, period: raw.period, title: text(raw.title, 160), employeeName: text(raw.employeeName, 120), count: Number(raw.count) || 1, totalNet: amount(raw.totalNet), snapshot: raw.snapshot || null, savedAt: raw.savedAt || new Date().toISOString(), savedBy: `${req.user.name} (import)`, legacy: true });
    counts.archive += 1;
  });
  store.save('archive', archive);

  audit(req.user, 'Imported browser data', 'Local workspace', `${counts.employees} employees, ${counts.records} records, ${counts.runs} runs, ${counts.archive} saved calculations`);
  res.json({ ok: true, counts });
}));

app.use('/api', (req, res) => res.status(404).json({ ok: false, message: 'Not found.' }));

// ── Pages ────────────────────────────────────────────────────────────────────
const PROTECTED_PAGES = new Set(['index.html', 'employees.html', 'company.html', 'payroll.html']);
const sendPage = (res, page) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(publicDir, page));
};

app.get('/', (req, res) => (sessionUser(req) ? res.redirect('/index.html') : sendPage(res, 'landing.html')));
app.get(['/landing', '/landing.html'], (req, res) => sendPage(res, 'landing.html'));
app.get(['/login', '/login.html'], (req, res) => (sessionUser(req) ? res.redirect('/index.html') : sendPage(res, 'login.html')));
app.get('/:page', (req, res, next) => {
  const page = String(req.params.page).toLowerCase();
  if (!PROTECTED_PAGES.has(page)) return next();
  if (!sessionUser(req)) return res.redirect(`/login.html?redirect=${encodeURIComponent(page)}`);
  sendPage(res, page);
});

// Static assets come only from /public, and HTML is only ever served by the routes above.
const serveStatic = express.static(publicDir, {
  index: false,
  dotfiles: 'ignore',
  redirect: false,
  // Revalidate with ETags on every load so deployments show up immediately.
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
});
app.use((req, res, next) => {
  let decoded;
  try { decoded = decodeURIComponent(req.path); } catch (error) { return res.status(400).end(); }
  if (/\.html?$/i.test(decoded)) return next();
  serveStatic(req, res, next);
});

app.use((req, res) => {
  if (req.method === 'GET' && req.accepts('html')) return res.redirect(sessionUser(req) ? '/index.html' : '/');
  res.status(404).end();
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ ok: false, message: 'Something went wrong on the server.' });
});

if (require.main === module) {
  app.listen(port, host, () => {
    console.log(`The Tax Cup is running on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    if (host === '0.0.0.0') console.log('Listening on all network interfaces (HOST=0.0.0.0).');
    if (demoEnabled) console.log(`Demo mode: sign in as ${DEMO_EMAIL}. Set NODE_ENV=production to disable it.`);
  });
}

module.exports = app;
