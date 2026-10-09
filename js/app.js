/* ============================================================
 * app.js — bootstrap, hash router, route guard, header.
 * Aturan: tidak ada logika bisnis di sini (hanya navigasi & shell).
 * ============================================================ */
window.App = window.App || {};

App.state = { dirty: false, ready: false };

(function () {
  "use strict";

  var view, header, nav, connBadge, logoutBtn;

  function currentRoute() {
    var h = location.hash || "";
    h = h.replace(/^#\/?/, "");
    return h.split("?")[0].split("/")[0];
  }

  function setHash(hash) {
    if (location.hash !== hash) location.hash = hash;
  }

  function setActiveNav(route) {
    var links = nav ? nav.querySelectorAll(".nav-link") : [];
    for (var i = 0; i < links.length; i++) {
      var match = links[i].getAttribute("data-route") === route;
      if (match) links[i].setAttribute("aria-current", "page");
      else links[i].removeAttribute("aria-current");
    }
  }

  function renderError(message) {
    view.innerHTML = '<div class="wrap"><div class="card card-pad">' +
      App.ui.banner("error", "Terjadi kesalahan", App.ui.esc(message)) +
      '<div class="row"><button class="btn btn-secondary" id="retryBtn" type="button">Coba lagi</button></div>' +
      "</div></div>";
    var b = document.getElementById("retryBtn");
    if (b) b.addEventListener("click", route);
  }

  function render() {
    var route = currentRoute();
    var loggedIn = App.auth.isLoggedIn();

    /* ---- guards ---- */
    if (route === "login") {
      if (loggedIn) { setHash("#/entry"); return; }
      header.hidden = true;
      setActiveNav("");
    } else {
      if (!loggedIn) { setHash("#/login"); return; }
      header.hidden = false;
      setActiveNav(route);
    }

    var page = App._pages[route];
    if (!page) {
      if (route !== "login") {
        renderError("Halaman tidak ditemukan: " + route);
        return;
      }
      page = App._pages.login;
    }
    if (!page) { renderError("Halaman belum tersedia."); return; }

    App.state.dirty = false;
    document.title = (page.title ? page.title + " · " : "") + App.config.APP_NAME;
    view.innerHTML = "";

    try {
      var result = page.render(view, {});
      if (result && typeof result.catch === "function") {
        result.catch(function (e) {
          renderError(App.ui.friendlyError(e));
        });
      }
    } catch (e) {
      renderError(App.ui.friendlyError(e));
    }

    view.focus({ preventScroll: true });
  }

  /* ---------------- koneksi ---------------- */
  function setConn(state, text) {
    if (!connBadge) return;
    connBadge.setAttribute("data-state", state);
    var t = connBadge.querySelector(".conn-text");
    if (t) t.textContent = text;
  }

  function checkConn(showToast) {
    if (!App.api.configured()) {
      setConn("offline", "Belum terhubung");
      return Promise.resolve(false);
    }
    setConn("unknown", "…");
    return App.api.ping().then(function (data) {
      var ok = data && data.sheetOk !== false;
      setConn(ok ? "online" : "offline", ok ? "Terhubung" : "Database siap");
      if (!ok) {
        App.ui.toast("Terhubung ke database, tetapi skema belum siap.", "warn");
      }
      if (data && data.pinConfigured === false && currentRoute() !== "login") {
        App.ui.toast("PIN belum dikonfigurasi.", "warn");
      }
      return ok;
    }).catch(function (e) {
      setConn("offline", "Terputus");
      if (showToast) App.ui.toast(App.ui.friendlyError(e), "error");
      return false;
    });
  }

  /* ---------------- boot ---------------- */
  function boot() {
    view = document.getElementById("view");
    header = document.getElementById("appHeader");
    nav = document.getElementById("mainNav");
    connBadge = document.getElementById("connBadge");
    logoutBtn = document.getElementById("logoutBtn");

    if (!App.api.configured()) {
      renderSetupWizard();
      return;
    }

    logoutBtn.addEventListener("click", function () {
      App.auth.logout().then(function () {
        App.ui.toast("Anda telah keluar.", "info");
      });
    });

    window.addEventListener("hashchange", render);
    window.addEventListener("online", function () { checkConn(false); });
    window.addEventListener("offline", function () {
      setConn("offline", "Terputus");
      App.ui.toast("Koneksi terputus — data Anda tetap tersimpan sebagai draft.", "warn");
    });

    window.addEventListener("beforeunload", function (e) {
      if (App.state.dirty) { e.preventDefault(); e.returnValue = ""; return ""; }
    });

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && App.auth.isLoggedIn()) checkConn(false);
    });

    /* Sesi habis di tengah jalan → kembali ke login tanpa hilangkan draft. */
    if (!App.auth.isLoggedIn()) setHash("#/login");

    App.state.ready = true;
    render();
    checkConn(false);

    /* refresh meta berkala agar dropdown selalu up-to-date */
    setInterval(function () {
      if (App.auth.isLoggedIn() && !document.hidden) App.store.clearMeta();
    }, 30 * 60 * 1000);
  }

  /* ---------------- wizard setup (Turso belum diisi) ---------------- */
  function renderSetupWizard() {
    if (header) header.hidden = true;
    document.title = "Setup · " + App.config.APP_NAME;
    view.innerHTML =
      '<div class="login-page"><div class="login-card">' +
        '<div class="login-brand"><span class="brand-mark" aria-hidden="true">N</span>' +
          '<span class="login-title" style="font-size:20px">Entry Nilai</span></div>' +
        '<div class="login-title">Konfigurasi database</div>' +
        '<p class="login-sub">Aplikasi belum terhubung ke database Turso.</p>' +
        App.ui.banner("info", "Isi <code>js/config.js</code>",
          'Set <code>TURSO_URL</code> dan <code>TURSO_TOKEN</code> dengan kredensial database Anda, lalu muat ulang halaman ini.') +
        '<div class="form-actions"><button class="btn btn-primary btn-block" id="retrySetup" type="button">Sudah diisi — coba lagi</button></div>' +
        '<div class="login-foot">Panduan lengkap: <code>docs/deployment.md</code></div>' +
      "</div></div>";

    document.getElementById("retrySetup").addEventListener("click", function () {
      location.reload();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  App.router = { render: render, currentRoute: currentRoute, checkConn: checkConn };
})();
