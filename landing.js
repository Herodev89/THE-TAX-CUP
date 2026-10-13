// ==========================================================================
// THE TAX CUP — Landing Page Interactive Engine
// ==========================================================================

const TAX_BANDS = [
  { amount: 800000, rate: 0 },
  { amount: 2200000, rate: 0.15 },
  { amount: 9000000, rate: 0.18 },
  { amount: 13000000, rate: 0.21 },
  { amount: 25000000, rate: 0.23 },
  { amount: Infinity, rate: 0.25 }
];

const moneyFmt = (val) => new Intl.NumberFormat('en-NG', {
  maximumFractionDigits: 0
}).format(Math.max(0, Math.round(val)));

function calculatePAYE(grossMonthly, hasPension, hasNhf, hasRent) {
  const gross = Math.max(0, Number(grossMonthly) || 0);
  
  // Standard statutory composition: Basic 50%, Housing 20%, Transport 15%, Other 15%
  const basic = gross * 0.50;
  const housing = gross * 0.20;
  const transport = gross * 0.15;
  const qualifyingPensionBase = basic + housing + transport; // 85% of gross
  
  const pension = hasPension ? qualifyingPensionBase * 0.08 : 0;
  const nhf = hasNhf ? basic * 0.025 : 0;
  
  // Rent relief: assume benchmark representative rent of ₦1,200,000/yr (or gross equivalent)
  const estimatedAnnualRent = Math.max(0, gross * 12 * 0.20);
  const rentRelief = hasRent ? Math.min(estimatedAnnualRent * 0.20, 500000) : 0;
  
  const annualGross = gross * 12;
  const taxableIncome = Math.max(0, annualGross - (pension + nhf) * 12 - rentRelief);
  
  let remaining = taxableIncome;
  let annualTax = 0;
  for (const band of TAX_BANDS) {
    const portion = Math.min(remaining, band.amount);
    if (portion <= 0) break;
    annualTax += portion * band.rate;
    remaining -= portion;
  }
  
  const monthlyPaye = annualTax / 12;
  const netMonthly = Math.max(0, gross - monthlyPaye - pension - nhf);
  const effectiveRate = gross > 0 ? (monthlyPaye / gross) * 100 : 0;

  return {
    gross,
    pension,
    nhf,
    rentRelief,
    monthlyPaye,
    netMonthly,
    effectiveRate
  };
}

function initQuickCalculator() {
  const numInput = document.getElementById('calc-gross-num');
  const rangeInput = document.getElementById('calc-gross-range');
  const pensionCheck = document.getElementById('calc-pension-check');
  const nhfCheck = document.getElementById('calc-nhf-check');
  const rentCheck = document.getElementById('calc-rent-check');

  const netDisplay = document.getElementById('calc-net-display');
  const payeDisplay = document.getElementById('calc-paye-display');
  const statutoryDisplay = document.getElementById('calc-statutory-display');
  const rateDisplay = document.getElementById('calc-rate-display');
  const reliefDisplay = document.getElementById('calc-relief-display');

  if (!numInput || !rangeInput) return;

  function update() {
    const gross = Number(numInput.value) || 0;
    const hasPension = pensionCheck ? pensionCheck.checked : true;
    const hasNhf = nhfCheck ? nhfCheck.checked : true;
    const hasRent = rentCheck ? rentCheck.checked : true;

    const res = calculatePAYE(gross, hasPension, hasNhf, hasRent);

    if (netDisplay) netDisplay.textContent = moneyFmt(res.netMonthly);
    if (payeDisplay) payeDisplay.textContent = '₦' + moneyFmt(res.monthlyPaye);
    if (statutoryDisplay) statutoryDisplay.textContent = '₦' + moneyFmt(res.pension + res.nhf);
    if (rateDisplay) rateDisplay.textContent = res.effectiveRate.toFixed(1) + '%';
    if (reliefDisplay) reliefDisplay.textContent = '₦' + moneyFmt(res.rentRelief / 12) + '/mo';
  }

  numInput.addEventListener('input', () => {
    rangeInput.value = numInput.value;
    update();
  });

  rangeInput.addEventListener('input', () => {
    numInput.value = rangeInput.value;
    update();
  });

  [pensionCheck, nhfCheck, rentCheck].forEach((chk) => {
    if (chk) chk.addEventListener('change', update);
  });

  update();
}

function initFAQ() {
  const items = document.querySelectorAll('.faq-item');
  items.forEach((item) => {
    const question = item.querySelector('.faq-question');
    if (!question) return;
    question.addEventListener('click', () => {
      const wasActive = item.classList.contains('active');
      items.forEach((other) => other.classList.remove('active'));
      if (!wasActive) {
        item.classList.add('active');
      }
    });
  });
}

function initHeaderScroll() {
  const header = document.querySelector('.landing-header');
  const progressBar = document.getElementById('scroll-progress');
  const navLinks = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('section[id], footer[id]');

  function onScroll() {
    const scrollY = window.scrollY || window.pageYOffset;

    // Spec: After 24px of scroll it gains 1px border, soft shadow and backdrop blur
    if (header) {
      if (scrollY > 24) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }

    // Thin gold scroll progress line under the nav
    if (progressBar) {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight > 0) {
        const pct = Math.min(100, Math.max(0, (scrollY / docHeight) * 100));
        progressBar.style.width = pct + '%';
      }
    }

    // Active nav link highlight
    if (navLinks.length && sections.length) {
      let currentId = '';
      sections.forEach((sec) => {
        const top = sec.offsetTop - 120;
        const height = sec.offsetHeight;
        if (scrollY >= top && scrollY < top + height) {
          currentId = sec.getAttribute('id');
        }
      });
      if (currentId) {
        navLinks.forEach((link) => {
          if (link.getAttribute('href') === '#' + currentId) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      }
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}


document.addEventListener('DOMContentLoaded', () => {
  initQuickCalculator();
  initFAQ();
  initHeaderScroll();
  initScrollReveal();
  initCalculatorCounters();
});

// ── Scroll-reveal: fades elements in as they enter the viewport ──
function initScrollReveal() {
  const targets = document.querySelectorAll('[data-reveal]');
  if (!targets.length) return;

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  targets.forEach((el) => io.observe(el));
}

// ── Calculator counter: animate number displays on first scroll into view ──
function initCalculatorCounters() {
  const calcSection = document.querySelector('.calculator-showcase-section');
  if (!calcSection) return;

  let triggered = false;
  const io = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && !triggered) {
        triggered = true;
        animateCounter(document.getElementById('calc-net-display'));
        animateCounter(document.getElementById('calc-paye-display'));
        animateCounter(document.getElementById('calc-statutory-display'));
        io.disconnect();
      }
    },
    { threshold: 0.3 }
  );
  io.observe(calcSection);
}

function animateCounter(el) {
  if (!el) return;
  const rawText = el.textContent.replace(/[₦,]/g, '').trim();
  const end = parseFloat(rawText) || 0;
  if (end === 0) return;

  let start = 0;
  const duration = 700;
  const startTime = performance.now();

  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out curve
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (end - start) * eased);
    const prefix = el.textContent.startsWith('₦') ? '₦' : '';
    const suffix = el.textContent.endsWith('%') ? '%' : (el.textContent.endsWith('/mo') ? '/mo' : '');
    el.textContent = prefix + current.toLocaleString('en-NG') + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

