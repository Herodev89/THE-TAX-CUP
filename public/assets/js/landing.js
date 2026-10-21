(function () {
  const $ = (id) => document.getElementById(id);
  const money = (value) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Math.max(0, value || 0));

  const header = $('site-header');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  function update(source) {
    const value = Math.max(0, Number(source.value) || 0);
    if (source.id === 'quick-salary') $('quick-range').value = Math.min(value, Number($('quick-range').max));
    else $('quick-salary').value = value;
    const result = TaxEngine.compute(value);
    $('quick-net').textContent = money(result.net);
    $('quick-paye').textContent = money(result.paye);
    $('quick-stat').textContent = money(result.pension + result.nhf);
    $('quick-rate').textContent = `${(result.effectiveRate * 100).toFixed(1)}%`;
  }
  ['quick-salary', 'quick-range'].forEach((id) => $(id).addEventListener('input', (event) => update(event.target)));
  update($('quick-salary'));

  let lower = 0;
  $('bands-table').insertAdjacentHTML('beforeend', TaxEngine.BANDS.map((band) => {
    const upper = lower + band.limit;
    const label = Number.isFinite(band.limit) ? `₦${(lower / 1e6).toLocaleString('en-NG')}m – ₦${(upper / 1e6).toLocaleString('en-NG')}m` : `Above ₦${(lower / 1e6).toLocaleString('en-NG')}m`;
    lower = upper;
    return `<div class="bands-row"><strong>${label}</strong><span class="rate">${Math.round(band.rate * 100)}%</span><span class="bar"><i style="width:${Math.max(2, (band.rate / 0.25) * 100)}%"></i></span></div>`;
  }).join(''));

  $('year').textContent = new Date().getFullYear();
}());
