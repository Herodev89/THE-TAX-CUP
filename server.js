const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const rootDir = __dirname;
const usersFile = path.join(rootDir, 'users.json');
const sessionCookie = 'taxcup_session';

// Stable session secret across server restarts
const secretFile = path.join(rootDir, '.session-secret');
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (fs.existsSync(secretFile)) {
    try {
      sessionSecret = fs.readFileSync(secretFile, 'utf8').trim();
    } catch (e) {
      sessionSecret = '';
    }
  }
  if (!sessionSecret || sessionSecret.length < 32) {
    sessionSecret = crypto.randomBytes(32).toString('hex');
    try {
      fs.writeFileSync(secretFile, sessionSecret, 'utf8');
    } catch (e) {}
  }
}

let inMemoryUsers = null;

function readUsers() {
  if (inMemoryUsers) return inMemoryUsers;
  try {
    const raw = fs.readFileSync(usersFile, 'utf8');
    const parsed = JSON.parse(raw);
    inMemoryUsers = Array.isArray(parsed) ? parsed : [];
    return inMemoryUsers;
  } catch (error) {
    return inMemoryUsers || [];
  }
}

function writeUsers(users) {
  inMemoryUsers = users;
  try {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  } catch (error) {
    // Read-only environment fallback (e.g. Vercel serverless)
  }
}

function hashPassword(value) {
  return bcrypt.hashSync(String(value), 10);
}

function verifyPassword(plain, storedHash) {
  if (!storedHash || !plain) return false;
  if (storedHash.startsWith('$2')) {
    return bcrypt.compareSync(String(plain), storedHash);
  }
  // Legacy SHA-256 fallback
  const sha = crypto.createHash('sha256').update(String(plain)).digest('hex');
  return sha === storedHash;
}

function ensureDemoUser() {
  const users = readUsers();
  const demoPassword = process.env.DEMO_PASSWORD || 'demo-password';
  const index = users.findIndex((user) => user.email === 'admin@taxcup.local');
  if (index === -1) {
    users.unshift({
      id: 'USR-ADMIN',
      name: 'Demo administrator',
      email: 'admin@taxcup.local',
      department: 'Finance',
      title: 'System administrator',
      role: 'Super Administrator',
      passwordHash: hashPassword(demoPassword),
      active: true,
      createdAt: new Date().toISOString(),
      lastActivity: null,
    });
    writeUsers(users);
  } else if (!users[index].passwordHash.startsWith('$2')) {
    // Upgrade existing demo user to bcrypt
    users[index].passwordHash = hashPassword(demoPassword);
    writeUsers(users);
  }
}


function getSessionUser(req) {
  const sessionValue = req.cookies && req.cookies[sessionCookie];
  if (!sessionValue) return null;
  try {
    const [encodedPayload, signature] = sessionValue.split('.');
    if (!encodedPayload || !signature) return null;
    const expectedSignature = crypto.createHmac('sha256', sessionSecret).update(encodedPayload).digest('base64url');
    if (signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return null;
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!payload || !payload.id) return null;
    const users = readUsers();
    const user = users.find((item) => item.id === payload.id && item.active !== false);
    if (!user) return null;
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  } catch (error) {
    return null;
  }
}

const isProduction = process.env.NODE_ENV === 'production';

