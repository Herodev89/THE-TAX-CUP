const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../lib/db');

const SESSION_COOKIE = 'taxcup_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const MIN_PASSWORD_LENGTH = 8;
const DEMO_EMAIL = 'admin@taxcup.local';

const ROLES = {
  'Super Administrator': ['*'],
  'HR Manager': ['employees:read', 'employees:write', 'payroll:read', 'reports:read', 'calc:write'],
  Accountant: ['employees:read', 'payroll:read', 'payroll:write', 'payroll:approve', 'reports:read', 'reports:export', 'calc:write'],
  'Payroll Officer': ['employees:read', 'employees:write', 'payroll:read', 'payroll:write', 'reports:read', 'reports:export', 'calc:write'],
  Management: ['employees:read', 'payroll:read', 'reports:read'],
  // Self-registered accounts: calculators only, no company data until an admin assigns a role.
  Member: [],
};

const ALL_PERMISSIONS = [
  'employees:read', 'employees:write', 'payroll:read', 'payroll:write',
  'payroll:approve', 'reports:read', 'reports:export', 'calc:write',
  'users:manage', 'audit:read'
];

function permissionsFor(role) {
  const granted = ROLES[role] || [];
  return granted.includes('*') ? ALL_PERMISSIONS : granted;
}

function can(user, permission) {
  return permissionsFor(user?.role).includes(permission);
}

function publicUser(user) {
  if (!user) return null;
  const { id, name, email, department, title, role, active, createdAt, lastActivity } = user;
  return {
    id,
    name,
    email,
    department: department || '',
    title: title || '',
    role,
    active: active !== false,
    createdAt,
    lastActivity,
    permissions: permissionsFor(role),
  };
}

function hashPassword(value) {
  return bcrypt.hashSync(String(value), 10);
}

function verifyPassword(plain, storedHash) {
  if (!storedHash || !plain) return false;
  if (storedHash.startsWith('$2')) return bcrypt.compareSync(String(plain), storedHash);
  // Legacy unsalted SHA-256 hashes are upgraded to bcrypt on next successful login.
  const sha = Buffer.from(crypto.createHash('sha256').update(String(plain)).digest('hex'));
  const stored = Buffer.from(String(storedHash));
  return sha.length === stored.length && crypto.timingSafeEqual(sha, stored);
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function setSessionCookie(res, user, secret, isProduction) {
  const payload = Buffer.from(
    JSON.stringify({ id: user.id, sv: user.sessionVersion || 0, exp: Date.now() + SESSION_TTL_MS })
  ).toString('base64url');
  res.cookie(SESSION_COOKIE, `${payload}.${sign(payload, secret)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

function clearSessionCookie(res, isProduction) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
  });
}

async function sessionUser(req, secret) {
  const value = req.cookies?.[SESSION_COOKIE];
  if (!value) return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload, secret);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data?.id || !Number.isFinite(data.exp) || data.exp < Date.now()) return null;
    const user = await db.users.findById(data.id);
    if (!user || user.active === false || (user.sessionVersion || 0) !== data.sv) return null;
    return user;
  } catch (error) {
    return null;
  }
}

const requireSession = (secret) => async (req, res, next) => {
  try {
    const user = await sessionUser(req, secret);
    if (!user) {
      return res.status(401).json({ ok: false, message: 'Your session has ended. Please sign in again.' });
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

const requirePermission = (permission) => (req, res, next) => {
  if (!can(req.user, permission)) {
    return res.status(403).json({ ok: false, message: 'Your role does not allow this action.' });
  }
  next();
};

module.exports = {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  MIN_PASSWORD_LENGTH,
  DEMO_EMAIL,
  ROLES,
  ALL_PERMISSIONS,
  permissionsFor,
  can,
  publicUser,
  hashPassword,
  verifyPassword,
  sign,
  setSessionCookie,
  clearSessionCookie,
  sessionUser,
  requireSession,
  requirePermission,
};
