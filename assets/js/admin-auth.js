/* ==========================================================================
   TERIBOY BOOKS - admin-auth.js
   A sign-in gate for the workbook.

   Three ways to lock it:

     1. GOOGLE_CLIENT_ID  "Sign in with Google". Google checks your Gmail
                          password on google.com - it never touches this page -
                          and tells us which account signed in. Recommended.
     2. PASSPHRASE        A phrase you choose. Stored here only as a salted
                          SHA-256 hash. NEVER use your email password.
     3. TOTP_SECRET       Optional 6-digit codes from an authenticator app.

   Set any one of them and the workbook locks. Set two and it asks for both.

   ---------------------------------------------------------------------------
   READ THIS BEFORE YOU RELY ON IT
   ---------------------------------------------------------------------------
   teriboy.com is a static site. There is no server, so every check below runs
   in the visitor's own browser and CAN BE BYPASSED by anyone who opens dev
   tools, disables JavaScript, or reads this file. The workbook's data lives in
   localStorage on this device and is readable the same way.

   Treat this as a lock on a drawer: it stops someone who wanders up to an
   unlocked laptop, and it stops a stranger who guesses the URL. It is not
   protection against someone who is actually trying.

   For real protection, put the page behind an identity proxy that checks
   people BEFORE the file is served. Cloudflare Access does exactly this -
   Google sign-in plus MFA, free for small teams - and works with GitHub Pages.
   Setup notes are in README.md.
   ========================================================================== */
