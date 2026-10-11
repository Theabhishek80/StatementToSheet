pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const $ = id => document.getElementById(id);
const drop = $('drop'), fileInput = $('file'), statusEl = $('status');
const tbody = document.querySelector('#tbl tbody');
let data = []; // {date:Date|null, dateStr, desc, debit, credit, balance}

drop.addEventListener('click', () => fileInput.click());
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
fileInput.addEventListener('change', () => handleFiles(fileInput.files));

function say(msg, err) { statusEl.textContent = msg; statusEl.className = 'status' + (err ? ' err' : ''); }

async function handleFiles(files) {
  const pdfs = [...files].filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (!pdfs.length) return say('Choose at least one PDF file.', true);
  data = [];
  try {
    for (const f of pdfs) {
      say('Reading ' + f.name + '…');
      const buf = await f.arrayBuffer();
      let pdf;
      try {
        pdf = await pdfjsLib.getDocument({ data: buf, password: $('pwd').value || undefined }).promise;
      } catch (e) {
        if (e && e.name === 'PasswordException') return say('"' + f.name + '" is password protected. Enter the password above and add the file again.', true);
        throw e;
      }
      const rows = await StatementParser.extractRows(pdf);
      data.push(...StatementParser.buildTransactions(rows, $('dateOrder').value));
    }
  } catch (e) {
    console.error(e);
    return say('Could not read the PDF: ' + (e.message || e), true);
  }
  fileInput.value = '';
  if (!data.length) {
    $('result').hidden = true;
    return say('No transactions found. This may be a scanned PDF or an unusual layout. Run OCR first or try another statement.', true);
  }
  say('Found ' + data.length + ' transactions. Review them below.');
  render();
}

const fmt = n => n == null ? '' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateText = r => r.date ? r.date.toISOString().slice(0, 10) : r.dateStr;

function render() {
  tbody.innerHTML = '';
  data.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td contenteditable data-k="date"></td><td contenteditable data-k="desc"></td>' +
      '<td contenteditable class="n" data-k="debit"></td><td contenteditable class="n" data-k="credit"></td>' +
      '<td contenteditable class="n" data-k="balance"></td><td class="x" title="Remove row">×</td>';
    const c = tr.children;
    c[0].textContent = dateText(r); c[1].textContent = r.desc;
    c[2].textContent = fmt(r.debit); c[3].textContent = fmt(r.credit); c[4].textContent = fmt(r.balance);
    c[5].addEventListener('click', () => { data.splice(data.indexOf(r), 1); render(); });
    tr.querySelectorAll('[contenteditable]').forEach(td => td.addEventListener('blur', () => edit(r, td)));
    tbody.appendChild(tr);
  });
  stats();
  $('result').hidden = false;
}

function edit(r, td) {
  const k = td.dataset.k, v = td.textContent.trim();
  if (k === 'desc') r.desc = v;
  else if (k === 'date') {
    r.dateStr = v;
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    r.date = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  } else {
    const p = v ? StatementParser.parseAmount(v) : null;
    r[k] = p ? p.value : null;
    td.textContent = fmt(r[k]);
  }
  stats();
}

function stats() {
  const sum = k => data.reduce((a, r) => a + (r[k] || 0), 0);
  $('sCount').textContent = data.length;
  $('sDebit').textContent = fmt(sum('debit')) || '0.00';
  $('sCredit').textContent = fmt(sum('credit')) || '0.00';
}

$('addRow').addEventListener('click', () => {
  data.push({ date: null, dateStr: '', desc: '', debit: null, credit: null, balance: null });
  render();
  tbody.lastElementChild.firstElementChild.focus();
});

function buildWorkbook() {
  const head = ['Date', 'Description', 'Debit', 'Credit', 'Balance'];
  const aoa = [head, ...data.map(r => [r.date || r.dateStr, r.desc, r.debit, r.credit, r.balance])];
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  const n = data.length + 1;
  for (let i = 2; i <= n; i++) {
    if (ws['A' + i] && ws['A' + i].t === 'd') ws['A' + i].z = 'yyyy-mm-dd';
    ['C', 'D', 'E'].forEach(c => { if (ws[c + i]) ws[c + i].z = '#,##0.00'; });
  }
  ws['!cols'] = [{ wch: 12 }, { wch: 60 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  ws['!autofilter'] = { ref: 'A1:E' + n };

  const sum = XLSX.utils.aoa_to_sheet([
    ['Summary', ''],
    ['Transactions', { t: 'n', f: 'COUNTA(Transactions!B2:B' + n + ')' }],
    ['Total debits', { t: 'n', f: 'SUM(Transactions!C2:C' + n + ')' }],
    ['Total credits', { t: 'n', f: 'SUM(Transactions!D2:D' + n + ')' }],
    ['Net movement', { t: 'n', f: 'B4-B3' }]
  ]);
  sum['!cols'] = [{ wch: 18 }, { wch: 18 }];
  ['B3', 'B4', 'B5'].forEach(c => sum[c].z = '#,##0.00');

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
  XLSX.utils.book_append_sheet(wb, sum, 'Summary');
  return wb;
}

$('dlXlsx').addEventListener('click', () => XLSX.writeFile(buildWorkbook(), 'bank-statement.xlsx', { cellDates: true }));

$('dlCsv').addEventListener('click', () => {
  const csv = XLSX.utils.sheet_to_csv(buildWorkbook().Sheets.Transactions, { dateNF: 'yyyy-mm-dd' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'bank-statement.csv';
  a.click();
  URL.revokeObjectURL(a.href);
});
