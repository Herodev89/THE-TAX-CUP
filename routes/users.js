const express = require('express');
const db = require('../lib/db');
const { text, newId } = require('../lib/helpers');
const {
  ROLES,
  MIN_PASSWORD_LENGTH,
  publicUser,
  hashPassword,
  requireSession,
  requirePermission,
} = require('../middleware/auth');

function createUsersRouter({ sessionSecret }) {
  const router = express.Router();
  const auth = requireSession(sessionSecret);
  const checkPerm = requirePermission('users:manage');

  router.use(auth, checkPerm);

  router.get('/', async (req, res, next) => {
    try {
      const users = await db.users.list();
      res.json({
        ok: true,
        users: users.map(publicUser),
        roles: Object.keys(ROLES),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const body = req.body || {};
      const name = text(body.name, 120);
      const email = text(body.email, 160).toLowerCase();
      const password = String(body.password || '');
      const role = text(body.role) || 'HR Manager';

      if (!name || !email || !password) {
        return res.status(400).json({ ok: false, message: 'Name, email and password are required.' });
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
      if (!ROLES[role]) {
        return res.status(400).json({ ok: false, message: 'Unknown role.' });
      }

      const existing = await db.users.findByEmail(email);
      if (existing) {
        return res.status(409).json({ ok: false, message: 'A user with this email already exists.' });
      }

      const user = {
        id: newId('USR'),
        name,
        email,
        department: text(body.department, 120),
        title: text(body.title, 120),
        role,
        passwordHash: hashPassword(password),
        sessionVersion: 0,
        active: true,
        createdAt: new Date().toISOString(),
        lastActivity: null,
      };

      const created = await db.users.create(user);
      await db.audit.record(req.user, 'Created user', email, `Role ${role}`);
      res.status(201).json({ ok: true, user: publicUser(created || user) });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const user = await db.users.findById(req.params.id);
      if (!user) return res.status(404).json({ ok: false, message: 'User not found.' });

      const body = req.body || {};
      const changes = [];
      const updates = {};

      if (req.user.id === user.id && (body.active === false || (body.role && body.role !== user.role))) {
        return res.status(400).json({
          ok: false,
          message: 'You cannot deactivate or change the role of your own account.',
        });
      }

      if (typeof body.active === 'boolean' && body.active !== (user.active !== false)) {
        updates.active = body.active;
        if (!body.active) updates.sessionVersion = (user.sessionVersion || 0) + 1;
        changes.push(body.active ? 'Activated' : 'Deactivated');
      }

      if (body.role !== undefined) {
        if (!ROLES[body.role]) return res.status(400).json({ ok: false, message: 'Unknown role.' });
        if (body.role !== user.role) changes.push(`Role ${user.role} → ${body.role}`);
        updates.role = body.role;
      }

      if (typeof body.department === 'string') updates.department = text(body.department, 120);
      if (typeof body.title === 'string') updates.title = text(body.title, 120);

      if (body.password !== undefined) {
        if (String(body.password).length < MIN_PASSWORD_LENGTH) {
          return res.status(400).json({
            ok: false,
            message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
          });
        }
        updates.passwordHash = hashPassword(body.password);
        updates.sessionVersion = (user.sessionVersion || 0) + 1;
        changes.push('Password reset');
      }

      const updated = await db.users.update(user.id, updates);
      await db.audit.record(req.user, 'Updated user', user.email, changes.join(', ') || 'Profile details');
      res.json({ ok: true, user: publicUser(updated || { ...user, ...updates }) });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      if (req.user.id === req.params.id) {
        return res.status(400).json({ ok: false, message: 'You cannot delete your own account.' });
      }
      const user = await db.users.findById(req.params.id);
      if (!user) return res.status(404).json({ ok: false, message: 'User not found.' });

      await db.users.delete(user.id);
      await db.audit.record(req.user, 'Deleted user', user.email);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = createUsersRouter;