(function () {
  'use strict';

  /* ==========================================================================
     CONFIGURATION - fill in ONE of these to switch the lock on
     ========================================================================== */
  var AUTH = {

    // 1. SIGN IN WITH GOOGLE  (recommended - your Gmail and password, checked
    //    by Google itself). Get this from Google Cloud Console > APIs and
    //    Services > Credentials > Create credentials > OAuth client ID >
    //    Web application. Put https://teriboy.com under "Authorised JavaScript
    //    origins". It looks like 1234567-abcdef.apps.googleusercontent.com
    GOOGLE_CLIENT_ID: '',

    // Only these Google accounts may open the workbook.
    ALLOWED_EMAILS: ['miranda.tracyjon.n@gmail.com'],

    // 2. PASSPHRASE  (no setup at all - press "Set up the lock" in the
    //    workbook, type a phrase, and paste the two lines it gives you here).
    //    Use a phrase you do not use anywhere else. NOT your email password.
    PASSPHRASE_SALT: '',
    PASSPHRASE_SHA256: '',

    // 3. AUTHENTICATOR  (optional). This must be the long base32 SETUP KEY the
    //    app shows when you add an account - NOT one of the 6-digit codes.
    TOTP_SECRET: '',

    // How long an unlock lasts before it asks again.
    SESSION_HOURS: 8
  };

  /* ========================================================================== */

  var KEY = 'teriboy.books.unlocked';
  var hasGoogle = !!AUTH.GOOGLE_CLIENT_ID;
  var hasPass = !!(AUTH.PASSPHRASE_SHA256 && AUTH.PASSPHRASE_SALT);
  var hasTotp = !!AUTH.TOTP_SECRET;
  var configured = hasGoogle || hasPass || hasTotp;

  // Hide the workbook before it paints, so nothing flashes on screen.
  if (configured && !unlockedRecently()) {
    document.documentElement.classList.add('locked');
  }

  function unlockedRecently() {
    try {
      var until = parseInt(sessionStorage.getItem(KEY), 10);
      return isFinite(until) && Date.now() < until;
    } catch (e) { return false; }
  }

  function rememberUnlock() {
    try {
      sessionStorage.setItem(KEY, String(Date.now() + AUTH.SESSION_HOURS * 3600000));
    } catch (e) {}
  }

  /* ---------------------------------------------------------------- SHA-256 */
  // Written out in full rather than using crypto.subtle, which browsers only
  // expose over HTTPS - this way the passphrase still works from a local file.
  function sha256Hex(message) {
    var h = [], k = [], primes = 0, composite = {}, n;
    function frac(x) { return ((x - Math.floor(x)) * 4294967296) | 0; }
    function rotr(x, c) { return (x >>> c) | (x << (32 - c)); }

    for (n = 2; primes < 64; n++) {
      if (!composite[n]) {
        for (var m = n * n; m < 313; m += n) { composite[m] = 1; }
        if (primes < 8) { h[primes] = frac(Math.pow(n, 1 / 2)); }
        k[primes++] = frac(Math.pow(n, 1 / 3));
      }
    }

    // UTF-8 bytes
    var bytes = [], i, cp;
    for (i = 0; i < message.length; i++) {
      cp = message.charCodeAt(i);
      if (cp < 0x80) { bytes.push(cp); }
      else if (cp < 0x800) { bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63)); }
      else if (cp < 0xd800 || cp >= 0xe000) {
        bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else {
        cp = 0x10000 + (((cp & 1023) << 10) | (message.charCodeAt(++i) & 1023));
        bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63),
                   0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      }
    }

    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) { bytes.push(0); }
    bytes.push(0, 0, 0, 0,
               (bitLen >>> 24) & 255, (bitLen >>> 16) & 255, (bitLen >>> 8) & 255, bitLen & 255);

    var w = new Array(64), t;
    for (var off = 0; off < bytes.length; off += 64) {
      for (t = 0; t < 16; t++) {
        w[t] = (bytes[off + t * 4] << 24) | (bytes[off + t * 4 + 1] << 16) |
               (bytes[off + t * 4 + 2] << 8) | bytes[off + t * 4 + 3];
      }
      for (t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (hh + S1 + ch + k[t] + w[t]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }

    return h.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }

  function hashPassphrase(salt, phrase) { return sha256Hex(salt + ':' + phrase); }

  function randomHex(len) {
    var bytes = new Uint8Array(len);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }

  /* ------------------------------------------------------------ TOTP (RFC 6238) */
  var B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  function base32Decode(str) {
    var clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
    var bits = 0, value = 0, out = [];
    for (var i = 0; i < clean.length; i++) {
      value = (value << 5) | B32.indexOf(clean[i]);
      bits += 5;
      if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
    }
    return new Uint8Array(out);
  }

  function base32Encode(bytes) {
    var bits = 0, value = 0, out = '';
    for (var i = 0; i < bytes.length; i++) {
      value = (value << 8) | bytes[i];
      bits += 8;
      while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) { out += B32[(value << (5 - bits)) & 31]; }
    return out;
  }

  // A setup key is a long base32 string. A 6-digit code is not.
  function totpSecretLooksValid(secret) {
    return base32Decode(secret).length >= 10;
  }

  function totp(secret, offsetSteps) {
    var key = base32Decode(secret);
    if (!key.length || !window.crypto || !window.crypto.subtle) {
      return Promise.reject(new Error('insecure-context'));
    }
    var counter = Math.floor(Date.now() / 30000) + (offsetSteps || 0);
    var buf = new ArrayBuffer(8);
    var view = new DataView(buf);
    view.setUint32(0, Math.floor(counter / 0x100000000));
    view.setUint32(4, counter >>> 0);

    return window.crypto.subtle
      .importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
      .then(function (cryptoKey) { return window.crypto.subtle.sign('HMAC', cryptoKey, buf); })
      .then(function (sig) {
        var b = new Uint8Array(sig);
        var o = b[b.length - 1] & 0x0f;
        var code = ((b[o] & 0x7f) << 24 | b[o + 1] << 16 | b[o + 2] << 8 | b[o + 3]) % 1000000;
        return String(code).padStart(6, '0');
      });
  }

  function verifyTotp(secret, entered) {
    var clean = String(entered).replace(/\D/g, '');
    if (clean.length !== 6) { return Promise.resolve(false); }
    return Promise.all([totp(secret, -1), totp(secret, 0), totp(secret, 1)])
      .then(function (codes) { return codes.indexOf(clean) > -1; });
  }

  /* ------------------------------------------------------------------ helpers */
  function decodeJwt(token) {
    try {
      var payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(payload))));
    } catch (e) { return null; }
  }

  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstChild;
  }

  function say(msg, bad) {
    var box = document.querySelector('.gate__msg');
    if (!box) { return; }
    box.textContent = msg || '';
    box.className = 'gate__msg' + (msg ? (bad ? ' is-err' : ' is-ok') : '');
  }

  /* --------------------------------------------------------------- the gate */
  function buildGate() {
    var gate = el(
      '<div class="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title">' +
        '<div class="gate__card">' +
          '<div class="gate__lock" aria-hidden="true">' +
            '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
            '<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>' +
          '</div>' +
          '<h1 id="gate-title">Teriboy Books</h1>' +
          '<p class="gate__sub">This workbook is locked.</p>' +

          '<div class="gate__step" data-step="google" hidden></div>' +

          '<div class="gate__step" data-step="pass" hidden>' +
            '<label for="gate-pass">Passphrase</label>' +
            '<input id="gate-pass" class="gate__pass" type="password" autocomplete="current-password" ' +
              'placeholder="Your passphrase">' +
            '<button class="btn btn--full" type="button" data-act="pass">Unlock</button>' +
          '</div>' +

          '<div class="gate__step" data-step="totp" hidden>' +
            '<label for="gate-code">6-digit code from your authenticator app</label>' +
            '<input id="gate-code" class="gate__code" type="text" inputmode="numeric" ' +
              'autocomplete="one-time-code" maxlength="6" placeholder="000000">' +
            '<button class="btn btn--full" type="button" data-act="verify">Unlock</button>' +
          '</div>' +

          '<p class="gate__msg"></p>' +
          '<p class="gate__note">This lock runs in your browser, so it deters rather than defends. ' +
            'See README.md for putting the page behind Cloudflare Access.</p>' +
        '</div>' +
      '</div>');

    document.body.appendChild(gate);

    var steps = {
      google: gate.querySelector('[data-step="google"]'),
      pass: gate.querySelector('[data-step="pass"]'),
      totp: gate.querySelector('[data-step="totp"]')
    };

    function show(which) {
      Object.keys(steps).forEach(function (name) { steps[name].hidden = name !== which; });
      var field = steps[which] && steps[which].querySelector('input');
      if (field) { field.focus(); }
    }

    function unlock() {
      rememberUnlock();
      document.documentElement.classList.remove('locked');
      gate.remove();
    }

    function badTotpWarning() {
      say('TOTP_SECRET in admin-auth.js is not a setup key - it should be a long string of ' +
          'letters, not a 6-digit code. Clear it to skip this step.', true);
    }

    // Factors run in order: Google, then passphrase, then authenticator.
    function next(after) {
      if (after === 'google' && hasPass) { return show('pass'); }
      if (hasTotp) {
        show('totp');
        if (!totpSecretLooksValid(AUTH.TOTP_SECRET)) { badTotpWarning(); }
        return;
      }
      unlock();
    }

    gate.querySelector('[data-act="pass"]').addEventListener('click', function () {
      var entered = gate.querySelector('#gate-pass').value;
      if (!entered) { return say('Enter your passphrase.', true); }
      if (hashPassphrase(AUTH.PASSPHRASE_SALT, entered) === AUTH.PASSPHRASE_SHA256) {
        say('');
        next('pass');
      } else {
        say('That passphrase is not right.', true);
      }
    });

    gate.querySelector('[data-act="verify"]').addEventListener('click', function () {
      if (!totpSecretLooksValid(AUTH.TOTP_SECRET)) { return badTotpWarning(); }
      var code = gate.querySelector('#gate-code').value;
      say('Checking...');
      verifyTotp(AUTH.TOTP_SECRET, code).then(function (ok) {
        if (ok) { unlock(); } else { say('That code is not right. Try the next one.', true); }
      }).catch(function (err) {
        say(err.message === 'insecure-context'
          ? 'Authenticator codes need HTTPS. Open the site over https:// rather than as a local file.'
          : 'Could not check that code.', true);
      });
    });

    ['#gate-pass', '#gate-code'].forEach(function (sel) {
      gate.querySelector(sel).addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') { return; }
        gate.querySelector(sel === '#gate-pass' ? '[data-act="pass"]' : '[data-act="verify"]').click();
      });
    });

    if (hasGoogle) {
      steps.google.innerHTML = '<div id="gate-google"></div>' +
        '<p class="gate__hint">Sign in as ' + AUTH.ALLOWED_EMAILS.join(' or ') + '</p>';
      show('google');

      var script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onerror = function () { say('Could not reach Google sign-in. Check your connection.', true); };
      script.onload = function () {
        window.google.accounts.id.initialize({
          client_id: AUTH.GOOGLE_CLIENT_ID,
          callback: function (response) {
            var claims = decodeJwt(response.credential);
            if (!claims || !claims.email) { return say('Google did not return an account.', true); }
            var allowed = AUTH.ALLOWED_EMAILS.some(function (e) {
              return e.toLowerCase() === String(claims.email).toLowerCase();
            });
            if (!allowed || claims.email_verified === false) {
              return say(claims.email + ' is not allowed to open this workbook.', true);
            }
            say('');
            next('google');
          }
        });
        window.google.accounts.id.renderButton(document.getElementById('gate-google'),
          { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill', width: 260 });
      };
      document.head.appendChild(script);
    } else if (hasPass) {
      show('pass');
    } else {
      show('totp');
      if (!totpSecretLooksValid(AUTH.TOTP_SECRET)) { badTotpWarning(); }
    }
  }

  /* --------------------------------------------------- enrolment (setup helper) */
  function showSetup() {
    var box = el(
      '<div class="gate">' +
        '<div class="gate__card gate__card--wide">' +
          '<h1>Lock the workbook</h1>' +
          '<p class="gate__sub">Pick one. Both edit the same file: <code>assets/js/admin-auth.js</code></p>' +

          '<div class="setup-block">' +
            '<h2>A. Passphrase <span class="setup-tag">easiest</span></h2>' +
            '<p>Type a phrase you do not use anywhere else. The phrase itself is never stored &mdash; ' +
              'only a salted hash, which cannot be turned back into it.</p>' +
            '<div class="setup-row">' +
              '<input id="setup-pass" class="gate__pass" type="text" placeholder="charcoal-lemoore-0530">' +
              '<button class="btn btn--sm" type="button" data-act="make">Generate</button>' +
            '</div>' +
            '<pre id="setup-out" class="setup-out" hidden></pre>' +
            '<p class="gate__hint"><strong>Do not use your email password.</strong> This file is public ' +
              'on GitHub, and a hash of a real password is still worth attacking.</p>' +
          '</div>' +

          '<div class="setup-block">' +
            '<h2>B. Sign in with Google <span class="setup-tag setup-tag--gold">recommended</span></h2>' +
            '<p>Your Gmail and password, checked by Google itself. Nothing sensitive touches this page.</p>' +
            '<ol class="numbered" style="text-align:left">' +
              '<li>Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud Console &rarr; Credentials</a>.</li>' +
              '<li><strong>Create credentials &rarr; OAuth client ID &rarr; Web application.</strong></li>' +
              '<li>Under <strong>Authorised JavaScript origins</strong> add <code>https://teriboy.com</code>.</li>' +
              '<li>Copy the client ID into <code>AUTH.GOOGLE_CLIENT_ID</code> and reload this page.</li>' +
            '</ol>' +
          '</div>' +

          '<div class="notice notice--red" style="text-align:left;margin:1.4rem 0">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
            '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01" stroke-linecap="round"/></svg>' +
            '<div><strong>Either way, this is a deterrent</strong>' +
            'The checks run in the browser and can be bypassed by anyone who reads this file. Before you ' +
            'handle real customer data, put the page behind Cloudflare Access &mdash; see README.md.</div>' +
          '</div>' +

          '<button class="btn" type="button" data-act="close">Done</button>' +
        '</div>' +
      '</div>');

    document.body.appendChild(box);

    box.querySelector('[data-act="make"]').addEventListener('click', function () {
      var phrase = box.querySelector('#setup-pass').value.trim();
      var out = box.querySelector('#setup-out');
      out.hidden = false;
      if (phrase.length < 8) {
        out.textContent = 'Use at least 8 characters.';
        return;
      }
      var salt = randomHex(8);
      out.textContent =
        "PASSPHRASE_SALT: '" + salt + "'," + '\n' +
        "PASSPHRASE_SHA256: '" + hashPassphrase(salt, phrase) + "',";
    });

    box.querySelector('[data-act="close"]').addEventListener('click', function () { box.remove(); });
  }

  function buildBanner() {
    var bar = el(
      '<div class="gate-banner">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
        '<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0" /></svg>' +
        '<span>This workbook is <strong>not locked yet</strong>. Anyone who opens this page can read the books.</span>' +
        '<button class="btn btn--sm" type="button" data-act="setup">Set up the lock</button>' +
      '</div>');
    var sheet = document.querySelector('.sheet');
    if (sheet) { sheet.insertBefore(bar, sheet.firstChild); }
    bar.querySelector('[data-act="setup"]').addEventListener('click', showSetup);
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!configured) { return buildBanner(); }
    if (unlockedRecently()) { return; }
    buildGate();
  });
})();
