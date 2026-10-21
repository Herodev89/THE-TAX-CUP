# THE TAX CUP

Nigerian PAYE calculator and payroll workspace — **Simplifying Tax & Compliance for Businesses**.

| Page | What it does |
|---|---|
| `landing.html` | Public overview with a live take-home estimate |
| `login.html` | Sign-in |
| `index.html` | PAYE calculator: gross → net and net → gross, payslip, band-by-band tax, employer cost, saved calculations |
| `employees.html` | Team payroll: many employees at once, CSV / PDF schedule, saved team payrolls |
| `company.html` | Company workspace: shared employee directory, company payroll rules, monthly runs that lock each month |
| `payroll.html` | Control room: salary records, approval workflow, dashboards, reports, users & roles, audit trail |

## Run it

```bash
npm install
npm start
```

Open <http://localhost:3000>. In local demo mode you can sign in as `admin@taxcup.local` / `demo-password` (the login page offers a button for it).

The server listens on `127.0.0.1` by default. To open it from other computers on your network, start it with `HOST=0.0.0.0`.

Run the tax engine tests with `npm test`.

## Tax rules (Nigeria Tax Act 2025, effective 1 January 2026)

All rules live in one place, `public/assets/js/tax-engine.js`, used by every page and by the tests.

- Annual taxable income bands: first ₦800,000 at 0%, next ₦2.2m at 15%, next ₦9m at 18%, next ₦13m at 21%, next ₦25m at 23%, above ₦50m at 25%.
- Taxable income = gross − employee pension − NHF − NHIS − rent relief.
- **No CRA.** The Consolidated Relief Allowance was abolished; rent relief (20% of annual rent, capped at ₦500,000) replaces it.
- Employee pension 8% of basic + housing + transport; NHF 2.5% of basic.
- Employer pension (10%), NSITF and ITF are **employer costs** and never reduce employee net pay.
- Other statutory deductions and loans come out of net pay without reducing tax.

Confirm individual exemptions with a qualified adviser before processing payroll.

## Project layout

```
server.js            App entrypoint: security, bootstrap, routing, static pages
lib/
  db.js              Supabase database client with camelCase mapping & local fallback
  helpers.js         Payroll helpers, calculators, and validation utilities
  store.js           Local JSON file storage fallback (for offline development)
middleware/
  auth.js            Session authentication, cookie handling, RBAC permissions
  security.js        CSP, CSRF protection, and rate limiting
routes/
  auth.js            /api/login, /api/logout, /api/session, /api/health
  users.js           /api/users (user administration)
  employees.js       /api/employees (employee directory)
  payroll.js         /api/records, /api/runs (payroll workflow & runs)
  archive.js         /api/archive (single & batch calculation archives)
  audit.js           /api/audit (audit trail logs)
  import.js          /api/import (migration from older browser localStorage)
supabase/
  migration.sql      PostgreSQL schema for Supabase
public/              Static assets, HTML pages, CSS, and client-side scripts
test/                Integration tests (api.test.js) & engine tests (tax-engine.test.js)
```

## Security model

- Only `public/` is served. Server code, `data/`, `node_modules` and other project files are never reachable from the browser.
- Sessions are signed cookies that expire after 12 hours. Signing out, resetting a password or deactivating a user revokes their sessions on the server.
- Roles are enforced by the server on every request:

| Role | Can |
|---|---|
| Super Administrator | Everything, including users, roles and the audit trail |
| Accountant | Create, edit and approve payroll; export reports |
| Payroll Officer | Maintain employees; create and edit payroll; export reports |
| HR Manager | Maintain employees; view payroll |
| Management | View payroll and reports |

- Finalised and paid records are locked. Editing an approved record sends it back to review.
- The audit trail is written by the server with the signed-in user's name.

## Deploying to Vercel with Supabase

1. **Create a Supabase Project**:
   - Go to [supabase.com](https://supabase.com) and create a new project.
   - In Supabase, open **SQL Editor**, paste the contents of [`supabase/migration.sql`](file:///c:/Users/PC/Downloads/PAYE%20Calculator/PAYE%20Calculator/supabase/migration.sql), and click **Run**.
   - Under **Project Settings → API**, copy your **Project URL** and **`service_role` key** (secret).

2. **Configure Environment Variables (in Vercel)**:

| Variable | Purpose |
|---|---|
| `NODE_ENV=production` | Enables secure cookies and disables demo mode |
| `SESSION_SECRET` | Random string of 32+ characters for signing session cookies |
| `SUPABASE_URL` | Your Supabase Project URL (`https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_KEY` | Your Supabase `service_role` secret key |
| `ADMIN_EMAIL` | Email for your Super Administrator account |
| `ADMIN_PASSWORD` | Strong password (8+ characters) |
| `ADMIN_NAME` | Administrator display name (optional, defaults to "Administrator") |
| `TRUST_PROXY=1` | Required behind Vercel reverse proxy |

3. **Deploy**:
   - Push to GitHub and deploy on Vercel.
   - The app will connect to Supabase, bootstrap your Super Administrator, and persist sessions across serverless invocations without instant logouts.

## Moving data from the previous version

The previous version kept employees, records and saved payrolls in each browser's local storage. When a Super Administrator signs in on a browser that still has that data, a banner offers to import it to the server so the whole team can see it.

## Photography

Photos are loaded from Unsplash under the [Unsplash License](https://unsplash.com/license) (free for commercial use): #WOCinTech Chat and Malik Buraimoh. Credits are shown on each page.
