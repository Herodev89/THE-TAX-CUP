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
server.js            Express server: auth, sessions, permissions, API, page routes
lib/store.js         JSON-file storage (swap for a database in production)
public/              Everything the browser can load — nothing else is served
  assets/css/        app.css (workspace) and site.css (landing + login)
  assets/js/         tax-engine.js, app.js (shell), one script per page
data/                Users, employees, records, runs, archive, audit (git-ignored)
test/                Tax engine tests
_old-ui/             The previous interface, kept for reference (git-ignored, not served)
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

## Deploying

Set these environment variables:

| Variable | Purpose |
|---|---|
| `NODE_ENV=production` | Turns off demo mode and enables secure cookies |
| `SESSION_SECRET` | **Required in production.** A random string of 32+ characters |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Creates the first administrator when no active administrator exists |
| `DATA_DIR` | Where data files are stored (default `./data`) |
| `TRUST_PROXY` | Set to `1` behind a reverse proxy (automatic on Vercel) |

In production the old demo account is disabled automatically if it still uses `demo-password`.

**Vercel note:** Vercel's file system is read-only, so saving employees, records or users will fail there with a clear "storage is read-only" message. For Vercel, replace `lib/store.js` with a database (e.g. Supabase/Postgres) — it is the only file that touches storage. A normal server or VPS with a persistent disk works as is.

## Moving data from the previous version

The previous version kept employees, records and saved payrolls in each browser's local storage. When a Super Administrator signs in on a browser that still has that data, a banner offers to import it to the server so the whole team can see it.

## Photography

Photos are loaded from Unsplash under the [Unsplash License](https://unsplash.com/license) (free for commercial use): #WOCinTech Chat and Malik Buraimoh. Credits are shown on each page.
