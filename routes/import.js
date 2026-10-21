const express = require('express');
const db = require('../lib/db');
const {
  WORKFLOW,
  text,
  amount,
  isMonth,
  newId,
  cleanEmployee,
  cleanRecord,
} = require('../lib/helpers');
const { requireSession, requirePermission } = require('../middleware/auth');

function createImportRouter({ sessionSecret }) {
  const router = express.Router();
  const auth = requireSession(sessionSecret);

  router.post('/', auth, requirePermission('users:manage'), async (req, res, next) => {
    try {
      const body = req.body || {};
      const counts = { employees: 0, records: 0, runs: 0, archive: 0 };

      // 1. Employees
      const existingEmployees = await db.employees.list();
      const idMap = new Map();
      const newEmployees = [];

      (Array.isArray(body.employees) ? body.employees : []).forEach((raw) => {
        const name = text(raw?.name, 120);
        if (!name) return;
        const match = existingEmployees.find(
          (item) => item.legacyId === String(raw.id) || item.name.toLowerCase() === name.toLowerCase()
        );
        if (match) {
          idMap.set(String(raw.id), match.id);
          return;
        }
        const employee = {
          id: newId('EMP'),
          legacyId: String(raw.id),
          ...cleanEmployee({ ...raw, title: raw.title || raw.role }),
          createdAt: new Date().toISOString(),
        };
        newEmployees.push(employee);
        existingEmployees.push(employee);
        idMap.set(String(raw.id), employee.id);
        counts.employees += 1;
      });

      if (newEmployees.length) {
        await db.employees.batchInsert(newEmployees);
      }

      // 2. Records
      const existingRecords = await db.records.list();
      const newRecords = [];

      (Array.isArray(body.records) ? body.records : []).forEach((raw) => {
        if (!raw || String(raw.id || '').startsWith('SEED-') || !isMonth(raw.period)) return;
        const employeeId = idMap.get(String(raw.employeeId));
        const employee = existingEmployees.find((item) => item.id === employeeId);
        if (!employee || existingRecords.some((item) => item.employeeId === employee.id && item.period === raw.period)) {
          return;
        }
        const rec = {
          id: newId('PR'),
          ...cleanRecord(raw, employee),
          workflowStatus: WORKFLOW.includes(raw.workflowStatus) ? raw.workflowStatus : 'Draft',
          createdAt: raw.createdAt || new Date().toISOString(),
          createdBy: `${req.user.name} (import)`,
        };
        newRecords.push(rec);
        existingRecords.push(rec);
        counts.records += 1;
      });

      if (newRecords.length) {
        await db.records.batchInsert(newRecords);
      }

      // 3. Runs
      const existingRuns = await db.runs.list();
      const newRuns = [];

      (Array.isArray(body.runs) ? body.runs : []).forEach((raw) => {
        if (!raw?.results || !isMonth(raw.period) || existingRuns.some((run) => run.period === raw.period)) {
          return;
        }
        const run = {
          id: newId('RUN'),
          period: raw.period,
          savedAt: new Date().toISOString(),
          savedBy: `${req.user.name} (import)`,
          settings: {},
          count: raw.results.length,
          totalNet: amount(raw.total),
          results: raw.results,
          legacy: true,
        };
        newRuns.push(run);
        existingRuns.push(run);
        counts.runs += 1;
      });

      if (newRuns.length) {
        await db.runs.batchInsert(newRuns);
      }

      // 4. Archive
      const existingArchive = await db.archive.list();
      const newArchive = [];

      (Array.isArray(body.archive) ? body.archive : []).forEach((raw) => {
        if (!['single', 'batch'].includes(raw?.type) || !isMonth(raw.period)) return;
        const item = {
          id: newId('ARC'),
          type: raw.type,
          period: raw.period,
          title: text(raw.title, 160),
          employeeName: text(raw.employeeName, 120),
          count: Number(raw.count) || 1,
          totalNet: amount(raw.totalNet),
          snapshot: raw.snapshot || null,
          savedAt: raw.savedAt || new Date().toISOString(),
          savedBy: `${req.user.name} (import)`,
          legacy: true,
        };
        newArchive.push(item);
        existingArchive.push(item);
        counts.archive += 1;
      });

      if (newArchive.length) {
        await db.archive.batchInsert(newArchive);
      }

      await db.audit.record(
        req.user,
        'Imported browser data',
        'Local workspace',
        `${counts.employees} employees, ${counts.records} records, ${counts.runs} runs, ${counts.archive} saved calculations`
      );

      res.json({ ok: true, counts });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = createImportRouter;
