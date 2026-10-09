/* ============================================================
 * pages/login.js — halaman PIN (FR-001 / ui-spec P1)
 * Mendukung first-run: bila belum ada PIN, tampilkan form "Buat PIN".
 * ============================================================ */
(function () {
  "use strict";
  var ui = App.ui;

  App.registerPage("login", {
    title: "Masuk",
    render: function (root) {
      root.innerHTML =
        '<div class="login-page">' +
          '<div class="login-card">' +
            '<div class="login-brand">' +
              '<span class="brand-mark" aria-hidden="true">N</span>' +
              '<span class="login-title" style="font-size:20px">Entry Nilai</span>' +
            "</div>" +
            '<div id="loginBody"><div class="login-title">Memuat…</div></div>' +
          "</div>" +
        "</div>";

      var body = document.getElementById("loginBody");
      App.api.hasPin().then(function (hasPin) {
        body.innerHTML = hasPin ? loginForm(ui) : setupForm(ui);
        bind(hasPin);
      }).catch(function () {
        body.innerHTML = loginForm(ui);
        bind(true);
      });

      function bind(isLogin) {
        var form = document.getElementById("loginForm");
        var btn = document.getElementById("loginBtn");
        var msg = document.getElementById("loginMsg");
        var input = document.getElementById("f_pin");
        var countdownTimer = null;
        input.focus();

        function showErr(text) { msg.innerHTML = ui.banner("error", "", ui.esc(text)); }

        function lockButton(seconds) {
          if (countdownTimer) clearInterval(countdownTimer);
          var left = seconds;
          btn.disabled = true;
          var tick = function () {
            btn.textContent = "Tunggu " + left + " dtk";
            if (left <= 0) {
              clearInterval(countdownTimer); countdownTimer = null;
              btn.disabled = false; btn.textContent = isLogin ? "Masuk" : "Buat PIN & Masuk";
            }
            left--;
          };
          tick();
          countdownTimer = setInterval(tick, 1000);
        }

        form.addEventListener("submit", function (e) {
          e.preventDefault();
          msg.innerHTML = "";
          var pin = input.value.trim();

          if (!App.auth.pinValid(pin)) {
            showErr("PIN harus 4–8 digit angka.");
            input.setAttribute("aria-invalid", "true"); input.focus(); return;
          }
          if (!isLogin) {
            var confirm = document.getElementById("f_pin2");
            if (!confirm || confirm.value.trim() !== pin) {
              showErr("Konfirmasi PIN tidak sama.");
              if (confirm) confirm.focus(); return;
            }
          }
          input.removeAttribute("aria-invalid");

          ui.busy(btn, true, isLogin ? "Memeriksa…" : "Menyimpan…");
          var task = isLogin ? App.auth.login(pin) : App.auth.setupPin(pin);
          task.then(function () {
            input.value = "";
            ui.busy(btn, false);
            App.ui.toast(isLogin ? "Berhasil masuk." : "PIN dibuat. Selamat datang!", "success");
            if (location.hash === "#/login") location.hash = "#/entry";
            else App.router.render();
          }).catch(function (error) {
            ui.busy(btn, false);
            if (error && error.code === "RATE_LIMITED") {
              showErr(error.message || "Terlalu banyak percobaan.");
              lockButton(error.retryIn || 60);
            } else {
              showErr(ui.friendlyError(error));
              input.setAttribute("aria-invalid", "true");
              input.select();
            }
          });
        });
      }
    }
  });

  function loginForm(ui) {
    return (
      '<div class="login-title">Masuk</div>' +
      '<p class="login-sub">Masukkan PIN untuk melanjutkan.</p>' +
      '<div id="loginMsg"></div>' +
      '<form id="loginForm" novalidate>' +
        ui.field({
          label: "PIN", name: "pin", type: "password", inputClass: "pin-input",
          required: true, maxLength: 8, inputmode: "numeric", autocomplete: "off",
          placeholder: "••••", hint: "4–8 digit angka"
        }) +
        '<div class="form-actions">' +
          '<button class="btn btn-primary btn-lg btn-block" id="loginBtn" type="submit">Masuk</button>' +
        "</div>" +
      "</form>" +
      '<div class="login-foot">Data tersinkron antar perangkat melalui Turso.</div>'
    );
  }

  function setupForm(ui) {
    return (
      '<div class="login-title">Buat PIN</div>' +
      '<p class="login-sub">Ini pertama kalinya. Buat PIN untuk mengamankan aplikasi.</p>' +
      '<div id="loginMsg"></div>' +
      '<form id="loginForm" novalidate>' +
        ui.field({
          label: "PIN baru", name: "pin", type: "password", inputClass: "pin-input",
          required: true, maxLength: 8, inputmode: "numeric", autocomplete: "new-password",
          placeholder: "••••", hint: "4–8 digit angka"
        }) +
        ui.field({
          label: "Ulangi PIN", name: "pin2", type: "password", inputClass: "pin-input",
          required: true, maxLength: 8, inputmode: "numeric", autocomplete: "new-password",
          placeholder: "••••"
        }) +
        '<div class="form-actions">' +
          '<button class="btn btn-primary btn-lg btn-block" id="loginBtn" type="submit">Buat PIN &amp; Masuk</button>' +
        "</div>" +
      "</form>"
    );
  }
})();
