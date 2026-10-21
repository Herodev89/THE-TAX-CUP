const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const db = require('./lib/db');
const store = require('./lib/store');
const { text, newId } = require('./lib/helpers');
const {
  DEMO_EMAIL,
  sessionUser,
  hashPassword,
  verifyPassword,
} = require('./middleware/auth');
const { securityHeaders, csrfProtection } = require('./middleware/security');

// Route modules
const createAuthRouter = require('./routes/auth');
const createUsersRouter = require('./routes/users');
const createEmployeesRouter = require('./routes/employees');
const createPayrollRouter = require('./routes/payroll');
const createArchiveRouter = require('./routes/archive');
const createAuditRouter = require('./routes/audit');
const createImportRouter = require('./routes/import');

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const publicDir = path.join(__dirname, 'public');
const isProduction = process.env.NODE_ENV === 'production';
const demoEnabled = !isProduction && process.env.DEMO_MODE !== 'false';

// ── Configuration Validation ────────────────────────────────────────────────
function checkConfiguration() {
  const errors = [];
  const fromEnv = process.env.SESSION_SECRET;

  if (fromEnv) {
    if (fromEnv.length < 32) {
      errors.push(`SESSION_SECRET is only ${fromEnv.length} characters long. It must be at least 32 characters.`);
    }
  } else if (isProduction) {
    errors.push('SESSION_SECRET is not set. Production needs it so every server instance signs sessions with the same key.');
  }

  if (isProduction && !db.isConfigured) {
    errors.push('SUPABASE_URL and SUPABASE_SERVICE_KEY are not set. Vercel serverless deployments require Supabase for persistent data storage to avoid instant logouts.');
  }

  if (errors.length) {
    return { error: errors.join(' ') };
  }

  return { secret: fromEnv || store.readOrCreateSecret() };
}

const { secret: sessionSecret, error: configError } = checkConfiguration();

