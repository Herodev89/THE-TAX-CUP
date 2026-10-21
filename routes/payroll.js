const express = require('express');
const db = require('../lib/db');
const {
  EARNING_KEYS,
  DEDUCTION_KEYS,
  WORKFLOW,
  LOCKED_STATES,
  text,
  amount,
  isMonth,
  newId,
  totalOf,
  cleanRecord,
} = require('../lib/helpers');
const { requireSession, requirePermission } = require('../middleware/auth');

function createPayrollRouter({ sessionSecret }) {
  const router = express.Router();
  const auth = requireSession(sessionSecret);

  // ── Records ────────────────────────────────────────────────────────────────
  router.get('/records', auth, requirePermission('payroll:read'), async (req, res, next) => {
    try {
      const records = await db.records.list();
      res.json({ ok: true, records, workflow: WORKFLOW });
    } catch (error) {
      next(error);
    }
  });

  router.post('/records', auth, requirePermission('payroll:write'), async (req, res, next) => {
    try {
      const body = req.body || {};
      const employee = await db.employees.findById(body.employeeId);
      if (!employee) {
        return res.status(400).json({ ok: false, message: 'Choose an employee from the directory.' });
      }
      if (!isMonth(body.period)) {
        return res.status(400).json({ ok: false, message: 'Choose a valid payroll month.' });
      }

      const existing = await db.records.findByEmployeeAndPeriod(employee.id, body.period);
      if (existing) {
        return res.status(409).json({
          ok: false,
          message: 'A payroll record already exists for this employee and month. Edit the existing record instead.',
        });
      }

      const record = {
        id: newId('PR'),
        ...cleanRecord(body, employee),
        workflowStatus: 'Draft',
        createdAt: new Date().toISOString(),
        createdBy: req.user.name,
      };

      const created = await db.records.create(record);
      const savedRecord = created || record;
      const net = Math.round(totalOf(savedRecord, EARNING_KEYS) - totalOf(savedRecord, DEDUCTION_KEYS));
      await db.audit.record(
        req.user,
        'Created payroll record',
        `${savedRecord.employeeName} / ${savedRecord.period}`,
        `Net ${net}`
      );
      res.status(201).json({ ok: true, record: savedRecord });
    } catch (error) {
      next(error);
    }
  });

  router.put('/records/:id', auth, requirePermission('payroll:write'), async (req, res, next) => {
    try {
      const existing = await db.records.findById(req.params.id);
      if (!existing) {
        return res.status(404).json({ ok: false, message: 'Record not found.' });
      }

      if (LOCKED_STATES.has(existing.workflowStatus)) {
        return res.status(409).json({
          ok: false,
          message: `${existing.workflowStatus} records are locked and cannot be edited.`,
        });
      }

      const period = req.body?.period || existing.period;
      if (!isMonth(period)) {
        return res.status(400).json({ ok: false, message: 'Choose a valid payroll month.' });
      }

      const empId = req.body?.employeeId || existing.employeeId;
      let employee = await db.employees.findById(empId);
      if (!employee) {
        employee = {
          id: existing.employeeId,
          name: existing.employeeName,
          department: existing.department,
          title: existing.title,
        };
      }

      const duplicate = await db.records.findByEmployeeAndPeriod(employee.id, period);
      if (duplicate && duplicate.id !== existing.id) {
        return res.status(409).json({
          ok: false,
          message: 'Another record already exists for this employee and month.',
        });
      }

      const workflowStatus = existing.workflowStatus === 'Approved' ? 'Under Review' : existing.workflowStatus;
      const updates = {
        ...cleanRecord({ ...req.body, period }, employee),
        workflowStatus,
        updatedAt: new Date().toISOString(),
        updatedBy: req.user.name,
      };

      const saved = await db.records.update(existing.id, updates);
      const updatedRecord = saved || { ...existing, ...updates };

      const beforeNet = Math.round(totalOf(existing, EARNING_KEYS) - totalOf(existing, DEDUCTION_KEYS));
      const afterNet = Math.round(totalOf(updatedRecord, EARNING_KEYS) - totalOf(updatedRecord, DEDUCTION_KEYS));

      await db.audit.record(
        req.user,
        'Edited payroll record',
        `${updatedRecord.employeeName} / ${updatedRecord.period}`,
        `Net ${beforeNet} → ${afterNet}`
      );

      res.json({ ok: true, record: updatedRecord });
    } catch (error) {
      next(error);
    }
  });

  router.post('/records/:id/advance', auth, requirePermission('payroll:approve'), async (req, res, next) => {
    try {
      const record = await db.records.findById(req.params.id);
      if (!record) {
        return res.status(404).json({ ok: false, message: 'Record not found.' });
      }

      const current = WORKFLOW.includes(record.workflowStatus) ? record.workflowStatus : 'Draft';
      const currentIndex = WORKFLOW.indexOf(current);
      const nextStatus = WORKFLOW[currentIndex + 1];

      if (!nextStatus) {
        return res.status(409).json({ ok: false, message: 'This record is already paid.' });
      }

      const updates = { workflowStatus: nextStatus };
      if (nextStatus === 'Paid') {
        updates.paymentStatus = 'Paid';
        updates.paymentDate = record.paymentDate || new Date().toISOString().slice(0, 10);
      }

      const saved = await db.records.update(record.id, updates);
      const updatedRecord = saved || { ...record, ...updates };

      await db.audit.record(
        req.user,
        `Moved payroll to ${nextStatus}`,
        `${record.employeeName} / ${record.period}`,
        `${current} → ${nextStatus}`
      );

      res.json({ ok: true, record: updatedRecord });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/records/:id', auth, requirePermission('payroll:write'), async (req, res, next) => {
    try {
      const record = await db.records.findById(req.params.id);
      if (!record) {
        return res.status(404).json({ ok: false, message: 'Record not found.' });
      }

      if (record.workflowStatus !== 'Draft') {
        return res.status(409).json({ ok: false, message: 'Only draft records can be deleted.' });
      }

      await db.records.delete(record.id);
      await db.audit.record(req.user, 'Deleted draft payroll record', `${record.employeeName} / ${record.period}`);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  // ── Runs ───────────────────────────────────────────────────────────────────
  router.get('/runs', auth, requirePermission('payroll:read'), async (req, res, next) => {
    try {
      const runs = await db.runs.list();
      res.json({ ok: true, runs });
    } catch (error) {
      next(error);
    }
  });

  router.post('/runs', auth, requirePermission('payroll:write'), async (req, res, next) => {
    try {
      const body = req.body || {};
      if (!isMonth(body.period)) {
        return res.status(400).json({ ok: false, message: 'Choose a valid payroll month.' });
      }
      if (!Array.isArray(body.results) || !body.results.length) {
        return res.status(400).json({ ok: false, message: 'There are no employees in this run.' });
      }

      const duplicate = await db.runs.findByPeriod(body.period);
      if (duplicate) {
        return res.status(409).json({
          ok: false,
          message: 'A payroll run for this month already exists.',
          run: duplicate,
        });
      }

      const run = {
        id: newId('RUN'),
        period: body.period,
        savedAt: new Date().toISOString(),
        savedBy: req.user.name,
        settings: body.settings || {},
        count: body.results.length,
        totalNet: body.results.reduce((sum, item) => sum + amount(item?.result?.net), 0),
        results: body.results.slice(0, 5000),
      };

      const created = await db.runs.create(run);
      await db.audit.record(req.user, 'Saved company payroll run', run.period, `${run.count} employees`);
      res.status(201).json({ ok: true, run: created || run });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/runs/:id', auth, requirePermission('payroll:write'), async (req, res, next) => {
    try {
      const run = await db.runs.findById(req.params.id);
      if (!run) {
        return res.status(404).json({ ok: false, message: 'Run not found.' });
      }

      await db.runs.delete(run.id);
      await db.audit.record(req.user, 'Deleted company payroll run', run.period);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  // ── Audit export ───────────────────────────────────────────────────────────
  router.post('/audit/export', auth, requirePermission('reports:export'), async (req, res, next) => {
    try {
      await db.audit.record(req.user, 'Exported payroll report', text(req.body?.scope, 120) || 'All periods');
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = createPayrollRouter;
