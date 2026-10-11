/* Bank statement parser: turns pdf.js text positions into transaction rows. */
(function (global) {
  const DATE_RE = /^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\s\-][A-Za-z]{3,9}[\s\-,]*\d{2,4}|[A-Za-z]{3,9}\s\d{1,2},?\s\d{4})(?![\d])/;
  const AMT_RE = /^[-(]?[₹$€£]?\s?\d[\d,]*\.\d{2}\)?-?\s?(CR|DR|Cr|Dr|cr|dr)?$/;
  const SKIP_RE = /^(page\s*\d|statement of account|opening balance|closing balance|brought forward|carried forward)/i;
  const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

  function parseAmount(s) {
    const t = s.trim();
    let neg = /^\(|^-|-$/.test(t);
    const dr = /dr$/i.test(t), cr = /cr$/i.test(t);
    const v = parseFloat(t.replace(/[^\d.]/g, ''));
    if (isNaN(v)) return null;
    return { value: neg ? -v : v, dr, cr };
  }

  function parseDate(s, order) {
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) {
      let a = +m[1], b = +m[2], y = +m[3];
      if (y < 100) y += 2000;
      let d = order === 'mdy' ? b : a, mo = order === 'mdy' ? a : b;
      if (mo > 12 && d <= 12) [d, mo] = [mo, d];
      return new Date(Date.UTC(y, mo - 1, d));
    }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3})[A-Za-z]*[\s\-,]*(\d{2,4})$/);
    if (m) {
      const mo = MONTHS.indexOf(m[2].toLowerCase());
      let y = +m[3]; if (y < 100) y += 2000;
      if (mo >= 0) return new Date(Date.UTC(y, mo, +m[1]));
    }
    m = s.match(/^([A-Za-z]{3})[A-Za-z]*\s(\d{1,2}),?\s(\d{4})$/);
    if (m) {
      const mo = MONTHS.indexOf(m[1].toLowerCase());
      if (mo >= 0) return new Date(Date.UTC(+m[3], mo, +m[2]));
    }
    return null;
  }

  async function extractRows(pdf) {
    const rows = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const items = content.items
        .filter(i => i.str && i.str.trim())
        .map(i => ({ x: i.transform[4], y: i.transform[5], w: i.width || 0, s: i.str.trim() }));
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      let cur = null;
      for (const it of items) {
        if (cur && Math.abs(cur.y - it.y) <= 3) cur.items.push(it);
        else { cur = { y: it.y, items: [it] }; rows.push(cur); }
      }
    }
    rows.forEach(r => r.items.sort((a, b) => a.x - b.x));
    return rows;
  }

  function detectHeader(row) {
    const txt = row.items.map(i => i.s).join(' ');
    if (!/balance/i.test(txt) || !/(debit|withdraw|credit|deposit|amount)/i.test(txt)) return null;
    const cols = {};
    for (const it of row.items) {
      const c = { l: it.x, c: it.x + it.w / 2, r: it.x + it.w };
      if (/debit|withdraw|paid out|dr\b/i.test(it.s)) cols.debit = c;
      else if (/credit|deposit|paid in|cr\b/i.test(it.s)) cols.credit = c;
      else if (/balance/i.test(it.s)) cols.balance = c;
      else if (/amount/i.test(it.s)) cols.amount = c;
    }
    return cols;
  }

  function buildTransactions(rows, order) {
    const out = [];
    let header = null, last = null, prevBal = null;
    for (const row of rows) {
      const h = detectHeader(row);
      if (h) { header = h; continue; }

      const text = row.items.map(i => i.s).join(' ');
      const dm = text.match(DATE_RE);
      let rest = row.items;
      let dateStr = '';
      if (dm) {
        dateStr = dm[0];
        let used = 0, n = 0;
        while (n < rest.length && used < dateStr.replace(/\s/g, '').length) { used += rest[n].s.replace(/\s/g, '').length; n++; }
        rest = rest.slice(n);
      }
      const amts = rest.filter(i => AMT_RE.test(i.s));
      const words = rest.filter(i => !AMT_RE.test(i.s));
      const desc = words.map(i => i.s).join(' ');

      if (!dm) {
        if (SKIP_RE.test(desc)) { last = null; continue; }
        if (last && !amts.length && desc && !SKIP_RE.test(desc) && desc.length < 160) last.desc += ' ' + desc;
        continue;
      }
      if (!amts.length) {
        if (!SKIP_RE.test(desc)) { last = { dateStr, desc, debit: null, credit: null, balance: null }; out.push(last); }
        continue;
      }

      const t = { dateStr, desc, debit: null, credit: null, balance: null };
      const cols = header ? Object.entries(header) : [];
      if (cols.length >= 2) {
        for (const a of amts) {
          let best = null, dist = Infinity;
          for (const [k, h] of cols) {
            // numbers may be left, centre or right aligned under their header
            const d = Math.min(Math.abs(h.l - a.x), Math.abs(h.c - (a.x + a.w / 2)), Math.abs(h.r - (a.x + a.w)));
            if (d < dist) { dist = d; best = k; }
          }
          const v = parseAmount(a.s);
          if (!v) continue;
          const abs = Math.abs(v.value);
          if (best === 'debit') t.debit = abs;
          else if (best === 'credit') t.credit = abs;
          else if (best === 'balance') t.balance = abs * (v.value < 0 ? -1 : 1);
          else if (best === 'amount') { if (v.value < 0 || v.dr) t.debit = abs; else t.credit = abs; }
        }
      } else {
        const vals = amts.map(a => parseAmount(a.s)).filter(Boolean);
        if (vals.length >= 2) {
          const bal = vals[vals.length - 1], tx = vals[vals.length - 2];
          t.balance = bal.value;
          const abs = Math.abs(tx.value);
          if (tx.dr || tx.value < 0) t.debit = abs;
          else if (tx.cr) t.credit = abs;
          else if (prevBal !== null) { if (bal.value < prevBal) t.debit = abs; else t.credit = abs; }
          else if (/\b(cr|credit|deposit|salary|interest|refund)\b/i.test(desc)) t.credit = abs; else t.debit = abs;
        } else if (vals.length === 1) {
          const v = vals[0], abs = Math.abs(v.value);
          if (v.dr || v.value < 0) t.debit = abs; else t.credit = abs;
        }
      }
      if (t.balance !== null) prevBal = t.balance;
      last = t; out.push(t);
    }
    return out.map(t => ({ ...t, date: parseDate(t.dateStr, order) }));
  }

  global.StatementParser = { extractRows, buildTransactions, parseAmount };
})(window);
