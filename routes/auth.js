const express = require('express');
const db = require('../lib/db');
const { text, ALLOWED_REDIRECTS } = require('../lib/helpers');
const {
  DEMO_EMAIL,
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

  router.get('/health', (req, res) => {
    res.json({ ok: true, name: 'Tax Cup API' });
  });

  router.get('/config', (req, res) => {
    res.json({
      demo: demoEnabled,
      demoEmail: demoEnabled ? DEMO_EMAIL : null,
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
