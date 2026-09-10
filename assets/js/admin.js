/* ==========================================================================
   TERIBOY BOOKS - admin.js

   Eight tabs over three ledgers held in localStorage:
     customers  - keyed by phone number (tab 1)
     orders     - recorded on the Daily tab (tab 2), rolled up by tabs 3-7
     expenses   - recorded on the Summary tab (tab 8)

   Nothing leaves the browser. Backup writes a JSON file; Restore reads one.
   ========================================================================== */
(function () {
  'use strict';

  var STORE = 'teriboy.books.v1';
  var CURRENCY = '$';

  // Same pricing as the order form on the public site.
  var PORTION_FEES = { Diet: 1.50, Regular: 0, Extra: 3.99 };
  var MONSTER_FEE = 5.99;

  var PORTIONS = ['Diet', 'Regular', 'Extra'];
  var SODAS = ['', 'Regular soda', 'Monster'];
  var AREAS = ['Main Side', 'Ops Side', 'Off base', 'Pickup'];
  var PAYMENTS = ['Zelle', 'Cash', 'Other'];
  var STATUSES = ['New', 'Paid', 'Delivered', 'Cancelled'];
  var CATEGORIES = ['Ingredients', 'Charcoal and fuel', 'Packaging', 'Vehicle and delivery',
                    'Utilities', 'Rent', 'Wages', 'Fees and licences', 'Marketing', 'Other'];

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
  var SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var DB = { v: 1, customers: [], orders: [], expenses: [] };

  /* ------------------------------------------------------------- utilities */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function int(v) { var n = parseInt(v, 10); return isFinite(n) ? n : 0; }
  function money(n) {
    var v = Math.round(n * 100) / 100;
    return (v < 0 ? '-' : '') + CURRENCY + Math.abs(v).toFixed(2);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function normPhone(p) { return String(p || '').replace(/\D/g, ''); }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
           '-' + String(d.getDate()).padStart(2, '0');
  }
  function parseISO(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) { return null; }
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(d) ? null : d;
  }
  function niceDate(iso) {
    var d = parseISO(iso);
    return d ? SHORT[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() : iso || '';
  }

  /* ---------------------------------------------------------- persistence */
  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (raw) {
        var parsed = JSON.parse(raw);
        DB.customers = parsed.customers || [];
        DB.orders = parsed.orders || [];
        DB.expenses = parsed.expenses || [];
      }
    } catch (e) {
      flash('Could not read saved data', true);
    }
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(STORE, JSON.stringify(DB));
        flash('Saved');
      } catch (e) {
        flash('Save failed - storage may be full', true);
      }
    }, 250);
  }

  function flash(text, bad) {
    var el = $('#save-state');
    if (!el) { return; }
    el.textContent = text;
    el.classList.toggle('is-saved', !bad);
    clearTimeout(el._t);
    el._t = setTimeout(function () {
      el.textContent = 'Ready';
      el.classList.remove('is-saved');
    }, 2000);
  }

  /* ------------------------------------------------------------ order maths */
  function portionFee(portion, soda) {
    if (portion === 'Extra') { return soda === 'Monster' ? MONSTER_FEE : PORTION_FEES.Extra; }
    return PORTION_FEES[portion] || 0;
  }
  function orderCalc(o) {
    var food = num(o.food);
    var delivery = num(o.delivery);
    var portions = portionFee(o.portion, o.soda) * int(o.mains);
    return { food: food, portions: portions, delivery: delivery, total: food + portions + delivery };
  }
  function counts(o) { return o && o.status !== 'Cancelled'; }

  /* -------------------------------------------------------------- periods */
  function periodKey(iso, kind) {
    var d = parseISO(iso);
    if (!d) { return null; }
    var y = d.getFullYear(), m = d.getMonth();
    if (kind === 'daily') { return iso; }
    if (kind === 'weekly') {
      var mon = new Date(y, m, d.getDate() - ((d.getDay() + 6) % 7));
      return mon.getFullYear() + '-' + String(mon.getMonth() + 1).padStart(2, '0') +
             '-' + String(mon.getDate()).padStart(2, '0');
    }
    if (kind === 'monthly') { return y + '-' + String(m + 1).padStart(2, '0'); }
    if (kind === 'quarterly') { return y + '-Q' + (Math.floor(m / 3) + 1); }
    if (kind === 'semi') { return y + '-H' + (m < 6 ? 1 : 2); }
    return String(y);
  }

  function periodLabel(key, kind) {
    if (kind === 'daily') {
      var d = parseISO(key);
      return d ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] + ' ' + niceDate(key) : key;
    }
    if (kind === 'weekly') { return 'Week of ' + niceDate(key); }
    if (kind === 'monthly') {
      var p = key.split('-');
      return MONTHS[+p[1] - 1] + ' ' + p[0];
    }
    if (kind === 'quarterly') {
      var q = key.split('-Q');
      return 'Q' + q[1] + ' ' + q[0] + '  (' + SHORT[(q[1] - 1) * 3] + ' to ' + SHORT[(q[1] - 1) * 3 + 2] + ')';
    }
    if (kind === 'semi') {
      var h = key.split('-H');
      return 'H' + h[1] + ' ' + h[0] + (h[1] === '1' ? '  (Jan to Jun)' : '  (Jul to Dec)');
    }
    return key;
  }

  function aggregate(kind) {
    var map = {};
    function bucket(key) {
      if (!map[key]) {
        map[key] = { key: key, label: periodLabel(key, kind), orders: 0, phones: {},
                     food: 0, portions: 0, delivery: 0, income: 0, expenses: 0 };
      }
      return map[key];
    }

    DB.orders.forEach(function (o) {
      var key = periodKey(o.date, kind);
      if (!key || !counts(o)) { return; }
      var c = orderCalc(o);
      var b = bucket(key);
      b.orders += 1;
      if (normPhone(o.phone)) { b.phones[normPhone(o.phone)] = 1; }
      b.food += c.food;
      b.portions += c.portions;
      b.delivery += c.delivery;
      b.income += c.total;
    });

    DB.expenses.forEach(function (e) {
      var key = periodKey(e.date, kind);
      if (!key) { return; }
      bucket(key).expenses += num(e.amount);
    });

    return Object.keys(map).sort().reverse().map(function (k) {
      var b = map[k];
      b.customers = Object.keys(b.phones).length;
      b.net = b.income - b.expenses;
      return b;
    });
  }

  /* ------------------------------------------------------ customer helpers */
  function findCustomer(phone) {
    var key = normPhone(phone);
    if (!key) { return null; }
    for (var i = 0; i < DB.customers.length; i++) {
      if (normPhone(DB.customers[i].phone) === key) { return DB.customers[i]; }
    }
    return null;
  }

  function ensureCustomer(phone, name, area) {
    if (!normPhone(phone)) { return null; }
    var c = findCustomer(phone);
    if (!c) {
      c = { id: uid(), phone: phone, name: name || '', email: '', area: area || 'Main Side',
            building: '', notes: '', created: todayISO() };
      DB.customers.unshift(c);
    } else if (name && !c.name) {
      c.name = name;
    }
    return c;
  }

  function customerStats(phone) {
    var key = normPhone(phone);
    var out = { orders: 0, spent: 0, last: '' };
    DB.orders.forEach(function (o) {
      if (normPhone(o.phone) !== key || !counts(o)) { return; }
      out.orders += 1;
      out.spent += orderCalc(o).total;
      if (!out.last || (o.date || '') > out.last) { out.last = o.date || ''; }
    });
    return out;
  }

  /* ------------------------------------------------------- cell factories */
  function input(value, field, opts) {
    opts = opts || {};
    return '<input class="cell' + (opts.num ? ' num' : '') + '" data-field="' + field + '"' +
      ' type="' + (opts.type || 'text') + '"' +
      (opts.step ? ' step="' + opts.step + '"' : '') +
      (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') +
      ' value="' + esc(value == null ? '' : value) + '">';
  }
  function select(value, field, options) {
    return '<select class="cell" data-field="' + field + '">' +
      options.map(function (o) {
        return '<option value="' + esc(o) + '"' + (String(value) === String(o) ? ' selected' : '') + '>' +
               (o === '' ? '&mdash;' : esc(o)) + '</option>';
      }).join('') + '</select>';
  }
  function delCell() { return '<td><button class="row-del" type="button" data-del aria-label="Delete row">&times;</button></td>'; }

  /* ----------------------------------------------------------- 1 CUSTOMERS */
  function renderCustomers() {
    var body = $('#customers-table tbody');
    var term = ($('#customer-search').value || '').toLowerCase().trim();
    var rows = DB.customers.filter(function (c) {
      if (!term) { return true; }
      return [c.phone, c.name, c.email, c.area, c.building, c.notes]
        .join(' ').toLowerCase().indexOf(term) > -1;
    });

    body.innerHTML = rows.map(function (c) {
      var st = customerStats(c.phone);
      return '<tr data-id="' + c.id + '">' +
        '<td>' + input(c.phone, 'phone', { type: 'tel', placeholder: '(619) 555-0100' }) + '</td>' +
        '<td>' + input(c.name, 'name', { placeholder: 'Name' }) + '</td>' +
        '<td>' + input(c.email, 'email', { type: 'email', placeholder: 'email@example.com' }) + '</td>' +
        '<td>' + select(c.area, 'area', AREAS) + '</td>' +
        '<td>' + input(c.building, 'building', { placeholder: 'VFA-25, Bldg 760' }) + '</td>' +
        '<td>' + input(c.notes, 'notes', { placeholder: 'Allergies, gate notes...' }) + '</td>' +
        '<td class="calc num">' + st.orders + '</td>' +
        '<td class="calc num">' + money(st.spent) + '</td>' +
        '<td class="calc num muted-cell">' + (st.last ? niceDate(st.last) : '&mdash;') + '</td>' +
        delCell() +
        '</tr>';
    }).join('');

    $('#customers-empty').hidden = rows.length > 0;
    $('#customers-table').hidden = rows.length === 0;
  }

  /* --------------------------------------------------------------- 2 DAILY */
  function renderOrders() {
    var day = $('#daily-date').value;
    var body = $('#orders-table tbody');
    var rows = DB.orders.filter(function (o) { return o.date === day; });

    body.innerHTML = rows.map(function (o) {
      var c = orderCalc(o);
      return '<tr data-id="' + o.id + '">' +
        '<td>' + input(o.date, 'date', { type: 'date' }) + '</td>' +
        '<td>' + input(o.phone, 'phone', { type: 'tel', placeholder: '(619) 555-0100' }) + '</td>' +
        '<td>' + input(o.name, 'name', { placeholder: 'Name' }) + '</td>' +
        '<td>' + select(o.portion, 'portion', PORTIONS) + '</td>' +
        '<td>' + select(o.soda, 'soda', SODAS) + '</td>' +
        '<td>' + input(o.mains, 'mains', { type: 'number', step: '1', num: true }) + '</td>' +
        '<td>' + input(o.items, 'items', { placeholder: '2 x Chicken, 1 x Salmon' }) + '</td>' +
        '<td>' + input(o.food, 'food', { type: 'number', step: '0.01', num: true }) + '</td>' +
        '<td class="calc num" data-calc="portions">' + money(c.portions) + '</td>' +
        '<td>' + input(o.delivery, 'delivery', { type: 'number', step: '0.01', num: true }) + '</td>' +
        '<td class="calc num" data-calc="total">' + money(c.total) + '</td>' +
        '<td>' + select(o.payment, 'payment', PAYMENTS) + '</td>' +
        '<td>' + input(o.code, 'code', { placeholder: '1-26253' }) + '</td>' +
        '<td>' + select(o.status, 'status', STATUSES) + '</td>' +
        delCell() +
        '</tr>';
    }).join('');

    $('#orders-empty').hidden = rows.length > 0;
    $('#orders-table').hidden = rows.length === 0;
    renderDailyStats(rows);
  }

  function renderDailyStats(rows) {
    var live = rows.filter(counts);
    var income = live.reduce(function (n, o) { return n + orderCalc(o).total; }, 0);
    var plates = live.reduce(function (n, o) { return n + int(o.mains); }, 0);
    var portions = live.reduce(function (n, o) { return n + orderCalc(o).portions; }, 0);
    var avg = live.length ? income / live.length : 0;
    $('#daily-stats').innerHTML =
      stat(live.length, 'Orders today') +
      stat(plates, 'Plates') +
      stat(money(portions), 'Portion upcharges') +
      stat(money(avg), 'Average order') +
      stat(money(income), 'Income today');
  }

  function stat(value, label, cls) {
    return '<div class="stat' + (cls ? ' ' + cls : '') + '"><strong>' + esc(value) +
           '</strong><span>' + esc(label) + '</span></div>';
  }

  /* -------------------------------------------------------- 2-7 ROLLUP VIEW */
  var REPORT_COLS = ['Period', 'Orders', 'Customers', 'Food', 'Portions', 'Delivery',
                     'Income', 'Expenses', 'Net profit'];

  function renderReport(kind, table, statsEl) {
    var rows = aggregate(kind);
    var head = $('thead', table);
    var body = $('tbody', table);

    head.innerHTML = '<tr>' + REPORT_COLS.map(function (c, i) {
      return '<th' + (i ? ' class="num"' : '') + '>' + c + '</th>';
    }).join('') + '</tr>';

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9" style="padding:1.4rem;text-align:center;color:var(--muted-2)">' +
        'Nothing recorded yet. Add orders on the Daily tab and expenses on the Summary tab.</td></tr>';
      if (statsEl) { statsEl.innerHTML = ''; }
      return;
    }

    body.innerHTML = rows.map(function (b) {
      return '<tr>' +
        '<td>' + esc(b.label) + '</td>' +
        '<td class="num">' + b.orders + '</td>' +
        '<td class="num">' + b.customers + '</td>' +
        '<td class="num">' + money(b.food) + '</td>' +
        '<td class="num">' + money(b.portions) + '</td>' +
        '<td class="num">' + money(b.delivery) + '</td>' +
        '<td class="num">' + money(b.income) + '</td>' +
        '<td class="num">' + money(b.expenses) + '</td>' +
        '<td class="num ' + (b.net >= 0 ? 'pos' : 'neg') + '">' + money(b.net) + '</td>' +
        '</tr>';
    }).join('') + totalsRow(rows);

    if (statsEl) {
      var t = totals(rows);
      statsEl.innerHTML =
        stat(rows.length, kind === 'weekly' ? 'Weeks' : kind === 'monthly' ? 'Months' :
                          kind === 'quarterly' ? 'Quarters' : kind === 'semi' ? 'Halves' : 'Years') +
        stat(t.orders, 'Orders') +
        stat(money(t.income), 'Income') +
        stat(money(t.expenses), 'Expenses') +
        stat(money(t.net), 'Net profit', t.net >= 0 ? 'is-good' : 'is-bad');
    }
  }

  function totals(rows) {
    return rows.reduce(function (t, b) {
      t.orders += b.orders; t.food += b.food; t.portions += b.portions;
      t.delivery += b.delivery; t.income += b.income; t.expenses += b.expenses; t.net += b.net;
      return t;
    }, { orders: 0, food: 0, portions: 0, delivery: 0, income: 0, expenses: 0, net: 0 });
  }

  function totalsRow(rows) {
    var t = totals(rows);
    return '<tr class="totals-row">' +
      '<td>All periods</td><td class="num">' + t.orders + '</td><td class="num">&mdash;</td>' +
      '<td class="num">' + money(t.food) + '</td>' +
      '<td class="num">' + money(t.portions) + '</td>' +
      '<td class="num">' + money(t.delivery) + '</td>' +
      '<td class="num">' + money(t.income) + '</td>' +
      '<td class="num">' + money(t.expenses) + '</td>' +
      '<td class="num">' + money(t.net) + '</td></tr>';
  }

  /* ------------------------------------------------------------- 8 SUMMARY */
  function rangeStart(range) {
    var d = new Date();
    if (range === 'year') { return new Date(d.getFullYear(), 0, 1); }
    if (range === 'quarter') { return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1); }
    if (range === 'month') { return new Date(d.getFullYear(), d.getMonth(), 1); }
    return null;
  }
  function inRange(iso, start) {
    if (!start) { return true; }
    var d = parseISO(iso);
    return d ? d >= start : false;
  }

  function renderSummary() {
    var range = $('#summary-range').value;
    var start = rangeStart(range);

    var orders = DB.orders.filter(function (o) { return counts(o) && inRange(o.date, start); });
    var expenses = DB.expenses.filter(function (e) { return inRange(e.date, start); });

    var income = orders.reduce(function (n, o) { return n + orderCalc(o).total; }, 0);
    var spent = expenses.reduce(function (n, e) { return n + num(e.amount); }, 0);
    var net = income - spent;
    var margin = income > 0 ? Math.round((net / income) * 100) : 0;

    $('#summary-stats').innerHTML =
      stat(money(income), 'Total income') +
      stat(money(spent), 'Total expenses') +
      stat(money(net), 'Net profit', net >= 0 ? 'is-good' : 'is-bad') +
      stat(orders.length, 'Orders') +
      stat(money(orders.length ? income / orders.length : 0), 'Average order') +
      stat(margin + '%', 'Margin', net >= 0 ? 'is-good' : 'is-bad');

    var body = $('#expenses-table tbody');
    body.innerHTML = expenses.map(function (e) {
      return '<tr data-id="' + e.id + '">' +
        '<td>' + input(e.date, 'date', { type: 'date' }) + '</td>' +
        '<td>' + select(e.category, 'category', CATEGORIES) + '</td>' +
        '<td>' + input(e.vendor, 'vendor', { placeholder: 'Supplier' }) + '</td>' +
        '<td>' + input(e.note, 'note', { placeholder: 'What was it for?' }) + '</td>' +
        '<td>' + input(e.amount, 'amount', { type: 'number', step: '0.01', num: true }) + '</td>' +
        delCell() +
        '</tr>';
    }).join('');
    $('#expenses-empty').hidden = expenses.length > 0;
    $('#expenses-table').hidden = expenses.length === 0;

    var byCat = {};
    expenses.forEach(function (e) {
      var k = e.category || 'Other';
      byCat[k] = (byCat[k] || 0) + num(e.amount);
    });
    var cats = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; });
    $('#expense-breakdown').innerHTML = cats.length ? cats.map(function (k) {
      var pct = spent > 0 ? (byCat[k] / spent) * 100 : 0;
      return '<div class="bd-row">' +
        '<span>' + esc(k) + ' <b>' + money(byCat[k]) + ' &middot; ' + Math.round(pct) + '%</b></span>' +
        '<div class="bd-bar"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
        '</div>';
    }).join('') : '<p class="empty">No expenses in this period.</p>';
  }

  /* ---------------------------------------------------------------- wiring */
  function collection(name) {
    return name === 'customers' ? DB.customers : name === 'orders' ? DB.orders : DB.expenses;
  }
  function findRecord(name, id) {
    var list = collection(name);
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } }
    return null;
  }

  function bindTable(tableSel, name, afterEdit) {
    var table = $(tableSel);
    if (!table) { return; }

    table.addEventListener('input', function (e) {
      var cell = e.target.closest('.cell');
      if (!cell) { return; }
      var tr = cell.closest('tr');
      var rec = findRecord(name, tr.getAttribute('data-id'));
      if (!rec) { return; }
      rec[cell.getAttribute('data-field')] = cell.value;
      if (afterEdit) { afterEdit(rec, tr, cell); }
      save();
    });

    table.addEventListener('change', function (e) {
      if (e.target.tagName === 'SELECT') {
        var tr = e.target.closest('tr');
        var rec = findRecord(name, tr.getAttribute('data-id'));
        if (!rec) { return; }
        rec[e.target.getAttribute('data-field')] = e.target.value;
        if (afterEdit) { afterEdit(rec, tr, e.target); }
        save();
      }
    });

    table.addEventListener('click', function (e) {
      if (!e.target.closest('[data-del]')) { return; }
      var tr = e.target.closest('tr');
      var id = tr.getAttribute('data-id');
      var list = collection(name);
      var rec = findRecord(name, id);
      var what = name === 'customers' ? (rec.name || rec.phone || 'this customer')
               : name === 'orders' ? ('the ' + (rec.name || 'order') + ' on ' + (rec.date || ''))
               : (rec.note || rec.category || 'this expense');
      if (!window.confirm('Delete ' + what + '? This cannot be undone.')) { return; }
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) { list.splice(i, 1); break; }
      }
      save();
      renderAll();
    });
  }

  function afterOrderEdit(rec, tr, cell) {
    var c = orderCalc(rec);
    $('[data-calc="portions"]', tr).textContent = money(c.portions);
    $('[data-calc="total"]', tr).textContent = money(c.total);

    var field = cell.getAttribute('data-field');
    if (field === 'phone') {
      var known = findCustomer(rec.phone);
      if (known && known.name && !rec.name) {
        rec.name = known.name;
        var nameCell = $('[data-field="name"]', tr);
        if (nameCell) { nameCell.value = known.name; }
      }
    }
    if (field === 'phone' || field === 'name') { ensureCustomer(rec.phone, rec.name); }
    if (field === 'date') { renderOrders(); return; }
    renderDailyStats(DB.orders.filter(function (o) { return o.date === $('#daily-date').value; }));
  }

  /* ------------------------------------------------------------------ CSV */
  function csv(rows) {
    return rows.map(function (r) {
      return r.map(function (v) {
        var s = String(v == null ? '' : v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\r\n');
  }

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 200);
  }

  function exportCsv(what) {
    var rows, name;
    if (what === 'customers') {
      name = 'teriboy-customers';
      rows = [['Phone', 'Name', 'Email', 'Area', 'Building/command', 'Notes', 'Orders', 'Spent', 'Last order']];
      DB.customers.forEach(function (c) {
        var st = customerStats(c.phone);
        rows.push([c.phone, c.name, c.email, c.area, c.building, c.notes, st.orders, st.spent.toFixed(2), st.last]);
      });
    } else if (what === 'orders') {
      name = 'teriboy-orders';
      rows = [['Date', 'Phone', 'Name', 'Portion', 'Soda', 'Mains', 'Items', 'Food', 'Portions', 'Delivery', 'Total', 'Payment', 'Code', 'Status']];
      DB.orders.slice().sort(function (a, b) { return (a.date || '') < (b.date || '') ? 1 : -1; })
        .forEach(function (o) {
          var c = orderCalc(o);
          rows.push([o.date, o.phone, o.name, o.portion, o.soda, o.mains, o.items,
                     c.food.toFixed(2), c.portions.toFixed(2), c.delivery.toFixed(2),
                     c.total.toFixed(2), o.payment, o.code, o.status]);
        });
    } else if (what === 'expenses') {
      name = 'teriboy-expenses';
      rows = [['Date', 'Category', 'Supplier', 'Note', 'Amount']];
      DB.expenses.slice().sort(function (a, b) { return (a.date || '') < (b.date || '') ? 1 : -1; })
        .forEach(function (e) { rows.push([e.date, e.category, e.vendor, e.note, num(e.amount).toFixed(2)]); });
    } else {
      name = 'teriboy-' + what;
      rows = [REPORT_COLS];
      aggregate(what).forEach(function (b) {
        rows.push([b.label, b.orders, b.customers, b.food.toFixed(2), b.portions.toFixed(2),
                   b.delivery.toFixed(2), b.income.toFixed(2), b.expenses.toFixed(2), b.net.toFixed(2)]);
      });
    }
    download(name + '-' + todayISO() + '.csv', csv(rows));
    flash('Exported');
  }

  /* --------------------------------------------------------------- render */
  function renderAll() {
    renderCustomers();
    renderOrders();
    renderReport('daily', $('#daily-report'));
    ['weekly', 'monthly', 'quarterly', 'semi', 'annual'].forEach(function (k) {
      renderReport(k, $('[data-report="' + k + '"]'), $('[data-stats="' + k + '"]'));
    });
    renderSummary();
  }

  function showTab(name) {
    $$('.tab').forEach(function (t) {
      var on = t.getAttribute('data-tab') === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('.panel-sheet').forEach(function (p) {
      p.hidden = p.getAttribute('data-panel') !== name;
    });
    try { localStorage.setItem(STORE + '.tab', name); } catch (e) {}
    renderAll();
  }

  /* ----------------------------------------------------------------- init */
  function init() {
    load();

    $('#daily-date').value = todayISO();

    $$('.tab').forEach(function (t) {
      t.addEventListener('click', function () { showTab(t.getAttribute('data-tab')); });
    });

    $('#customer-search').addEventListener('input', renderCustomers);
    $('#daily-date').addEventListener('change', renderOrders);
    $('#summary-range').addEventListener('change', renderSummary);

    $('#add-customer').addEventListener('click', function () {
      DB.customers.unshift({ id: uid(), phone: '', name: '', email: '', area: 'Main Side',
                             building: '', notes: '', created: todayISO() });
      save();
      renderCustomers();
      var first = $('#customers-table tbody .cell');
      if (first) { first.focus(); }
    });

    $('#add-order').addEventListener('click', function () {
      DB.orders.unshift({ id: uid(), date: $('#daily-date').value || todayISO(), phone: '', name: '',
                          portion: 'Regular', soda: '', mains: 1, items: '', food: '', delivery: '4.90',
                          payment: 'Zelle', code: '', status: 'New' });
      save();
      renderOrders();
      var first = $('#orders-table tbody .cell[data-field="phone"]');
      if (first) { first.focus(); }
    });

    $('#add-expense').addEventListener('click', function () {
      DB.expenses.unshift({ id: uid(), date: todayISO(), category: 'Ingredients',
                            vendor: '', note: '', amount: '' });
      save();
      renderSummary();
      var first = $('#expenses-table tbody .cell[data-field="vendor"]');
      if (first) { first.focus(); }
    });

    bindTable('#customers-table', 'customers', function (rec, tr, cell) {
      if (cell.getAttribute('data-field') === 'phone') { flashDuplicate(rec, tr); }
    });
    bindTable('#orders-table', 'orders', afterOrderEdit);
    bindTable('#expenses-table', 'expenses', function () { renderSummary(); });

    $$('[data-csv]').forEach(function (b) {
      b.addEventListener('click', function () { exportCsv(b.getAttribute('data-csv')); });
    });

    $('#backup').addEventListener('click', function () {
      download('teriboy-books-' + todayISO() + '.json', JSON.stringify(DB, null, 2), 'application/json');
      flash('Backed up');
    });

    $('#restore').addEventListener('click', function () { $('#restore-file').click(); });
    $('#restore-file').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) { return; }
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = JSON.parse(reader.result);
          if (!parsed || typeof parsed !== 'object') { throw new Error('not a workbook'); }
          if (!window.confirm('Replace everything in this browser with the contents of ' +
                              file.name + '? Back up first if you are not sure.')) { return; }
          DB.customers = parsed.customers || [];
          DB.orders = parsed.orders || [];
          DB.expenses = parsed.expenses || [];
          save();
          renderAll();
          flash('Restored');
        } catch (err) {
          flash('That file is not a Teriboy backup', true);
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    // Back to top, matching the public site.
    var top = $('.to-top');
    if (top) {
      top.hidden = false;
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var ticking = false;
      var sync = function () { top.classList.toggle('is-in', window.pageYOffset > 420); ticking = false; };
      sync();
      window.addEventListener('scroll', function () {
        if (!ticking) { ticking = true; window.requestAnimationFrame(sync); }
      }, { passive: true });
      top.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      });
    }

    var last = 'customers';
    try { last = localStorage.getItem(STORE + '.tab') || 'customers'; } catch (e) {}
    showTab($('[data-tab="' + last + '"]') ? last : 'customers');
  }

  function flashDuplicate(rec, tr) {
    var key = normPhone(rec.phone);
    if (!key) { return; }
    var clash = DB.customers.filter(function (c) {
      return c.id !== rec.id && normPhone(c.phone) === key;
    }).length > 0;
    tr.style.boxShadow = clash ? 'inset 0 0 0 1px var(--red)' : '';
    if (clash) { flash('That phone number is already in the book', true); }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
