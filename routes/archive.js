const express = require('express');
const db = require('../lib/db');
const { text, amount, isMonth, newId } = require('../lib/helpers');
const { requireSession, requirePermission } = require('../middleware/auth');

function createArchiveRouter({ sessionSecret }) {
  const router = express.Router();
  const auth = requireSession(sessionSecret);

  router.get('/', auth, requirePermission('payroll:read'), async (req, res, next) => {
    try {
      const type = req.query.type;
      const items = await db.archive.list(type ? { type } : {});
      res.json({ ok: true, items });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', auth, requirePermission('calc:write'), async (req, res, next) => {
    try {
      const body = req.body || {};
      if (!['single', 'batch'].includes(body.type)) {
        return res.status(400).json({ ok: false, message: 'Unknown archive type.' });
      }
      if (!isMonth(body.period)) {
        return res.status(400).json({ ok: false, message: 'Choose a valid payroll month.' });
      }

      const item = {
        id: newId('ARC'),
        type: body.type,
        period: body.period,
        title: text(body.title, 160),
        employeeName: text(body.employeeName, 120),
        count: Math.max(1, Number(body.count) || 1),
        totalNet: amount(body.totalNet),
        snapshot: body.snapshot || null,
        savedAt: new Date().toISOString(),
        savedBy: req.user.name,
      };

      const created = await db.archive.create(item);
      await db.audit.record(
        req.user,
        body.type === 'single' ? 'Saved individual calculation' : 'Saved team calculation',
        `${item.title} / ${item.period}`
      );
      res.status(201).json({ ok: true, item: created || item });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', auth, requirePermission('calc:write'), async (req, res, next) => {
    try {
      const item = await db.archive.findById(req.params.id);
      if (!item) {
        return res.status(404).json({ ok: false, message: 'Saved calculation not found.' });
      }

      await db.archive.delete(item.id);
      await db.audit.record(req.user, 'Deleted saved calculation', `${item.title} / ${item.period}`);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = createArchiveRouter;
