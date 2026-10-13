# THE TAX CUP

A browser-based Nigerian PAYE salary calculator branded for The Tax Cup, with two modes:

- **Gross to net:** estimate monthly take-home pay, PAYE and deductions.
- **Net to gross:** solve for the gross salary needed to deliver a target take-home amount.
- **Gross composition:** allocate gross salary across Basic, Housing, Transport and Other Allowances using editable percentages.
- **Employee report:** enter an employee name and use **Print / PDF** to print or save a complete branded salary report as PDF.
- **Multiple employees:** open `employees.html` to calculate and report salary obligations for a whole team in one pass.
- **Company workspace:** open `company.html` to manage a local employee directory, view payroll totals and save payroll runs.
- **Payroll management:** open `payroll.html` for monthly salary snapshots, duplicate-period protection, payroll history filters, dashboards, individual/company reports, CSV export, workflow statuses, users/roles and an audit trail.

The interface uses the Tax Cup gold-and-ink palette, with the logo in `tax-cup-logo.svg` and the brand tagline: **SIMPLIFYING TAX & COMPLIANCE FOR BUSINESSES**.

## Multiple employees

The **Multiple employees** page allows HR or payroll teams to add as many employee rows as needed. Shared composition percentages, pension, NHF, annual rent relief and calculation mode are applied to every row. The team report shows each employee's gross, Basic, Housing, Transport, Other Allowances, PAYE, pension, NHF and net pay, plus the total net payroll. Use **Print / PDF** to print or save the team report.

## Company workspace prototype

The **Company workspace** is available at `company.html`. It currently stores employee records and saved payroll-run summaries in the browser's local storage on that device. It is useful for demonstrating the company workflow, but it is not yet a secure multi-user database. Before production use, connect the same interface to authenticated hosting and a managed database such as Supabase.

## Payroll management prototype

The **Payroll control room** is available at `payroll.html`. It uses the existing employee directory as its source, then saves a complete salary and deduction snapshot under `tax-cup-salary-records`. Each employee/month combination is unique, so changing an employee's current salary cannot rewrite an earlier record. Records move through Draft, Under Review, Approved, Finalized and Paid states, and important actions are stored under `tax-cup-audit`. The seeded local account is `admin@taxcup.local` with password `demo-password`.

The report views support individual history, company summaries, detailed tables, printing to PDF through the browser print dialog, and CSV downloads. User records and role assignments are available from Users & roles. This is a front-end prototype, not production authentication: passwords are hashed before storage, but real deployment requires server-side sessions, authorization, encryption, database constraints and a managed identity provider.

Recommended production tables are `employees`, `users`, `roles`, `permissions`, `user_roles`, `payroll_periods`, `payroll_records`, `payroll_earnings`, `payroll_deductions`, `payroll_payments`, `payroll_approvals` and `audit_logs`. Put a unique constraint on `(employee_id, payroll_period_id)` and retain employee and salary values directly on each finalized payroll record for historical integrity.

## Run it

Open `index.html` in a browser. No installation or build step is required. In VS Code, use **Open with Live Server** if that extension is installed.

## Current model

The starter model in `app.js` uses these configurable 2026 assumptions:

- Annual tax-free band: NGN 800,000
- Progressive annual bands: 15%, 18%, 21%, 23%, 25%
- Employee pension: 8% of qualifying earnings (Basic + Housing + Transport)
- NHF: 2.5% of Basic salary

These are implementation assumptions for the calculator and should be reviewed against the applicable Nigerian law, employee exemptions and employer payroll policy before production use. Update `TAX_BANDS` and the deduction rates at the top of `app.js` when the policy is confirmed.

## Gross composition

Enter the percentage for each earnings category. The calculator shows the live allocation total and only calculates when the percentages add up to exactly 100%. The result then shows the naira value of each category based on the entered gross salary. The default example is 50% Basic, 20% Housing, 15% Transport and 15% Other Allowances; replace these with the company's approved payroll structure.

For the current payroll rule, employee pension is calculated at 8% of Basic + Housing + Transport. NHF is calculated at 2.5% of Basic salary only. The on-screen deduction descriptions reflect these bases.