if (configError) {
  console.error(`[config] ${configError}`);
  app.use((req, res) => {
    res.status(503).setHeader('Cache-Control', 'no-store');
    if (req.path.startsWith('/api/')) {
      return res.json({ ok: false, message: `Server not configured: ${configError}` });
    }
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Setup needed · The Tax Cup</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F7F3EC;font:16px/1.6 system-ui,sans-serif;color:#3E372F}main{max-width:620px;margin:24px;padding:36px;background:#fff;border:1px solid #ECE4D6;border-radius:18px}h1{margin:0 0 8px;color:#1A1612;font-size:24px}b{color:#8A6418}code{background:#F4EEE3;padding:2px 6px;border-radius:6px}ol{padding-left:20px}li{margin-bottom:8px}</style></head>
<body><main><h1>The Tax Cup configuration needed</h1><p><b>${configError.replace(/[<>&]/g, '')}</b></p>
<ol>
<li>Open your hosting dashboard (on Vercel: <em>Project → Settings → Environment Variables</em>).</li>
<li>Add <code>SESSION_SECRET</code> with a random value of 32+ characters.</li>
<li>Add <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_KEY</code> from your Supabase project (<em>Settings → API</em>).</li>
<li>Run the SQL migration script in <code>supabase/migration.sql</code> in the Supabase SQL Editor.</li>
<li>Add <code>ADMIN_EMAIL</code> and <code>ADMIN_PASSWORD</code> for your administrator account.</li>
<li>Redeploy.</li>
</ol></main></body></html>`);
  });
}

// ── Proxy Configuration ─────────────────────────────────────────────────────
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
} else if (process.env.VERCEL) {
  app.set('trust proxy', 1);
}

// ── Bootstrap accounts ───────────────────────────────────────────────────────
let bootstrapPromise = null;
async function bootstrapUsers() {
  const users = await db.users.list();
  const adminEmail = text(process.env.ADMIN_EMAIL).toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  // 1. If ADMIN_EMAIL and ADMIN_PASSWORD are provided, ensure that user exists
  if (adminEmail && adminPassword && !users.some((user) => user.email?.toLowerCase() === adminEmail)) {
    await db.users.create({
      id: newId('USR'),
      name: text(process.env.ADMIN_NAME) || 'Administrator',
      email: adminEmail,
      department: 'Finance',
      title: 'System administrator',
      role: 'Super Administrator',
      passwordHash: hashPassword(adminPassword),
      sessionVersion: 0,
      active: true,
      createdAt: new Date().toISOString(),
      lastActivity: null,
    });
    console.log(`Created administrator ${adminEmail} from ADMIN_EMAIL / ADMIN_PASSWORD.`);
  }

  // 2. Always guarantee at least one active administrator exists in the database
  const currentUsers = await db.users.list();
  const hasActiveAdmin = currentUsers.some((user) => user.active !== false && user.role === 'Super Administrator');
  if (!hasActiveAdmin && !currentUsers.some((user) => user.email === DEMO_EMAIL)) {
    await db.users.create({
      id: 'USR-ADMIN',
      name: 'Administrator',
      email: DEMO_EMAIL,
      department: 'Finance',
      title: 'System administrator',
      role: 'Super Administrator',
      passwordHash: hashPassword(process.env.DEMO_PASSWORD || 'demo-password'),
      sessionVersion: 0,
      active: true,
      createdAt: new Date().toISOString(),
      lastActivity: null,
    });
    console.log(`Created default administrator ${DEMO_EMAIL}.`);
  }
}

function ensureBootstrapped() {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapUsers().catch((err) => {
      console.error('[bootstrap] User bootstrap error:', err);
      bootstrapPromise = null;
    });
  }
  return bootstrapPromise;
}

// ── Global Middleware ────────────────────────────────────────────────────────
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Ensure database/accounts are ready before handling requests
app.use(async (req, res, next) => {
  if (configError) return next();
  try {
    await ensureBootstrapped();
    next();
  } catch (err) {
    next(err);
  }
});

// ── API Routes ───────────────────────────────────────────────────────────────
const routeContext = { sessionSecret, isProduction, demoEnabled };

// CSRF protection for mutating API calls
app.use('/api', csrfProtection);

app.use('/api', createAuthRouter(routeContext));
app.use('/api/users', createUsersRouter(routeContext));
app.use('/api/employees', createEmployeesRouter(routeContext));
app.use('/api', createPayrollRouter(routeContext));
app.use('/api/archive', createArchiveRouter(routeContext));
app.use('/api/audit', createAuditRouter(routeContext));
app.use('/api/import', createImportRouter(routeContext));

app.use('/api', (req, res) => res.status(404).json({ ok: false, message: 'Not found.' }));

// ── Pages ────────────────────────────────────────────────────────────────────
const PROTECTED_PAGES = new Set(['index.html', 'employees.html', 'company.html', 'payroll.html']);
const sendPage = (res, page) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(publicDir, page));
};

app.get('/', async (req, res) => {
  const user = await sessionUser(req, sessionSecret);
  return user ? res.redirect('/index.html') : sendPage(res, 'landing.html');
});

app.get(['/landing', '/landing.html'], (req, res) => sendPage(res, 'landing.html'));

app.get(['/login', '/login.html'], async (req, res) => {
  const user = await sessionUser(req, sessionSecret);
  return user ? res.redirect('/index.html') : sendPage(res, 'login.html');
});

app.get('/:page', async (req, res, next) => {
  const page = String(req.params.page).toLowerCase();
  if (!PROTECTED_PAGES.has(page)) return next();
  const user = await sessionUser(req, sessionSecret);
  if (!user) return res.redirect(`/login.html?redirect=${encodeURIComponent(page)}`);
  sendPage(res, page);
});

// Static assets from /public (HTML files are served only by explicit routes)
const serveStatic = express.static(publicDir, {
  index: false,
  dotfiles: 'ignore',
  redirect: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
});

app.use((req, res, next) => {
  let decoded;
  try {
    decoded = decodeURIComponent(req.path);
  } catch (error) {
    return res.status(400).end();
  }
  if (/\.html?$/i.test(decoded)) return next();
  serveStatic(req, res, next);
});

app.use(async (req, res) => {
  if (req.method === 'GET' && req.accepts('html')) {
    const user = await sessionUser(req, sessionSecret);
    return res.redirect(user ? '/index.html' : '/');
  }
  res.status(404).end();
});

// Global Error Handler
app.use((error, req, res, next) => {
  console.error('[server error]', error);
  const status = error.status || 500;
  const message = error.message || 'Something went wrong on the server.';
  res.status(status).json({ ok: false, message });
});

if (require.main === module) {
  app.listen(port, host, () => {
    console.log(`The Tax Cup is running on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    if (host === '0.0.0.0') console.log('Listening on all network interfaces (HOST=0.0.0.0).');
    if (db.isConfigured) console.log('Connected to Supabase database.');
    else console.log('Running with local file storage fallback (set SUPABASE_URL & SUPABASE_SERVICE_KEY for production).');
    if (demoEnabled) console.log(`Demo mode: sign in as ${DEMO_EMAIL}. Set NODE_ENV=production to disable it.`);
  });
}

module.exports = app;
