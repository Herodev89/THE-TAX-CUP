const express = require('express');
const db = require('../lib/db');
const { text, newId, ALLOWED_REDIRECTS } = require('../lib/helpers');
const {
  DEMO_EMAIL,
  MIN_PASSWORD_LENGTH,
  publicUser,
  verifyPassword,
  hashPassword,
  setSessionCookie,
  clearSessionCookie,
  sessionUser,
} = require('../middleware/auth');
const { loginLimiter } = require('../middleware/security');

function createAuthRouter({ sessionSecret, isProduction, demoEnabled }) {
  const router = express.Router();

  router.get('/health', async (req, res) => {
    const dbHealth = await db.healthCheck();
    res.json({ ok: true, name: 'Tax Cup API', database: dbHealth });
  });

  router.get('/config', async (req, res) => {
    let showDemo = demoEnabled;
    try {
      const users = await db.users.list();
      if (!users.some((u) => u.active !== false && u.email !== DEMO_EMAIL)) {
        showDemo = true;
      }
    } catch {}
    res.json({
      demo: showDemo,
      demoEmail: showDemo ? DEMO_EMAIL : null,
      databaseConfigured: db.isConfigured,
    });
  });

  router.get('/session', async (req, res, next) => {
    try {
      const user = await sessionUser(req, sessionSecret);
      res.json({
        authenticated: Boolean(user),
        user: user ? publicUser(user) : null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/register', loginLimiter, async (req, res, next) => {
    try {
      const body = req.body || {};
      const name = text(body.name, 120);
      const email = text(body.email, 160).toLowerCase();
      const department = text(body.department, 120) || 'Finance';
      const title = text(body.title, 120) || 'Payroll Manager';
      const password = String(body.password || '');
      const confirmPassword = String(body.confirmPassword || '');

      if (!name || !email || !password) {
        return res.status(400).json({ ok: false, message: 'Full name, email, and password are required.' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ ok: false, message: 'Please provide a valid email address.' });
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({
          ok: false,
          message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
        });
      }
      if (confirmPassword && password !== confirmPassword) {
        return res.status(400).json({ ok: false, message: 'Passwords do not match.' });
      }

      const existing = await db.users.findByEmail(email);
      if (existing) {
        return res.status(409).json({
          ok: false,
          message: 'An account with this email address already exists. Please sign in instead.',
        });
      }

      const allUsers = await db.users.list();
      const hasSuperAdmin = allUsers.some(
        (u) => u.active !== false && u.role === 'Super Administrator' && u.email !== DEMO_EMAIL
      );
      // Never trust a role from the request: the first real account owns the workspace,
      // everyone after that starts as a Member until an administrator promotes them.
      const role = hasSuperAdmin ? 'Member' : 'Super Administrator';

      const newUser = {
        id: newId('USR'),
        name,
        email,
        department,
        title,
        role,
        passwordHash: hashPassword(password),
        sessionVersion: 0,
        active: true,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      };

      const created = await db.users.create(newUser);
      const user = created || newUser;

      await db.audit.record(user, 'User registered', email, `Role: ${role}`);

      res.status(201).json({
        ok: true,
        user: publicUser(user),
        redirect: 'login.html?registered=1',
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/login', loginLimiter, async (req, res, next) => {
    try {
      const email = text(req.body?.email).toLowerCase();
      const password = String(req.body?.password || '');

      const user = await db.users.findByEmail(email);
      if (!user || user.active === false || !verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({
          ok: false,
          message: 'The email or password is incorrect, or the account is inactive.',
        });
      }

      const updates = { lastActivity: new Date().toISOString() };
      if (!user.passwordHash.startsWith('$2')) {
        updates.passwordHash = hashPassword(password);
      }

      const updatedUser = await db.users.update(user.id, updates);
      const activeUser = updatedUser || { ...user, ...updates };

      setSessionCookie(res, activeUser, sessionSecret, isProduction);
      const requested = String(req.body?.redirect || '');
      const redirect = ALLOWED_REDIRECTS.has(requested) ? requested : 'index.html';

      res.json({
        ok: true,
        user: publicUser(activeUser),
        redirect,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      const user = await sessionUser(req, sessionSecret);
      if (user) {
        await db.users.update(user.id, {
          sessionVersion: (user.sessionVersion || 0) + 1,
        });
      }
      clearSessionCookie(res, isProduction);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = createAuthRouter;
