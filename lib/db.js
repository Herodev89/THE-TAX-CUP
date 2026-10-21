const { createClient } = require('@supabase/supabase-js');
const store = require('./store');
const { text, newId } = require('./helpers');

function cleanSupabaseUrl(rawUrl) {
  if (!rawUrl) return '';
  let url = String(rawUrl).trim().replace(/^["']|["']$/g, '');

  // If user pasted dashboard URL: https://supabase.com/dashboard/project/<ref>...
  const matchDashboard = url.match(/supabase\.com\/dashboard\/project\/([a-z0-9_-]+)/i);
  if (matchDashboard) {
    return `https://${matchDashboard[1]}.supabase.co`;
  }

  // Remove trailing slashes or subpaths like /rest/v1, /api, etc.
  url = url.replace(/\/+$/, '');
  url = url.replace(/\/(rest|auth|storage|graphql)\/v\d+.*$/i, '');
  url = url.replace(/\/api\/?$/i, '');
  url = url.replace(/\/+$/, '');

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return url;
}

function cleanSupabaseKey(rawKey) {
  if (!rawKey) return '';
  return String(rawKey).trim().replace(/^["']|["']$/g, '');
}

const rawSupabaseUrl = process.env.SUPABASE_URL;
const rawSupabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseUrl = cleanSupabaseUrl(rawSupabaseUrl);
const supabaseKey = cleanSupabaseKey(rawSupabaseKey);
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

let supabase = null;
if (isSupabaseConfigured) {
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// ── Row Converters ───────────────────────────────────────────────────────────
function userRowToJs(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    department: row.department || '',
    title: row.title || '',
    role: row.role,
    passwordHash: row.password_hash,
    sessionVersion: Number(row.session_version || 0),
    active: row.active !== false,
    createdAt: row.created_at,
    lastActivity: row.last_activity,
  };
}

function userJsToRow(user) {
  const row = {};
  if (user.id !== undefined) row.id = user.id;
  if (user.name !== undefined) row.name = user.name;
  if (user.email !== undefined) row.email = user.email.toLowerCase();
  if (user.department !== undefined) row.department = user.department;
  if (user.title !== undefined) row.title = user.title;
  if (user.role !== undefined) row.role = user.role;
  if (user.passwordHash !== undefined) row.password_hash = user.passwordHash;
  if (user.sessionVersion !== undefined) row.session_version = user.sessionVersion;
  if (user.active !== undefined) row.active = user.active;
  if (user.createdAt !== undefined) row.created_at = user.createdAt;
  if (user.lastActivity !== undefined) row.last_activity = user.lastActivity;
  return row;
}

function employeeRowToJs(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    department: row.department || '',
    title: row.title || '',
    salary: Number(row.salary || 0),
    annualRent: Number(row.annual_rent || 0),
    status: row.status || 'Active',
    legacyId: row.legacy_id || null,
    createdAt: row.created_at,
  };
}

function employeeJsToRow(emp) {
  const row = {};
  if (emp.id !== undefined) row.id = String(emp.id);
  if (emp.name !== undefined) row.name = emp.name;
  if (emp.department !== undefined) row.department = emp.department;
  if (emp.title !== undefined) row.title = emp.title;
  if (emp.salary !== undefined) row.salary = emp.salary;
  if (emp.annualRent !== undefined) row.annual_rent = emp.annualRent;
  if (emp.status !== undefined) row.status = emp.status;
  if (emp.legacyId !== undefined) row.legacy_id = emp.legacyId;
  if (emp.createdAt !== undefined) row.created_at = emp.createdAt;
  return row;
}

function recordRowToJs(row) {
  if (!row) return null;
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    department: row.department || '',
    title: row.title || '',
    period: row.period,
    annualRent: Number(row.annual_rent || 0),
    basic: Number(row.basic || 0),
    housing: Number(row.housing || 0),
    transport: Number(row.transport || 0),
    meal: Number(row.meal || 0),
    utility: Number(row.utility || 0),
    otherAllowances: Number(row.other_allowances || 0),
    bonus: Number(row.bonus || 0),
    overtime: Number(row.overtime || 0),
    commission: Number(row.commission || 0),
    arrears: Number(row.arrears || 0),
    otherEarnings: Number(row.other_earnings || 0),
    paye: Number(row.paye || 0),
    pension: Number(row.pension || 0),
    nhf: Number(row.nhf || 0),
    nhis: Number(row.nhis || 0),
    loan: Number(row.loan || 0),
    advance: Number(row.advance || 0),
    absence: Number(row.absence || 0),
    otherDeductions: Number(row.other_deductions || 0),
    employerPension: Number(row.employer_pension || 0),
    nsitf: Number(row.nsitf || 0),
    itf: Number(row.itf || 0),
    workflowStatus: row.workflow_status || 'Draft',
    paymentStatus: row.payment_status || 'Pending',
    paymentDate: row.payment_date || '',
    reference: row.reference || '',
    remarks: row.remarks || '',
    createdAt: row.created_at,
    createdBy: row.created_by || '',
    updatedAt: row.updated_at || null,
    updatedBy: row.updated_by || '',
  };
}

function recordJsToRow(rec) {
  const row = {};
  if (rec.id !== undefined) row.id = rec.id;
  if (rec.employeeId !== undefined) row.employee_id = String(rec.employeeId);
  if (rec.employeeName !== undefined) row.employee_name = rec.employeeName;
  if (rec.department !== undefined) row.department = rec.department;
  if (rec.title !== undefined) row.title = rec.title;
  if (rec.period !== undefined) row.period = rec.period;
  if (rec.annualRent !== undefined) row.annual_rent = rec.annualRent;

  if (rec.basic !== undefined) row.basic = rec.basic;
  if (rec.housing !== undefined) row.housing = rec.housing;
  if (rec.transport !== undefined) row.transport = rec.transport;
  if (rec.meal !== undefined) row.meal = rec.meal;
  if (rec.utility !== undefined) row.utility = rec.utility;
  if (rec.otherAllowances !== undefined) row.other_allowances = rec.otherAllowances;
  if (rec.bonus !== undefined) row.bonus = rec.bonus;
  if (rec.overtime !== undefined) row.overtime = rec.overtime;
  if (rec.commission !== undefined) row.commission = rec.commission;
  if (rec.arrears !== undefined) row.arrears = rec.arrears;
  if (rec.otherEarnings !== undefined) row.other_earnings = rec.otherEarnings;

  if (rec.paye !== undefined) row.paye = rec.paye;
  if (rec.pension !== undefined) row.pension = rec.pension;
  if (rec.nhf !== undefined) row.nhf = rec.nhf;
  if (rec.nhis !== undefined) row.nhis = rec.nhis;
  if (rec.loan !== undefined) row.loan = rec.loan;
  if (rec.advance !== undefined) row.advance = rec.advance;
  if (rec.absence !== undefined) row.absence = rec.absence;
  if (rec.otherDeductions !== undefined) row.other_deductions = rec.otherDeductions;

  if (rec.employerPension !== undefined) row.employer_pension = rec.employerPension;
  if (rec.nsitf !== undefined) row.nsitf = rec.nsitf;
  if (rec.itf !== undefined) row.itf = rec.itf;

  if (rec.workflowStatus !== undefined) row.workflow_status = rec.workflowStatus;
  if (rec.paymentStatus !== undefined) row.payment_status = rec.paymentStatus;
  if (rec.paymentDate !== undefined) row.payment_date = rec.paymentDate;
  if (rec.reference !== undefined) row.reference = rec.reference;
  if (rec.remarks !== undefined) row.remarks = rec.remarks;
  if (rec.createdAt !== undefined) row.created_at = rec.createdAt;
  if (rec.createdBy !== undefined) row.created_by = rec.createdBy;
  if (rec.updatedAt !== undefined) row.updated_at = rec.updatedAt;
  if (rec.updatedBy !== undefined) row.updated_by = rec.updatedBy;
  return row;
}

function runRowToJs(row) {
  if (!row) return null;
  return {
    id: row.id,
    period: row.period,
    savedAt: row.saved_at,
    savedBy: row.saved_by || '',
    settings: row.settings || {},
    count: Number(row.count || 0),
    totalNet: Number(row.total_net || 0),
    results: row.results || [],
    legacy: Boolean(row.legacy),
  };
}

function runJsToRow(run) {
  const row = {};
  if (run.id !== undefined) row.id = run.id;
  if (run.period !== undefined) row.period = run.period;
  if (run.savedAt !== undefined) row.saved_at = run.savedAt;
  if (run.savedBy !== undefined) row.saved_by = run.savedBy;
  if (run.settings !== undefined) row.settings = run.settings;
  if (run.count !== undefined) row.count = run.count;
  if (run.totalNet !== undefined) row.total_net = run.totalNet;
  if (run.results !== undefined) row.results = run.results;
  if (run.legacy !== undefined) row.legacy = run.legacy;
  return row;
}

function archiveRowToJs(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    period: row.period,
    title: row.title || '',
    employeeName: row.employee_name || '',
    count: Number(row.count || 1),
    totalNet: Number(row.total_net || 0),
    snapshot: row.snapshot || null,
    savedAt: row.saved_at,
    savedBy: row.saved_by || '',
    legacy: Boolean(row.legacy),
  };
}

function archiveJsToRow(item) {
  const row = {};
  if (item.id !== undefined) row.id = item.id;
  if (item.type !== undefined) row.type = item.type;
  if (item.period !== undefined) row.period = item.period;
  if (item.title !== undefined) row.title = item.title;
  if (item.employeeName !== undefined) row.employee_name = item.employeeName;
  if (item.count !== undefined) row.count = item.count;
  if (item.totalNet !== undefined) row.total_net = item.totalNet;
  if (item.snapshot !== undefined) row.snapshot = item.snapshot;
  if (item.savedAt !== undefined) row.saved_at = item.savedAt;
  if (item.savedBy !== undefined) row.saved_by = item.savedBy;
  if (item.legacy !== undefined) row.legacy = item.legacy;
  return row;
}

function auditRowToJs(row) {
  if (!row) return null;
  return {
    id: row.id,
    at: row.at,
    userId: row.user_id || null,
    user: row.user_text || 'System',
    action: row.action,
    affected: row.affected || '',
    change: row.change || '',
  };
}

function formatDbError(error) {
  if (!error) return new Error('Unknown database error');
  const msg = error.message || String(error);
  if (msg.includes('Invalid path specified in request URL') || msg.includes('Invalid path')) {
    const err = new Error(
      "Invalid SUPABASE_URL in Vercel. SUPABASE_URL must be the base project URL: https://<project-ref>.supabase.co (without /rest/v1 or /dashboard or trailing slashes)."
    );
    err.status = 503;
    err.code = 'INVALID_SUPABASE_URL';
    return err;
  }
  if (error.code === '42P01' || msg.includes('does not exist') || msg.includes('relation')) {
    const err = new Error("Supabase tables not found. Please run the SQL in 'supabase/migration.sql' in your Supabase SQL Editor.");
    err.status = 503;
    err.code = 'TABLE_MISSING';
    return err;
  }
  if (error.code === 'PGRST301' || msg.includes('JWT') || msg.includes('apikey') || error.status === 401 || msg.includes('invalid API key')) {
    const err = new Error("Supabase authentication failed. Please check SUPABASE_SERVICE_KEY (use the service_role key, not the anon key) in Vercel.");
    err.status = 503;
    err.code = 'AUTH_ERROR';
    return err;
  }
  const err = new Error(`Database error: ${msg}`);
  err.status = 500;
  return err;
}

// ── Database Operations ──────────────────────────────────────────────────────
const db = {
  isConfigured: isSupabaseConfigured,
  supabase,
  formatDbError,

  async healthCheck() {
    if (!isSupabaseConfigured) {
      return { connected: false, mode: 'local_storage', message: 'Local file storage fallback (SUPABASE_URL or SUPABASE_SERVICE_KEY not set).' };
    }
    try {
      const { data, error } = await supabase.from('users').select('id').limit(1);
      if (error) {
        return { connected: false, mode: 'supabase', error: formatDbError(error).message };
      }
      return { connected: true, mode: 'supabase', message: 'Connected to Supabase database.' };
    } catch (err) {
      return { connected: false, mode: 'supabase', error: err.message };
    }
  },

  users: {
    async list() {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
        if (error) throw formatDbError(error);
        return (data || []).map(userRowToJs);
      }
      return store.list('users');
    },

    async findById(id) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
        if (error) throw formatDbError(error);
        return userRowToJs(data);
      }
      return store.list('users').find((u) => u.id === id) || null;
    },

    async findByEmail(email) {
      const normalized = String(email || '').toLowerCase().trim();
      if (!normalized) return null;
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.from('users').select('*').ilike('email', normalized).maybeSingle();
        if (error) throw formatDbError(error);
        return userRowToJs(data);
      }
      return store.list('users').find((u) => u.email?.toLowerCase() === normalized) || null;
    },

    async create(user) {
      if (isSupabaseConfigured) {
        const row = userJsToRow(user);
        const { data, error } = await supabase.from('users').insert(row).select().single();
        if (error) throw formatDbError(error);
        return userRowToJs(data);
      }
      const users = store.list('users');
      users.unshift(user);
      store.save('users', users);
      return user;
    },

    async update(id, changes) {
      if (isSupabaseConfigured) {
        const row = userJsToRow(changes);
        const { data, error } = await supabase.from('users').update(row).eq('id', id).select().single();
        if (error) throw formatDbError(error);
        return userRowToJs(data);
      }
      const users = store.list('users');
      const idx = users.findIndex((u) => u.id === id);
      if (idx === -1) return null;
      users[idx] = { ...users[idx], ...changes };
      store.save('users', users);
      return users[idx];
    },

    async delete(id) {
      if (isSupabaseConfigured) {
        const { error } = await supabase.from('users').delete().eq('id', id);
        if (error) throw formatDbError(error);
        return true;
      }
      const users = store.list('users');
      store.save('users', users.filter((u) => u.id !== id));
      return true;
    },
  },

  employees: {
    async list() {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.from('employees').select('*').order('name', { ascending: true });
        if (error) throw formatDbError(error);
        return (data || []).map(employeeRowToJs);
      }
      return store.list('employees');
    },

    async findById(id) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.from('employees').select('*').eq('id', String(id)).maybeSingle();
        if (error) throw formatDbError(error);
        return employeeRowToJs(data);
      }
      return store.list('employees').find((e) => String(e.id) === String(id)) || null;
    },

    async create(emp) {
      if (isSupabaseConfigured) {
        const row = employeeJsToRow(emp);
        const { data, error } = await supabase.from('employees').insert(row).select().single();
        if (error) throw formatDbError(error);
        return employeeRowToJs(data);
      }
      const employees = store.list('employees');
      employees.push(emp);
      store.save('employees', employees);
      return emp;
    },

    async update(id, changes) {
      if (isSupabaseConfigured) {
        const row = employeeJsToRow(changes);
        const { data, error } = await supabase.from('employees').update(row).eq('id', String(id)).select().single();
        if (error) throw formatDbError(error);
        return employeeRowToJs(data);
      }
      const employees = store.list('employees');
      const idx = employees.findIndex((e) => String(e.id) === String(id));
      if (idx === -1) return null;
      employees[idx] = { ...employees[idx], ...changes };
      store.save('employees', employees);
      return employees[idx];
    },

    async delete(id) {
      if (isSupabaseConfigured) {
        const { error } = await supabase.from('employees').delete().eq('id', String(id));
        if (error) throw formatDbError(error);
        return true;
      }
      const employees = store.list('employees');
      store.save('employees', employees.filter((e) => String(e.id) !== String(id)));
      return true;
    },

    async batchInsert(items) {
      if (!items || !items.length) return [];
      if (isSupabaseConfigured) {
        const rows = items.map(employeeJsToRow);
        const { data, error } = await supabase.from('employees').insert(rows).select();
        if (error) throw formatDbError(error);
        return (data || []).map(employeeRowToJs);
      }
      const employees = store.list('employees');
      employees.push(...items);
      store.save('employees', employees);
      return items;
    },
  },

  records: {
    async list(filter = {}) {
      if (isSupabaseConfigured) {
        let query = supabase.from('records').select('*').order('period', { ascending: false });
        if (filter.period) query = query.eq('period', filter.period);
        if (filter.employeeId) query = query.eq('employee_id', String(filter.employeeId));
        const { data, error } = await query;
        if (error) throw formatDbError(error);
        return (data || []).map(recordRowToJs);
      }
      let records = store.list('records');
      if (filter.period) records = records.filter((r) => r.period === filter.period);
      if (filter.employeeId) records = records.filter((r) => String(r.employeeId) === String(filter.employeeId));
      return records;
    },

    async findById(id) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.from('records').select('*').eq('id', id).maybeSingle();
        if (error) throw formatDbError(error);
        return recordRowToJs(data);
      }
      return store.list('records').find((r) => r.id === id) || null;
    },

    async findByEmployeeAndPeriod(employeeId, period) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('records')
          .select('*')
          .eq('employee_id', String(employeeId))
          .eq('period', period)
          .maybeSingle();
        if (error) throw formatDbError(error);
        return recordRowToJs(data);
      }
      return store.list('records').find((r) => String(r.employeeId) === String(employeeId) && r.period === period) || null;
    },

    async create(rec) {
      if (isSupabaseConfigured) {
        const row = recordJsToRow(rec);
        const { data, error } = await supabase.from('records').insert(row).select().single();
        if (error) throw formatDbError(error);
        return recordRowToJs(data);
      }
      const records = store.list('records');
      records.unshift(rec);
      store.save('records', records);
      return rec;
    },

    async update(id, changes) {
      if (isSupabaseConfigured) {
        const row = recordJsToRow(changes);
        const { data, error } = await supabase.from('records').update(row).eq('id', id).select().single();
        if (error) throw formatDbError(error);
        return recordRowToJs(data);
      }
      const records = store.list('records');
      const idx = records.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      records[idx] = { ...records[idx], ...changes };
      store.save('records', records);
      return records[idx];
    },

    async delete(id) {
      if (isSupabaseConfigured) {
        const { error } = await supabase.from('records').delete().eq('id', id);
        if (error) throw formatDbError(error);
        return true;
      }
      const records = store.list('records');
      store.save('records', records.filter((r) => r.id !== id));
      return true;
    },

    async batchInsert(items) {
      if (!items || !items.length) return [];
      if (isSupabaseConfigured) {
        const rows = items.map(recordJsToRow);
        const { data, error } = await supabase.from('records').insert(rows).select();
        if (error) throw formatDbError(error);
        return (data || []).map(recordRowToJs);
      }
      const records = store.list('records');
      records.push(...items);
      store.save('records', records);
      return items;
    },
  },

  runs: {
    async list() {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.from('runs').select('*').order('period', { ascending: false });
        if (error) throw formatDbError(error);
        return (data || []).map(runRowToJs);
      }
      return store.list('runs');
    },

    async findById(id) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.from('runs').select('*').eq('id', String(id)).maybeSingle();
        if (error) throw formatDbError(error);
        return runRowToJs(data);
      }
      return store.list('runs').find((r) => String(r.id) === String(id)) || null;
    },

    async findByPeriod(period) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.from('runs').select('*').eq('period', period).maybeSingle();
        if (error) throw formatDbError(error);
        return runRowToJs(data);
      }
      return store.list('runs').find((r) => r.period === period) || null;
    },

    async create(run) {
      if (isSupabaseConfigured) {
        const row = runJsToRow(run);
        const { data, error } = await supabase.from('runs').insert(row).select().single();
        if (error) throw formatDbError(error);
        return runRowToJs(data);
      }
      const runs = store.list('runs');
      runs.unshift(run);
      store.save('runs', runs);
      return run;
    },

    async delete(id) {
      if (isSupabaseConfigured) {
        const { error } = await supabase.from('runs').delete().eq('id', String(id));
        if (error) throw formatDbError(error);
        return true;
      }
      const runs = store.list('runs');
      store.save('runs', runs.filter((r) => String(r.id) !== String(id)));
      return true;
    },

    async batchInsert(items) {
      if (!items || !items.length) return [];
      if (isSupabaseConfigured) {
        const rows = items.map(runJsToRow);
        const { data, error } = await supabase.from('runs').insert(rows).select();
        if (error) throw formatDbError(error);
        return (data || []).map(runRowToJs);
      }
      const runs = store.list('runs');
      runs.push(...items);
      store.save('runs', runs);
      return items;
    },
  },

  archive: {
    async list(filter = {}) {
      if (isSupabaseConfigured) {
        let query = supabase.from('archive').select('*').order('saved_at', { ascending: false });
        if (filter.type) query = query.eq('type', filter.type);
        const { data, error } = await query;
        if (error) throw formatDbError(error);
        return (data || []).map(archiveRowToJs);
      }
      let items = store.list('archive');
      if (filter.type) items = items.filter((a) => a.type === filter.type);
      return items;
    },

    async findById(id) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.from('archive').select('*').eq('id', String(id)).maybeSingle();
        if (error) throw formatDbError(error);
        return archiveRowToJs(data);
      }
      return store.list('archive').find((a) => String(a.id) === String(id)) || null;
    },

    async create(item) {
      if (isSupabaseConfigured) {
        const row = archiveJsToRow(item);
        const { data, error } = await supabase.from('archive').insert(row).select().single();
        if (error) throw formatDbError(error);
        return archiveRowToJs(data);
      }
      const items = store.list('archive');
      items.unshift(item);
      store.save('archive', items.slice(0, 2000));
      return item;
    },

    async delete(id) {
      if (isSupabaseConfigured) {
        const { error } = await supabase.from('archive').delete().eq('id', String(id));
        if (error) throw formatDbError(error);
        return true;
      }
      const items = store.list('archive');
      store.save('archive', items.filter((a) => String(a.id) !== String(id)));
      return true;
    },

    async batchInsert(items) {
      if (!items || !items.length) return [];
      if (isSupabaseConfigured) {
        const rows = items.map(archiveJsToRow);
        const { data, error } = await supabase.from('archive').insert(rows).select();
        if (error) throw formatDbError(error);
        return (data || []).map(archiveRowToJs);
      }
      const archive = store.list('archive');
      archive.push(...items);
      store.save('archive', archive);
      return items;
    },
  },

  audit: {
    async list(limit = 1000) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('audit')
          .select('*')
          .order('at', { ascending: false })
          .limit(limit);
        if (error) throw formatDbError(error);
        return (data || []).map(auditRowToJs);
      }
      return store.list('audit').slice(0, limit);
    },

    async record(actor, action, affected = '', change = '') {
      const entry = {
        id: newId('AUD'),
        at: new Date().toISOString(),
        userId: actor?.id || null,
        user: actor ? `${actor.name} (${actor.role})` : 'System',
        action,
        affected: text(affected, 300),
        change: text(change, 300),
      };

      if (isSupabaseConfigured) {
        const row = {
          id: entry.id,
          at: entry.at,
          user_id: entry.userId,
          user_text: entry.user,
          action: entry.action,
          affected: entry.affected,
          change: entry.change,
        };
        const { error } = await supabase.from('audit').insert(row);
        if (error) console.error('[audit] Could not save audit event to Supabase:', error.message);
        return entry;
      }

      const entries = store.list('audit');
      entries.unshift(entry);
      store.save('audit', entries.slice(0, 5000));
      return entry;
    },
  },

  config: {
    async get(key) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.from('app_config').select('value').eq('key', key).maybeSingle();
        if (error) throw formatDbError(error);
        return data ? data.value : null;
      }
      return null;
    },

    async set(key, value) {
      if (isSupabaseConfigured) {
        const { error } = await supabase.from('app_config').upsert({ key, value });
        if (error) throw formatDbError(error);
        return true;
      }
      return false;
    },
  },
};

module.exports = db;
