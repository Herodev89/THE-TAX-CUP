// Nigerian PAYE engine — Nigeria Tax Act 2025 (effective 1 January 2026).
// Shared by every page and by the Node test script, so the rules live in one place.
// The old Consolidated Relief Allowance (CRA) was abolished by the Act and is NOT applied;
// rent relief (20% of annual rent, capped at ₦500,000) replaces it.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TaxEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const BANDS = [
    { limit: 800000, rate: 0, label: 'First ₦800,000' },
    { limit: 2200000, rate: 0.15, label: 'Next ₦2,200,000' },
    { limit: 9000000, rate: 0.18, label: 'Next ₦9,000,000' },
    { limit: 13000000, rate: 0.21, label: 'Next ₦13,000,000' },
    { limit: 25000000, rate: 0.23, label: 'Next ₦25,000,000' },
    { limit: Infinity, rate: 0.25, label: 'Above ₦50,000,000' },
  ];

  const RULES = {
    rentReliefRate: 0.2,
    rentReliefCap: 500000,
    employeePensionRate: 0.08,
    employerPensionRate: 0.1,
    nhfRate: 0.025,
  };

  const DEFAULT_ALLOCATION = { basic: 50, housing: 20, transport: 15, other: 15 };
  const positive = (value) => Math.max(0, Number(value) || 0);

  function annualTax(taxableIncome) {
    let remaining = positive(taxableIncome);
    let total = 0;
    const bands = BANDS.map((band) => {
      const taxable = Math.min(remaining, band.limit);
      remaining -= taxable;
      const tax = taxable * band.rate;
      total += tax;
      return { label: band.label, rate: band.rate, taxable, tax };
    });
    return { total, bands };
  }

  function rentRelief(annualRent) {
    return Math.min(positive(annualRent) * RULES.rentReliefRate, RULES.rentReliefCap);
  }

  function allocationTotal(allocation) {
    return Object.values(allocation || {}).reduce((sum, value) => sum + positive(value), 0);
  }

  // options: allocation, pension (bool), nhf (bool), annualRent, nhisRate (% of gross, employee, tax-deductible),
  // otherStatutory and otherDeductions (monthly, after tax), nsitfRate / itfRate (% of gross, employer only).
  function compute(grossMonthly, options = {}) {
    const gross = positive(grossMonthly);
    const allocation = options.allocation || DEFAULT_ALLOCATION;
    const share = (key) => gross * positive(allocation[key]) / 100;
    const earnings = { basic: share('basic'), housing: share('housing'), transport: share('transport'), other: share('other') };
    const pensionable = earnings.basic + earnings.housing + earnings.transport;

    const pension = options.pension === false ? 0 : pensionable * RULES.employeePensionRate;
    const nhf = options.nhf === false ? 0 : earnings.basic * RULES.nhfRate;
    const nhis = gross * positive(options.nhisRate) / 100;
    const relief = rentRelief(options.annualRent);

    const annualGross = gross * 12;
    const annualReliefs = (pension + nhf + nhis) * 12 + relief;
    const annualTaxable = Math.max(0, annualGross - annualReliefs);
    const tax = annualTax(annualTaxable);
    const paye = tax.total / 12;

    const otherStatutory = positive(options.otherStatutory);
    const otherDeductions = positive(options.otherDeductions);
    const totalDeductions = pension + nhf + nhis + paye + otherStatutory + otherDeductions;
    const net = Math.max(0, gross - totalDeductions);

    const employer = {
      pension: options.pension === false ? 0 : pensionable * RULES.employerPensionRate,
      nsitf: gross * positive(options.nsitfRate) / 100,
      itf: gross * positive(options.itfRate) / 100,
    };
    employer.total = employer.pension + employer.nsitf + employer.itf;

    return {
      gross, earnings, pensionable, pension, nhf, nhis, paye, otherStatutory, otherDeductions,
      totalDeductions, net, annualGross, annualRent: positive(options.annualRent), rentRelief: relief,
      annualReliefs, annualTaxable, annualPaye: tax.total, bands: tax.bands,
      effectiveRate: annualGross ? tax.total / annualGross : 0,
      employer, costToCompany: gross + employer.total,
    };
  }

  // Finds the gross salary that produces the target net pay (binary search, ₦0.01 precision).
  function grossForNet(targetNet, options = {}) {
    const target = positive(targetNet);
    if (!target) return compute(0, options);
    let low = target;
    let high = target * 2 + 100000;
    for (let i = 0; i < 60 && compute(high, options).net < target; i += 1) high *= 1.5;
    for (let i = 0; i < 80 && high - low > 0.005; i += 1) {
      const middle = (low + high) / 2;
      if (compute(middle, options).net < target) low = middle;
      else high = middle;
    }
    return compute(high, options);
  }

  return { BANDS, RULES, DEFAULT_ALLOCATION, annualTax, rentRelief, allocationTotal, compute, grossForNet };
}));
