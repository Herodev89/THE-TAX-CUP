const test = require('node:test');
const assert = require('node:assert/strict');
const TaxEngine = require('../public/assets/js/tax-engine.js');

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.01, `${actual} ≠ ${expected}`);

test('first ₦800,000 of taxable income is tax-free', () => {
  near(TaxEngine.annualTax(800000).total, 0);
});

test('progressive bands apply 15% then 18%', () => {
  // 2.2m × 15% + 2.517m × 18%
  near(TaxEngine.annualTax(5517000).total, 330000 + 453060);
});

test('top band is 25% above ₦50m', () => {
  const base = 2200000 * 0.15 + 9000000 * 0.18 + 13000000 * 0.21 + 25000000 * 0.23;
  near(TaxEngine.annualTax(60000000).total, base + 10000000 * 0.25);
});

test('₦500,000 monthly gross: no CRA, pension and NHF deductible', () => {
  const result = TaxEngine.compute(500000);
  near(result.pension, 34000);
  near(result.nhf, 6250);
  near(result.annualTaxable, 6000000 - (34000 + 6250) * 12);
  near(result.paye, 65255);
  near(result.net, 500000 - 34000 - 6250 - 65255);
});

test('rent relief is 20% of rent, capped at ₦500,000', () => {
  near(TaxEngine.rentRelief(1000000), 200000);
  near(TaxEngine.rentRelief(5000000), 500000);
});

test('employer NSITF and ITF never reduce employee net pay', () => {
  const without = TaxEngine.compute(400000);
  const withEmployer = TaxEngine.compute(400000, { nsitfRate: 1, itfRate: 1 });
  near(withEmployer.net, without.net);
  near(withEmployer.employer.nsitf, 4000);
  near(withEmployer.employer.itf, 4000);
});

test('net-to-gross solver round-trips', () => {
  const result = TaxEngine.grossForNet(350000, { annualRent: 1200000 });
  near(Math.round(result.net * 100) / 100, 350000);
});

test('zero and negative monthly gross produce 0 tax and 0 deductions', () => {
  const zero = TaxEngine.compute(0);
  near(zero.gross, 0);
  near(zero.paye, 0);
  near(zero.net, 0);

  const neg = TaxEngine.compute(-50000);
  near(neg.gross, 0);
  near(neg.paye, 0);
  near(neg.net, 0);
});

test('handles high net-worth executive income (>₦100m monthly)', () => {
  const result = TaxEngine.compute(100000000); // ₦1.2B annual
  assert.ok(result.paye > 0);
  assert.ok(result.net > 0);
  assert.ok(result.net < result.gross);
  near(result.gross, result.net + result.paye + result.pension + result.nhf);
});

test('handles zero and negative rent relief gracefully', () => {
  near(TaxEngine.rentRelief(0), 0);
  near(TaxEngine.rentRelief(-500000), 0);
});

