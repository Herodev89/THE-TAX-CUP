const express = require('express');
const db = require('../lib/db');
const { requireSession, requirePermission } = require('../middleware/auth');

function createAuditRouter({ sessionSecret }) {
  const router = express.Router();
  const auth = requireSession(sessionSecret);

  router.get('/', auth, requirePermission('audit:read'), async (req, res, next) => {
    try {
      const entries = await db.audit.list(1000);
      res.json({ ok: true, entries });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = createAuditRouter;
