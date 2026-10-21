-- ═══════════════════════════════════════════════════════════════════════
-- The Tax Cup — Supabase Database Migration
-- Run this in the Supabase SQL Editor (supabase.com → your project → SQL Editor)
-- ═══════════════════════════════════════════════════════════════════════

-- ── Users ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  department      TEXT NOT NULL DEFAULT '',
  title           TEXT NOT NULL DEFAULT '',
  role            TEXT NOT NULL DEFAULT 'HR Manager',
  password_hash   TEXT NOT NULL,
  session_version INTEGER NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));

-- ── Employees ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  department   TEXT NOT NULL DEFAULT 'General',
  title        TEXT NOT NULL DEFAULT 'Employee',
  salary       FLOAT8 NOT NULL DEFAULT 0,
  annual_rent  FLOAT8 NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'Active',
  legacy_id    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_legacy ON employees (legacy_id)
  WHERE legacy_id IS NOT NULL;

-- ── Payroll Records ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS records (
  id                TEXT PRIMARY KEY,
  employee_id       TEXT NOT NULL,
  employee_name     TEXT NOT NULL,
  department        TEXT NOT NULL DEFAULT '',
  title             TEXT NOT NULL DEFAULT '',
  period            TEXT NOT NULL,
  annual_rent       FLOAT8 NOT NULL DEFAULT 0,
  -- Earnings
  basic             FLOAT8 NOT NULL DEFAULT 0,
  housing           FLOAT8 NOT NULL DEFAULT 0,
  transport         FLOAT8 NOT NULL DEFAULT 0,
  meal              FLOAT8 NOT NULL DEFAULT 0,
  utility           FLOAT8 NOT NULL DEFAULT 0,
  other_allowances  FLOAT8 NOT NULL DEFAULT 0,
  bonus             FLOAT8 NOT NULL DEFAULT 0,
  overtime          FLOAT8 NOT NULL DEFAULT 0,
  commission        FLOAT8 NOT NULL DEFAULT 0,
  arrears           FLOAT8 NOT NULL DEFAULT 0,
  other_earnings    FLOAT8 NOT NULL DEFAULT 0,
  -- Deductions
  paye              FLOAT8 NOT NULL DEFAULT 0,
  pension           FLOAT8 NOT NULL DEFAULT 0,
  nhf               FLOAT8 NOT NULL DEFAULT 0,
  nhis              FLOAT8 NOT NULL DEFAULT 0,
  loan              FLOAT8 NOT NULL DEFAULT 0,
  advance           FLOAT8 NOT NULL DEFAULT 0,
  absence           FLOAT8 NOT NULL DEFAULT 0,
  other_deductions  FLOAT8 NOT NULL DEFAULT 0,
  -- Employer costs
  employer_pension  FLOAT8 NOT NULL DEFAULT 0,
  nsitf             FLOAT8 NOT NULL DEFAULT 0,
  itf               FLOAT8 NOT NULL DEFAULT 0,
  -- Workflow
  workflow_status   TEXT NOT NULL DEFAULT 'Draft',
  payment_status    TEXT NOT NULL DEFAULT 'Pending',
  payment_date      TEXT NOT NULL DEFAULT '',
  reference         TEXT NOT NULL DEFAULT '',
  remarks           TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        TEXT NOT NULL DEFAULT '',
  updated_at        TIMESTAMPTZ,
  updated_by        TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_records_emp_period
  ON records (employee_id, period);
CREATE INDEX IF NOT EXISTS idx_records_period ON records (period);

-- ── Payroll Runs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runs (
  id         TEXT PRIMARY KEY,
  period     TEXT NOT NULL UNIQUE,
  saved_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  saved_by   TEXT NOT NULL DEFAULT '',
  settings   JSONB NOT NULL DEFAULT '{}',
  count      INTEGER NOT NULL DEFAULT 0,
  total_net  FLOAT8 NOT NULL DEFAULT 0,
  results    JSONB NOT NULL DEFAULT '[]',
  legacy     BOOLEAN NOT NULL DEFAULT FALSE
);

-- ── Saved Calculations (Archive) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS archive (
  id             TEXT PRIMARY KEY,
  type           TEXT NOT NULL,
  period         TEXT NOT NULL,
  title          TEXT NOT NULL DEFAULT '',
  employee_name  TEXT NOT NULL DEFAULT '',
  count          INTEGER NOT NULL DEFAULT 1,
  total_net      FLOAT8 NOT NULL DEFAULT 0,
  snapshot       JSONB,
  saved_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  saved_by       TEXT NOT NULL DEFAULT '',
  legacy         BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_archive_type ON archive (type);
CREATE INDEX IF NOT EXISTS idx_archive_saved ON archive (saved_at DESC);

-- ── Audit Trail ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit (
  id         TEXT PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id    TEXT,
  user_text  TEXT NOT NULL DEFAULT '',
  action     TEXT NOT NULL,
  affected   TEXT NOT NULL DEFAULT '',
  change     TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_audit_at ON audit (at DESC);

-- ── App Configuration ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ── Row-Level Security ───────────────────────────────────────────────
-- Enable RLS so the anon key cannot reach any table.
-- The service_role key (used by our server) bypasses RLS automatically.
ALTER TABLE users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees  ENABLE ROW LEVEL SECURITY;
ALTER TABLE records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit      ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