function setSessionCookie(res, user) {
  const encodedPayload = Buffer.from(JSON.stringify({ id: user.id, name: user.name, email: user.email, role: user.role })).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(encodedPayload).digest('base64url');
  res.cookie(sessionCookie, `${encodedPayload}.${signature}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 12,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(sessionCookie, { httpOnly: true, sameSite: 'lax', secure: isProduction });
}

ensureDemoUser();
app.use(express.json());
app.use(cookieParser());

function requireSession(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ ok: false, message: 'Please sign in first.' });
  req.sessionUser = user;
  next();
}

function requireAdministrator(req, res, next) {
  if (req.sessionUser?.role !== 'Super Administrator') return res.status(403).json({ ok: false, message: 'Only a Super Administrator can manage users.' });
  next();
}

// Redirect unauthenticated HTML requests to login.html
app.use((req, res, next) => {
  const requestedPage = path.basename(req.path || '') || 'index.html';
  const needsAuth = req.method === 'GET' && requestedPage.endsWith('.html') && requestedPage !== 'login.html' && requestedPage !== 'landing.html' && !req.path.startsWith('/api/');
  if (needsAuth) {
    const user = getSessionUser(req);
    if (!user) {
      const redirectTarget = `login.html?redirect=${encodeURIComponent(requestedPage)}`;
      return res.redirect(redirectTarget);
    }
  }
  next();
});

// Rate limiting on login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Too many sign-in attempts from this IP. Please try again in 15 minutes.' }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: 'Tax Cup API' });
});

app.get('/api/session', (req, res) => {
  const user = getSessionUser(req);
  res.json({ authenticated: !!user, user: user || null });
});

app.get('/api/users', requireSession, requireAdministrator, (req, res) => {
  const users = readUsers().map(({ id, name, email, department, title, role, active, createdAt, lastActivity }) => ({ id, name, email, department, title, role, active, createdAt, lastActivity }));
  res.json({ ok: true, users });
});

app.post('/api/users', requireSession, requireAdministrator, (req, res) => {
  const payload = req.body || {};
  const name = String(payload.name || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const department = String(payload.department || '').trim();
  const title = String(payload.title || '').trim();
  const role = String(payload.role || 'HR Manager').trim();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!name || !email || !password) {
    return res.status(400).json({ ok: false, message: 'Name, email and password are required.' });
  }
  if (!emailRegex.test(email)) {
    return res.status(400).json({ ok: false, message: 'Please provide a valid email address.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ ok: false, message: 'Password must be at least 6 characters long.' });
  }

  const users = readUsers();
  const duplicate = users.some((item) => item.email && item.email.toLowerCase() === email);
  if (duplicate) {
    return res.status(409).json({ ok: false, message: 'A user with this email already exists.' });
  }

  const newUser = {
    id: `USR-${Date.now()}`,
    name,
    email,
    department,
    title,
    role,
    passwordHash: hashPassword(password),
    active: true,
    createdAt: new Date().toISOString(),
    lastActivity: null,
  };

  users.unshift(newUser);
  writeUsers(users);
  res.json({ ok: true, user: { id: newUser.id, name: newUser.name, email: newUser.email, department: newUser.department, title: newUser.title, role: newUser.role, active: newUser.active, createdAt: newUser.createdAt } });
});

app.patch('/api/users/:id', requireSession, requireAdministrator, (req, res) => {
  const userId = req.params.id;
  const users = readUsers();
  const userIndex = users.findIndex((item) => item.id === userId);
  if (userIndex === -1) {
    return res.status(404).json({ ok: false, message: 'User not found.' });
  }

  const user = users[userIndex];
  if (req.sessionUser.id === user.id && req.body.active === false) {
    return res.status(400).json({ ok: false, message: 'You cannot deactivate your own account.' });
  }

  if (typeof req.body.active === 'boolean') {
    user.active = req.body.active;
  }
  if (req.body.role && typeof req.body.role === 'string') {
    user.role = req.body.role.trim();
  }
  if (req.body.department && typeof req.body.department === 'string') {
    user.department = req.body.department.trim();
  }
  if (req.body.title && typeof req.body.title === 'string') {
    user.title = req.body.title.trim();
  }
  if (req.body.password && typeof req.body.password === 'string' && req.body.password.length >= 6) {
    user.passwordHash = hashPassword(req.body.password);
  }

  users[userIndex] = user;
  writeUsers(users);

  res.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      department: user.department,
      title: user.title,
      role: user.role,
      active: user.active,
      createdAt: user.createdAt,
      lastActivity: user.lastActivity,
    },
  });
});

app.delete('/api/users/:id', requireSession, requireAdministrator, (req, res) => {
  const userId = req.params.id;
  if (req.sessionUser.id === userId) {
    return res.status(400).json({ ok: false, message: 'You cannot delete your own account.' });
  }
  let users = readUsers();
  const exists = users.some((item) => item.id === userId);
  if (!exists) return res.status(404).json({ ok: false, message: 'User not found.' });
  users = users.filter((item) => item.id !== userId);
  writeUsers(users);
  res.json({ ok: true });
});

app.post('/api/login', loginLimiter, (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const users = readUsers();
  const user = users.find((item) => item.email && item.email.toLowerCase() === email && item.active !== false);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ ok: false, message: 'The email or password is incorrect, or the account is inactive.' });
  }

  // Auto-upgrade legacy hash to bcrypt on login
  if (!user.passwordHash.startsWith('$2')) {
    user.passwordHash = hashPassword(password);
  }

  const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role };
  setSessionCookie(res, safeUser);
  user.lastActivity = new Date().toISOString();
  writeUsers(users.map((item) => (item.id === user.id ? user : item)));
  const redirectTo = req.body?.redirect || 'index.html';
  res.json({ ok: true, user: safeUser, redirect: redirectTo });
});

app.post('/api/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// Protect sensitive files from static serving
app.use((req, res, next) => {
  const blockedFiles = new Set(['users.json', 'server.js', 'package.json', 'package-lock.json', '.session-secret', '.env']);
  if (blockedFiles.has(path.basename(req.path))) return res.status(404).end();
  next();
});

app.use(express.static(rootDir, {
  index: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

app.get('/', (req, res) => {
  if (getSessionUser(req)) {
    return res.redirect('/index.html');
  }
  res.sendFile(path.join(rootDir, 'landing.html'));
});

app.get('/landing.html', (req, res) => {
  res.sendFile(path.join(rootDir, 'landing.html'));
});

app.get('/landing', (req, res) => {
  res.sendFile(path.join(rootDir, 'landing.html'));
});

app.get('/login.html', (req, res) => {
  if (getSessionUser(req)) {
    return res.redirect('/index.html');
  }
  res.sendFile(path.join(rootDir, 'login.html'));
});

app.get('/index.html', (req, res) => {
  if (!getSessionUser(req)) {
    return res.redirect('/login.html?redirect=index.html');
  }
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.get('/employees.html', (req, res) => {
  if (!getSessionUser(req)) {
    return res.redirect('/login.html?redirect=employees.html');
  }
  res.sendFile(path.join(rootDir, 'employees.html'));
});

app.get('/company.html', (req, res) => {
  if (!getSessionUser(req)) {
    return res.redirect('/login.html?redirect=company.html');
  }
  res.sendFile(path.join(rootDir, 'company.html'));
});

app.get('/payroll.html', (req, res) => {
  if (!getSessionUser(req)) {
    return res.redirect('/login.html?redirect=payroll.html');
  }
  res.sendFile(path.join(rootDir, 'payroll.html'));
});

app.get('*', (req, res) => {
  // Safety guard — never redirect login/landing to themselves (would cause a loop)
  const p = req.path;
  if (p === '/login.html' || p === '/login' || p === '/landing.html' || p === '/landing') {
    return res.sendFile(path.join(rootDir, p.replace('/', '') || 'landing.html'));
  }
  if (!getSessionUser(req)) return res.redirect('/login.html?redirect=index.html');
  res.sendFile(path.join(rootDir, 'index.html'));
});

if (require.main === module) {
  app.listen(port, host, () => {
    console.log(`Tax Cup auth server is running on http://localhost:${port}`);
    console.log('Network access is enabled on all interfaces. Use this computer\'s LAN IPv4 address with port 3000.');
  });
}

module.exports = app;
