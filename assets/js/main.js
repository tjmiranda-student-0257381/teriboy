/* ==========================================================================
   TERIBOY - main.js
   Nav, reveal animations, menu filters, accordions, the next-day order
   builder (with the 9:00 PM cut-off rule) and Formspree AJAX submission.
   ========================================================================== */
(function () {
  'use strict';

  var CUTOFF_HOUR = 21;              // 9:00 PM - orders after this move a day out
  var DELIVERY_FEE = 4.9;
  var FREE_DELIVERY_OVER = 60;
  var CURRENCY = '$';

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var money = function (n) { return CURRENCY + n.toFixed(2); };

  /* ---------------------------------------------------------------- header */
  function initHeader() {
    var header = $('.site-header');
    var toggle = $('.nav-toggle');
    var nav = $('#primary-nav');

    if (header) {
      var onScroll = function () {
        header.classList.toggle('is-stuck', window.scrollY > 12);
      };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        var open = document.body.classList.toggle('nav-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      nav.addEventListener('click', function (e) {
        if (e.target.closest('a')) {
          document.body.classList.remove('nav-open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && document.body.classList.contains('nav-open')) {
          document.body.classList.remove('nav-open');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.focus();
        }
      });
    }

    // Mark the current page in both menus.
    var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    $$('.nav a, .footer-list a, .footer-bottom a').forEach(function (a) {
      var href = (a.getAttribute('href') || '').split('/').pop().split('#')[0].toLowerCase();
      if (href && href === here) {
        a.classList.add('is-active');
        if (a.closest('.nav')) { a.setAttribute('aria-current', 'page'); }
      }
    });
  }

  /* ---------------------------------------------------------------- reveal */
  function initReveal() {
    var items = $$('.reveal');
    if (!items.length) { return; }
    if (!('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) { return; }
        var el = entry.target;
        var delay = parseInt(el.getAttribute('data-delay') || '0', 10);
        setTimeout(function () { el.classList.add('is-in'); }, delay);
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------- accordion */
  function initAccordion() {
    $$('.acc__btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = btn.closest('.acc');
        var panel = $('.acc__panel', item);
        var open = item.classList.contains('is-open');

        // One open panel at a time inside the same accordion group.
        var group = item.closest('.accordion');
        if (group) {
          $$('.acc.is-open', group).forEach(function (other) {
            if (other === item) { return; }
            other.classList.remove('is-open');
            $('.acc__panel', other).style.maxHeight = null;
            $('.acc__btn', other).setAttribute('aria-expanded', 'false');
          });
        }

        item.classList.toggle('is-open', !open);
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
        panel.style.maxHeight = open ? null : panel.scrollHeight + 'px';
      });
    });

    // Deep link: /faqs.html#delivery opens that question.
    if (location.hash) {
      var target = document.getElementById(location.hash.slice(1));
      if (target && target.classList.contains('acc')) {
        setTimeout(function () { $('.acc__btn', target).click(); }, 250);
      }
    }
  }

  /* ---------------------------------------------------------- menu filters */
  function initFilters() {
    var buttons = $$('.filter');
    if (!buttons.length) { return; }
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cat = btn.getAttribute('data-filter');
        buttons.forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        $$('[data-cat]').forEach(function (group) {
          var show = cat === 'all' || group.getAttribute('data-cat') === cat;
          group.hidden = !show;
        });
      });
    });
  }

  /* ------------------------------------------------- delivery date / cutoff */
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];

  function toISO(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function pretty(d) {
    return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }
  function earliestDelivery() {
    var now = new Date();
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Order tonight -> arrives tomorrow. Past the 9 PM cut-off -> the day after.
    d.setDate(d.getDate() + (now.getHours() >= CUTOFF_HOUR ? 2 : 1));
    return { date: d, missed: now.getHours() >= CUTOFF_HOUR, now: now };
  }

  function initCutoffNotices() {
    var info = earliestDelivery();
    $$('[data-cutoff-date]').forEach(function (el) { el.textContent = pretty(info.date); });
    $$('[data-cutoff-state]').forEach(function (el) {
      el.textContent = info.missed
        ? "Tonight's 9:00 PM cut-off has passed - the earliest we can deliver is"
        : 'Order before 9:00 PM tonight and we deliver on';
    });
    var countdown = $('[data-countdown]');
    if (countdown) {
      var tick = function () {
        var now = new Date();
        var cut = new Date(now.getFullYear(), now.getMonth(), now.getDate(), CUTOFF_HOUR, 0, 0);
        if (now >= cut) { cut.setDate(cut.getDate() + 1); }
        var diff = Math.max(0, cut - now);
        var h = Math.floor(diff / 3600000);
        var m = Math.floor((diff % 3600000) / 60000);
        var s = Math.floor((diff % 60000) / 1000);
        countdown.textContent = String(h).padStart(2, '0') + 'h ' +
                                String(m).padStart(2, '0') + 'm ' +
                                String(s).padStart(2, '0') + 's';
      };
      tick();
      setInterval(tick, 1000);
    }
  }

  function initDateField() {
    var input = $('#delivery-date');
    if (!input) { return; }
    var info = earliestDelivery();
    var min = toISO(info.date);
    var max = new Date(info.date);
    max.setDate(max.getDate() + 30);

    input.min = min;
    input.max = toISO(max);
    if (!input.value) { input.value = min; }

    var hint = $('#delivery-date-hint');
    var sync = function () {
      if (input.value && input.value < min) { input.value = min; }
      if (hint) {
        var parts = input.value.split('-');
        var picked = new Date(+parts[0], +parts[1] - 1, +parts[2]);
        hint.textContent = isNaN(picked) ? '' : 'Delivering ' + pretty(picked) + '.';
      }
      updateSummary();
    };
    input.addEventListener('change', sync);
    sync();
  }

  /* --------------------------------------------------------- order builder */
  function orderItems() {
    return $$('.pick-row').map(function (row) {
      return {
        row: row,
        name: row.getAttribute('data-name'),
        price: parseFloat(row.getAttribute('data-price')),
        qty: parseInt($('output', row).value || '0', 10)
      };
    });
  }

  function updateSummary() {
    var list = $('#summary-list');
    if (!list) { return; }

    var items = orderItems().filter(function (i) { return i.qty > 0; });
    var subtotal = items.reduce(function (sum, i) { return sum + i.price * i.qty; }, 0);
    var fee = items.length === 0 || subtotal >= FREE_DELIVERY_OVER ? 0 : DELIVERY_FEE;
    var total = subtotal + fee;

    list.innerHTML = items.length
      ? items.map(function (i) {
          return '<li><span>' + i.qty + ' &times; ' + i.name + '</span>' +
                 '<span>' + money(i.price * i.qty) + '</span></li>';
        }).join('')
      : '<li class="summary__empty" style="border:0">No dishes chosen yet - pick a few below.</li>';

    var setText = function (sel, val) { var el = $(sel); if (el) { el.textContent = val; } };
    setText('#sum-count', String(items.reduce(function (n, i) { return n + i.qty; }, 0)));
    setText('#sum-subtotal', money(subtotal));
    setText('#sum-fee', items.length && fee === 0 ? 'FREE' : money(fee));
    setText('#sum-total', money(total));

    var slotEl = $('input[name="delivery_slot"]:checked');
    var dateEl = $('#delivery-date');
    var lines = items.map(function (i) {
      return i.qty + ' x ' + i.name + ' @ ' + money(i.price) + ' = ' + money(i.price * i.qty);
    });
    var hidden = $('#order-details');
    if (hidden) {
      hidden.value = (lines.length ? lines.join('\n') : '(no items selected)') +
        '\n----------------------------------------' +
        '\nSubtotal: ' + money(subtotal) +
        '\nDelivery: ' + (items.length && fee === 0 ? 'FREE' : money(fee)) +
        '\nTOTAL: ' + money(total) +
        '\nDelivery date: ' + (dateEl && dateEl.value ? dateEl.value : '-') +
        '\nDelivery slot: ' + (slotEl ? slotEl.value : '-');
    }
    var totalField = $('#order-total');
    if (totalField) { totalField.value = money(total); }

    var submit = $('#order-submit');
    if (submit) {
      submit.disabled = items.length === 0;
      submit.textContent = items.length === 0
        ? 'Add a dish to continue'
        : 'Place order - ' + money(total);
    }
    return items.length;
  }

  function initOrderBuilder() {
    var rows = $$('.pick-row');
    if (!rows.length) { return; }

    rows.forEach(function (row) {
      var out = $('output', row);
      var set = function (n) {
        var qty = Math.max(0, Math.min(30, n));
        out.value = qty;
        row.classList.toggle('is-picked', qty > 0);
        var field = $('input[type="hidden"]', row);
        if (field) { field.value = qty; }
        updateSummary();
      };
      $$('button', row).forEach(function (btn) {
        btn.addEventListener('click', function () {
          set(parseInt(out.value || '0', 10) + (btn.getAttribute('data-step') === 'up' ? 1 : -1));
        });
      });
    });

    $$('input[name="delivery_slot"]').forEach(function (r) {
      r.addEventListener('change', updateSummary);
    });

    // "Add to order" links coming from the menu page: order.html?add=Chicken+Teriyaki
    var wanted = new URLSearchParams(location.search).get('add');
    if (wanted) {
      var match = rows.filter(function (r) {
        return r.getAttribute('data-name').toLowerCase() === wanted.toLowerCase();
      })[0];
      if (match) {
        $('button[data-step="up"]', match).click();
        match.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    updateSummary();
  }

  /* ------------------------------------------------ payment code (Julian) */
  // 00001-26253 -> order 1, day 253 of 2026. Shown to the customer as 1-26253.
  function julianStamp(d) {
    var days = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) -
                           Date.UTC(d.getFullYear(), 0, 0)) / 86400000);
    return String(d.getFullYear() % 100).padStart(2, '0') + String(days).padStart(3, '0');
  }

  function nextPaymentCode() {
    var stamp = julianStamp(new Date());
    var key = 'teriboy.seq.' + stamp;
    var seq = 1;
    try {
      var stored = parseInt(window.localStorage.getItem(key), 10);
      if (stored > 0) { seq = stored + 1; }
    } catch (e) { /* private browsing - start the day again at 1 */ }
    return {
      seq: seq,
      stamp: stamp,
      key: key,
      code: seq + '-' + stamp,
      full: String(seq).padStart(5, '0') + '-' + stamp
    };
  }

  // Only burn a number once the order has actually been accepted.
  function commitPaymentCode(info) {
    try { window.localStorage.setItem(info.key, String(info.seq)); } catch (e) {}
  }

  /* --------------------------------------------------- order confirmation */
  function orderSnapshot() {
    var slot = $('input[name="delivery_slot"]:checked');
    var pay = $('input[name="payment"]:checked');
    var area = $('input[name="base_area"]:checked');
    var hint = $('#delivery-date-hint');
    var total = $('#sum-total');
    return {
      total: total ? total.textContent : '',
      slot: slot ? slot.value : '',
      payment: pay ? pay.value : '',
      area: area ? area.value : '',
      dateText: hint ? hint.textContent.replace(/^Delivering\s*/, '').replace(/\.$/, '') : ''
    };
  }

  function zelleBlock(info, snap) {
    return '' +
      '<div class="confirm__code">' +
        '<span class="confirm__code-label">Your payment code</span>' +
        '<strong class="confirm__code-value">' + info.code + '</strong>' +
        '<button class="btn btn--sm btn--ghost" type="button" data-copy="' + info.code + '">Copy code</button>' +
      '</div>' +
      '<div class="zelle">' +
        '<figure class="zelle__qr">' +
          '<img src="assets/img/zelle-qr.jpg" alt="Zelle QR code for paying Teriboy" width="300" height="300">' +
          '<figcaption>Scan with your banking app</figcaption>' +
        '</figure>' +
        '<div class="zelle__body">' +
          '<h3>Send <span class="gold">' + snap.total + '</span> with Zelle</h3>' +
          '<ol class="numbered">' +
            '<li>Open your banking app and choose <strong>Zelle</strong>.</li>' +
            '<li>Scan the QR code to load our details.</li>' +
            '<li>Enter <strong class="gold">' + info.code + '</strong> in the <strong>memo</strong> field.</li>' +
            '<li>Send the exact total, <strong>' + snap.total + '</strong>, before tonight&rsquo;s 9:00 PM cut-off.</li>' +
          '</ol>' +
          '<p class="muted">Paying from this phone? Screenshot the QR code, then pick it from your photos inside the Zelle screen. ' +
          'The memo code is the only thing that ties your transfer to your food, so please do not leave it blank.</p>' +
        '</div>' +
      '</div>';
  }

  function cashBlock(snap) {
    return '' +
      '<div class="notice">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="6" width="20" height="12" rx="3"/><circle cx="12" cy="12" r="2.6"/></svg>' +
        '<div><strong>Paying cash on delivery</strong>' +
        'Have <strong>' + snap.total + '</strong> ready for the driver. Changed your mind and want to pay by Zelle instead? ' +
        'Call us on (619) 730-8655 and we will give you a payment code.</div>' +
      '</div>';
  }

  function showOrderConfirmation(info, snap) {
    var box = $('#order-confirm');
    var form = $('#order-form');
    if (!box || !form) { return false; }

    var paidByZelle = snap.payment.indexOf('Zelle') === 0;
    box.innerHTML = '' +
      '<div class="confirm__head">' +
        '<span class="confirm__tick" aria-hidden="true">' +
          '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
        '</span>' +
        '<h2>Order received</h2>' +
        '<p class="lead">Delivering <strong>' + (snap.dateText || 'as scheduled') + '</strong>' +
        (snap.slot ? ' &mdash; ' + snap.slot : '') + (snap.area ? ', ' + snap.area : '') + '.' +
        ' A confirmation is on its way to your inbox.</p>' +
      '</div>' +
      (paidByZelle ? zelleBlock(info, snap) : cashBlock(snap)) +
      '<div class="btn-row btn-row--center">' +
        '<a class="btn btn--ghost" href="menu.html">Back to the menu</a>' +
        '<a class="btn btn--ghost" href="faqs.html">Questions about payment</a>' +
      '</div>';

    form.hidden = true;
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });

    var copy = $('[data-copy]', box);
    if (copy) {
      copy.addEventListener('click', function () {
        var text = copy.getAttribute('data-copy');
        var done = function () {
          copy.textContent = 'Copied';
          setTimeout(function () { copy.textContent = 'Copy code'; }, 2200);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, done);
        } else {
          var tmp = document.createElement('input');
          tmp.value = text;
          document.body.appendChild(tmp);
          tmp.select();
          try { document.execCommand('copy'); } catch (e) {}
          document.body.removeChild(tmp);
          done();
        }
      });
    }
    return true;
  }

  /* ------------------------------------------------------ Formspree submit */
  function initForms() {
    $$('form[data-ajax]').forEach(function (form) {
      var status = $('.form-status', form);
      var button = $('button[type="submit"]', form);

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!form.reportValidity()) { return; }

        if (form.id === 'order-form' && updateSummary() === 0) {
          if (status) {
            status.className = 'form-status is-err';
            status.textContent = 'Please choose at least one dish before placing your order.';
          }
          return;
        }

        var isOrder = form.id === 'order-form';
        var codeInfo = null;
        var snap = null;

        if (isOrder) {
          codeInfo = nextPaymentCode();
          snap = orderSnapshot();
          var codeField = $('#payment-code');
          if (codeField) { codeField.value = codeInfo.code; }
          var details = $('#order-details');
          if (details) {
            details.value += '\n' +
              'PAYMENT: ' + snap.payment + '\n' +
              'PAYMENT CODE (Zelle memo): ' + codeInfo.code + '  [' + codeInfo.full + ']';
          }
        }

        var label = button ? button.textContent : '';
        if (button) { button.disabled = true; button.textContent = 'Sending...'; }
        if (status) { status.className = 'form-status'; status.textContent = ''; }

        fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' }
        }).then(function (res) {
          if (res.ok) {
            var shown = false;
            if (isOrder) {
              commitPaymentCode(codeInfo);
              shown = showOrderConfirmation(codeInfo, snap);
            }
            form.reset();
            $$('.pick-row').forEach(function (row) {
              $('output', row).value = 0;
              row.classList.remove('is-picked');
              var f = $('input[type="hidden"]', row);
              if (f) { f.value = 0; }
            });
            initDateField();
            updateSummary();
            if (status && !shown) {
              status.className = 'form-status is-ok';
              status.textContent = form.getAttribute('data-success') ||
                'Thank you! We have received your message and will reply shortly.';
              status.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          } else {
            return res.json().then(function (data) {
              throw new Error(data.errors ? data.errors.map(function (er) { return er.message; }).join(', ') : 'Submission failed');
            });
          }
        }).catch(function (err) {
          if (status) {
            status.className = 'form-status is-err';
            status.textContent = 'Sorry, something went wrong (' + err.message +
              '). Please call us on (619) 730-8655 and we will take your order by phone.';
          }
        }).then(function () {
          if (button) { button.disabled = false; button.textContent = label; }
          updateSummary();
        });
      });
    });
  }

  /* ------------------------------------------------------------------ misc */
  function initMisc() {
    $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

    // Video placeholders: swap the poster panel for the real embed on click.
    $$('[data-video]').forEach(function (holder) {
      holder.addEventListener('click', function () {
        var src = holder.getAttribute('data-video');
        if (!src) {
          if (!$('.video-soon', holder)) {
            var note = document.createElement('p');
            note.className = 'video-soon';
            note.textContent = 'This clip is publishing soon - follow us to catch it first.';
            holder.appendChild(note);
          }
          return;
        }
        var wrap = document.createElement('div');
        wrap.className = 'ratio';
        wrap.innerHTML = '<iframe src="' + src + '" title="Teriboy video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>';
        holder.replaceWith(wrap);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initHeader();
    initReveal();
    initAccordion();
    initFilters();
    initCutoffNotices();
    initDateField();
    initOrderBuilder();
    initForms();
    initMisc();
  });
})();
