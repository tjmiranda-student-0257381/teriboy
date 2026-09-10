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

        var label = button ? button.textContent : '';
        if (button) { button.disabled = true; button.textContent = 'Sending...'; }
        if (status) { status.className = 'form-status'; status.textContent = ''; }

        fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' }
        }).then(function (res) {
          if (res.ok) {
            form.reset();
            $$('.pick-row').forEach(function (row) {
              $('output', row).value = 0;
              row.classList.remove('is-picked');
              var f = $('input[type="hidden"]', row);
              if (f) { f.value = 0; }
            });
            initDateField();
            updateSummary();
            if (status) {
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
              '). Please call us on (206) 555-0142 and we will take your order by phone.';
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
