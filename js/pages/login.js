/* ============================================================
 * pages/login.js — halaman PIN (FR-001 / ui-spec P1)
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
            '<div class="login-title">Masuk</div>' +
            '<p class="login-sub">Masukkan PIN untuk melanjutkan.</p>' +
            '<div id="loginMsg"></div>' +
            '<form id="loginForm" novalidate>' +
              ui.field({
                label: "PIN", name: "pin", type: "password",
                inputClass: "pin-input", required: true,
                maxLength: 8, inputmode: "numeric", autocomplete: "off",
                placeholder: "••••", hint: "4–8 digit angka"
              }) +
              '<div class="form-actions">' +
                '<button class="btn btn-primary btn-lg btn-block" id="loginBtn" type="submit">Masuk</button>' +
              "</div>" +
            "</form>" +
            '<div class="login-foot">Belum ada PIN? Lihat panduan setup di <code>docs/deployment.md</code>.</div>' +
          "</div>" +
        "</div>";

      var form = document.getElementById("loginForm");
      var btn = document.getElementById("loginBtn");
      var msg = document.getElementById("loginMsg");
      var input = document.getElementById("f_pin");
      var countdownTimer = null;

      input.focus();

      function showErr(text) {
        msg.innerHTML = ui.banner("error", "", ui.esc(text));
      }

      function lockButton(seconds) {
        if (countdownTimer) clearInterval(countdownTimer);
        var left = seconds;
        btn.disabled = true;
        var tick = function () {
          btn.textContent = "Tunggu " + left + " dtk";
          if (left <= 0) {
            clearInterval(countdownTimer);
            countdownTimer = null;
            btn.disabled = false;
            btn.textContent = "Masuk";
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
          input.setAttribute("aria-invalid", "true");
          input.focus();
          return;
        }
        input.removeAttribute("aria-invalid");

        ui.busy(btn, true, "Memeriksa…");
        App.auth.login(pin).then(function () {
          input.value = "";
          ui.busy(btn, false);
          App.ui.toast("Berhasil masuk.", "success");
          var target = "#/entry";
          if (location.hash === "#/login") location.hash = target;
          else App.router.render();
        }).catch(function (err) {
          ui.busy(btn, false);
          if (err && err.code === "RATE_LIMITED") {
            showErr(err.message || "Terlalu banyak percobaan.");
            lockButton(err.retryIn || 60);
          } else if (err && err.code === "PIN_NOT_CONFIGURED") {
            msg.innerHTML = ui.banner("warn", "PIN belum dikonfigurasi",
              "Jalankan fungsi <code>SETUP_setPin('PIN_ANDA')</code> dari editor Apps Script. Panduan: <code>docs/deployment.md</code>.");
          } else {
            showErr(ui.friendlyError(err));
            input.setAttribute("aria-invalid", "true");
            input.select();
          }
        });
      });
    }
  });
})();
