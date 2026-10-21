const express = require('express');
const db = require('../lib/db');
const { cleanEmployee, newId } = require('../lib/helpers');
const { requireSession, requirePermission } = require('../middleware/auth');

function createEmployeesRouter({ sessionSecret }) {
  const router = express.Router();
  const auth = requireSession(sessionSecret);

  router.get('/', auth, requirePermission('employees:read'), async (req, res, next) => {
    try {
      const employees = await db.employees.list();
      res.json({ ok: true, employees });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', auth, requirePermission('employees:write'), async (req, res, next) => {
    try {
      const employee = {
        id: newId('EMP'),
        ...cleanEmployee(req.body || {}),
        createdAt: new Date().toISOString(),
      };

      if (!employee.name) {
        return res.status(400).json({ ok: false, message: 'Employee name is required.' });
      }

      const created = await db.employees.create(employee);
      await db.audit.record(req.user, 'Added employee', employee.name, `Salary ${employee.salary}`);
      res.status(201).json({ ok: true, employee: created || employee });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id', auth, requirePermission('employees:write'), async (req, res, next) => {
    try {
      const before = await db.employees.findById(req.params.id);
      if (!before) {
        return res.status(404).json({ ok: false, message: 'Employee not found.' });
      }

      const updated = cleanEmployee(req.body || {}, before);
      if (!updated.name) {
        return res.status(400).json({ ok: false, message: 'Employee name is required.' });
      }

      const saved = await db.employees.update(before.id, updated);
      await db.audit.record(
        req.user,
        'Updated employee',
        updated.name,
        before.salary !== updated.salary ? `Salary ${before.salary} → ${updated.salary}` : ''
      );
      res.json({ ok: true, employee: saved || updated });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', auth, requirePermission('employees:write'), async (req, res, next) => {
    try {
      const employee = await db.employees.findById(req.params.id);
      if (!employee) {
        return res.status(404).json({ ok: false, message: 'Employee not found.' });
      }

      await db.employees.delete(employee.id);
      await db.audit.record(req.user, 'Removed employee', employee.name);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = createEmployeesRouter;
