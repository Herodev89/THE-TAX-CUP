const PAYROLL_ARCHIVE_KEY = 'tax-cup-monthly-payrolls';

function archiveLoad() {
  try {
    const saved = JSON.parse(localStorage.getItem(PAYROLL_ARCHIVE_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    return [];
  }
}

function archiveSave(records) {
  localStorage.setItem(PAYROLL_ARCHIVE_KEY, JSON.stringify(records));
}

function archiveMonthLabel(value) {
  if (!value) return 'No month selected';
  const date = new Date(`${value}-01T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' });
}

function archiveAdd(record) {
  const records = archiveLoad();
  const nextRecord = { ...record, id: Date.now(), savedAt: new Date().toISOString() };
  archiveSave([nextRecord, ...records]);
  return nextRecord;
}

function archiveDelete(id) {
  archiveSave(archiveLoad().filter((record) => record.id !== id));
}

function archiveFormatMoney(value) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Math.max(0, Number(value) || 0));
}

function archiveRender({ type, search, list, empty, onOpen }) {
  const query = search.value.trim().toLowerCase();
  const records = archiveLoad().filter((record) => record.type === type && [record.period, record.title, record.employeeName, record.count].some((value) => String(value || '').toLowerCase().includes(query)));
  list.innerHTML = '';
  empty.classList.toggle('hidden', records.length > 0);
  records.forEach((record) => {
    const item = document.createElement('div');
    item.className = 'archive-row';
    item.innerHTML = `<button class="archive-open" type="button"><strong></strong><small></small></button><div><b></b><small></small></div><button class="archive-delete" type="button" title="Delete saved payroll">×</button>`;
    item.querySelector('.archive-open strong').textContent = archiveMonthLabel(record.period);
    item.querySelector('.archive-open small').textContent = record.title;
    item.querySelector('div b').textContent = archiveFormatMoney(record.totalNet);
    item.querySelector('div small').textContent = record.type === 'single' ? record.employeeName : `${record.count} employees`;
    item.querySelector('.archive-open').addEventListener('click', () => {
      if (onOpen) onOpen(record);
    });
    item.querySelector('.archive-delete').addEventListener('click', () => {
      archiveDelete(record.id);
      archiveRender({ type, search, list, empty, onOpen });
    });
    list.appendChild(item);
  });
}
