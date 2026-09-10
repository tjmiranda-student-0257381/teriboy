/* ==========================================================================
   TERIBOY BOOKS - admin-auth.js
   A sign-in gate for the workbook: Google account + Google Authenticator.

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
     CONFIGURATION - fill these in to switch the lock on
     ========================================================================== */
  var AUTH = {

    // From Google Cloud Console > APIs and Services > Credentials >
    // OAuth 2.0 Client ID (type: Web application). Add https://teriboy.com to
    // "Authorised JavaScript origins". Looks like: 1234-abcd.apps.googleusercontent.com
    GOOGLE_CLIENT_ID: '',

    // Only these Google accounts may open the workbook.
    ALLOWED_EMAILS: ['miranda.tracyjon.n@gmail.com'],

    // Base32 secret shared with Google Authenticator. Use the "Set up" button
    // in the workbook to generate one, scan or type it into the app, then
    // paste it here. Leave blank to skip the 6-digit step.
    TOTP_SECRET: '714316',

    // How long an unlock lasts before it asks again.
    SESSION_HOURS: 8
  };

  var KEY = 'teriboy.books.unlocked';
  var configured = !!(AUTH.GOOGLE_CLIENT_ID || AUTH.TOTP_SECRET);

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

  /* ------------------------------------------------------------ TOTP (RFC 6238) */
  var B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  function base32Decode(str) {
    var clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
    var bits = 0, value = 0, out = [];
    for (var i = 0; i < clean.length; i++) {
      value = (value << 5) | B32.indexOf(clean[i]);
      bits += 5;
      if (bits >= 8) {
        out.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return new Uint8Array(out);
  }

  function base32Encode(bytes) {
    var bits = 0, value = 0, out = '';
    for (var i = 0; i < bytes.length; i++) {
      value = (value << 8) | bytes[i];
      bits += 8;
      while (bits >= 5) {
        out += B32[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) { out += B32[(value << (5 - bits)) & 31]; }
    return out;
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
        var off = b[b.length - 1] & 0x0f;
        var code = ((b[off] & 0x7f) << 24 | b[off + 1] << 16 | b[off + 2] << 8 | b[off + 3]) % 1000000;
        return String(code).padStart(6, '0');
      });
  }

  // Accept the previous, current and next window - phones drift.
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
          '<p class="gate__sub">This workbook is locked. Sign in to continue.</p>' +
          '<div class="gate__step" data-step="google"></div>' +
          '<div class="gate__step" data-step="totp" hidden>' +
            '<label for="gate-code">6-digit code from Google Authenticator</label>' +
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

    var googleStep = gate.querySelector('[data-step="google"]');
    var totpStep = gate.querySelector('[data-step="totp"]');

    function toTotpOrDone() {
      if (!AUTH.TOTP_SECRET) { return unlock(); }
      googleStep.hidden = true;
      totpStep.hidden = false;
      var input = gate.querySelector('#gate-code');
      input.focus();
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { gate.querySelector('[data-act="verify"]').click(); }
      });
    }

    function unlock() {
      rememberUnlock();
      document.documentElement.classList.remove('locked');
      gate.remove();
    }

    gate.querySelector('[data-act="verify"]').addEventListener('click', function () {
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

    if (AUTH.GOOGLE_CLIENT_ID) {
      googleStep.innerHTML = '<div id="gate-google"></div>' +
        '<p class="gate__hint">Use ' + AUTH.ALLOWED_EMAILS.join(' or ') + '</p>';

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
            toTotpOrDone();
          }
        });
        window.google.accounts.id.renderButton(document.getElementById('gate-google'),
          { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill', width: 260 });
      };
      document.head.appendChild(script);
    } else {
      // TOTP only.
      googleStep.hidden = true;
      totpStep.hidden = false;
      gate.querySelector('#gate-code').focus();
    }
  }

  /* --------------------------------------------------- enrolment (setup helper) */
  function generateSecret() {
    var bytes = new Uint8Array(20);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return base32Encode(bytes);
  }

  function showSetup() {
    var secret = generateSecret();
    var account = AUTH.ALLOWED_EMAILS[0] || 'admin';
    var uri = 'otpauth://totp/' + encodeURIComponent('Teriboy Books:' + account) +
              '?secret=' + secret + '&issuer=Teriboy';

    var box = el(
      '<div class="gate">' +
        '<div class="gate__card gate__card--wide">' +
          '<h1>Set up Google Authenticator</h1>' +
          '<ol class="numbered" style="text-align:left;margin:1.2rem 0">' +
            '<li>Open <strong>Google Authenticator</strong> and choose <strong>Enter a setup key</strong>.</li>' +
            '<li>Account name: <strong>Teriboy Books</strong>. Key: the code below. Type: <strong>Time based</strong>.</li>' +
            '<li>Paste the same key into <code>AUTH.TOTP_SECRET</code> in <code>assets/js/admin-auth.js</code>.</li>' +
            '<li>Reload this page. It will ask for a 6-digit code from then on.</li>' +
          '</ol>' +
          '<p class="gate__secret">' + secret + '</p>' +
          '<p class="gate__hint" style="word-break:break-all">' + uri + '</p>' +
          '<div class="notice notice--red" style="text-align:left;margin:1.2rem 0">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
            '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01" stroke-linecap="round"/></svg>' +
            '<div><strong>Your repository is public</strong>' +
            'Anyone who reads admin-auth.js on GitHub can see this key and generate the same codes. ' +
            'That is a limit of a static site, not a mistake you made &mdash; see README.md for the ' +
            'Cloudflare Access route, which keeps the secret off the page entirely.</div>' +
          '</div>' +
          '<button class="btn" type="button" data-act="close">Done</button>' +
        '</div>' +
      '</div>');

    document.body.appendChild(box);
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
