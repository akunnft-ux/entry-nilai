/* ============================================================
 * pages/pengaturan.js — master konfig, keamanan PIN, log audit
 * FR-007 (konfig), FR-008 (ganti PIN), FR-009 (log) · ui-spec P5
 * ============================================================ */
(function () {
  "use strict";
  var ui = App.ui;

  var TABS = [
    { id: "kelas", label: "Kelas" },
    { id: "jenis", label: "Jenis & Kode" },
    { id: "keamanan", label: "Keamanan" },
    { id: "log", label: "Log" }
  ];

  App.registerPage("pengaturan", {
    title: "Pengaturan",
    render: function (root) {
      root.innerHTML =
        '<div class="page-head">' +
          "<div><h1>Pengaturan</h1><p>Master kelas & penilaian, keamanan PIN, dan jejak perubahan.</p></div>" +
        "</div>" +
        '<div class="tabs" role="tablist" id="setTabs">' +
          TABS.map(function (t, i) {
            return '<button class="tab" role="tab" type="button" data-tab="' + t.id + '" ' +
              'id="tab_' + t.id + '" aria-controls="panel_set" aria-selected="' + (i === 0) + '">' + t.label + "</button>";
          }).join("") +
        "</div>" +
        '<div id="panel_set" role="tabpanel" tabindex="0" aria-labelledby="tab_kelas"></div>';

      var panel = document.getElementById("panel_set");
      var tabsBar = document.getElementById("setTabs");
      var active = "kelas";
      var konfig = [];

      /* ---------------- data konfig ---------------- */
      function loadKonfig(force) {
        if (!force) {
          var cached = App.store.getKonfig();
          if (cached) { konfig = cached; return Promise.resolve(cached); }
        }
        return App.api.call("konfig.list", {}).then(function (d) {
          konfig = (d && d.entries) || [];
          App.store.setKonfig(konfig);
          return konfig;
        });
      }

      function entriesOf(group) {
        return konfig.filter(function (e) { return e.group === group; })
          .sort(function (a, b) { return (a.urut || 0) - (b.urut || 0) || String(a.key).localeCompare(String(b.key)); });
      }

      /* refresh dipakai setelah MUTASI → wajib fresh (skip cache lokal & server) */
      function refresh() {
        App.store.clearKonfig();
        App.store.clearMeta();   /* agar dropdown Entry/Rekap ikut segar */
        return loadKonfig(true).then(function () { render(); });
      }

      function handleError(e, targetId) {
        var box = document.getElementById(targetId || "setBanner");
        if (box) box.innerHTML = ui.banner("error", "Gagal", ui.esc(ui.friendlyError(e)));
      }

      /* ---------------- panel: kelas ---------------- */
      function renderKelas() {
        var items = entriesOf("kelas");
        panel.innerHTML =
          '<div id="setBanner"></div>' +
          '<div class="siswa-layout">' +
            '<div class="card">' +
              '<div class="card-head"><span class="card-title">Tambah kelas</span></div>' +
              '<div class="card-body">' +
                '<form id="formKelas" novalidate>' +
                  ui.field({ label: "Nama kelas", name: "kelas", required: true,
                    placeholder: "mis. 7A", maxLength: 40 }) +
                  '<div id="kelasErr"></div>' +
                  '<div class="form-actions"><button class="btn btn-primary" type="submit" id="btnKelas">Tambah</button></div>' +
                "</form>" +
              "</div>" +
            "</div>" +
            '<div class="card">' +
              '<div class="card-head"><span class="card-title">Daftar kelas</span>' +
                '<span class="muted" style="font-size:12px">' + items.length + " entri</span></div>" +
              (items.length ? '<div class="konfig-list">' + items.map(konfigRow).join("") + "</div>" :
                ui.emptyState({ title: "Belum ada kelas", body: "Tambahkan kelas pertama lewat form di samping." })) +
            "</div>" +
          "</div>";

        bindKonfigForm("formKelas", "kelasErr", "kelas", "btnKelas");
        bindKonfigActions();
      }

      /* ---------------- panel: jenis & kode ---------------- */
      function renderJenis() {
        var jenis = entriesOf("jenis");
        var kode = entriesOf("kode");

        var kodeHtml = kode.length
          ? '<div class="konfig-list">' + kode.map(function (k) { return konfigRow(k, true); }).join("") + "</div>"
          : ui.emptyState({ title: "Belum ada kode penilaian",
              body: "Buat kode seperti \"UH-1\" agar nilai bisa di-entry per pekan/ujian." });

        panel.innerHTML =
          '<div id="setBanner"></div>' +
          '<div class="siswa-layout">' +
            '<div class="stack">' +
              '<div class="card">' +
                '<div class="card-head"><span class="card-title">Tambah jenis penilaian</span></div>' +
                '<div class="card-body">' +
                  '<form id="formJenis" novalidate>' +
                    ui.field({ label: "Nama jenis", name: "label", required: true,
                      placeholder: "mis. Proyek", maxLength: 40,
                      hint: "Kunci otomatis dibuat dari nama (huruf besar)." }) +
                    '<div id="jenisErr"></div>' +
                    '<div class="form-actions"><button class="btn btn-primary" type="submit" id="btnJenis">Tambah</button></div>' +
                  "</form>" +
                "</div>" +
              "</div>" +
              '<div class="card">' +
                '<div class="card-head"><span class="card-title">Tambah kode penilaian</span></div>' +
                '<div class="card-body">' +
                  '<form id="formKode" novalidate>' +
                    ui.field({ label: "Jenis", name: "parent", type: "select", required: true,
                      options: jenis.map(function (j) { return { value: j.key, label: j.label || j.key }; }) }) +
                    ui.field({ label: "Kode", name: "key", required: true,
                      placeholder: "mis. UH-1", maxLength: 24,
                      hint: "Dipakai sebagai nama kolom di rekap." }) +
                    ui.field({ label: "Keterangan", name: "label", placeholder: "mis. Ulangan Harian ke-1", maxLength: 40 }) +
                    '<div id="kodeErr"></div>' +
                    '<div class="form-actions"><button class="btn btn-primary" type="submit" id="btnKode">Tambah</button></div>' +
                  "</form>" +
                "</div>" +
              "</div>" +
            "</div>" +
            '<div class="stack">' +
              '<div class="card">' +
                '<div class="card-head"><span class="card-title">Jenis penilaian</span>' +
                  '<span class="muted" style="font-size:12px">' + jenis.length + " entri</span></div>" +
                (jenis.length ? '<div class="konfig-list">' + jenis.map(konfigRow).join("") + "</div>" :
                  ui.emptyState({ title: "Belum ada jenis", body: "Tambahkan jenis penilaian." })) +
              "</div>" +
              '<div class="card">' +
                '<div class="card-head"><span class="card-title">Kode penilaian</span>' +
                  '<span class="muted" style="font-size:12px">' + kode.length + " entri</span></div>" +
                kodeHtml +
              "</div>" +
            "</div>" +
          "</div>";

        bindKonfigForm("formJenis", "jenisErr", "jenis", "btnJenis", function (values) {
          var key = String(values.label || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
          if (!key) return { error: "Nama jenis tidak valid." };
          return { entry: { group: "jenis", key: key, label: values.label } };
        });
        bindKonfigForm("formKode", "kodeErr", "kode", "btnKode", function (values) {
          var key = String(values.key || "").trim().toUpperCase();
          if (!key) return { error: "Kode wajib diisi." };
          if (!values.parent) return { error: "Jenis wajib dipilih." };
          return { entry: { group: "kode", key: key, label: values.label || key, parent: values.parent } };
        });
        bindKonfigActions();
      }

      /* ---------------- panel: keamanan ---------------- */
      function renderKeamanan() {
        panel.innerHTML =
          '<div id="setBanner"></div>' +
          '<div class="card" style="max-width:520px">' +
            '<div class="card-head"><span class="card-title">Ganti PIN</span></div>' +
            '<div class="card-body">' +
              ui.banner("info", "Catatan keamanan",
                "PIN disimpan sebagai <em>hash</em> (SHA-256) di Script Properties Google — tidak pernah dalam bentuk teks biasa, dan tidak ada di repo ini.") +
              '<form id="formPin" novalidate>' +
                ui.field({ label: "PIN lama", name: "oldPin", type: "password", required: true,
                  inputmode: "numeric", maxLength: 8 }) +
                ui.field({ label: "PIN baru", name: "newPin", type: "password", required: true,
                  inputmode: "numeric", maxLength: 8, hint: "4–8 digit angka" }) +
                ui.field({ label: "Ulangi PIN baru", name: "confirmPin", type: "password", required: true,
                  inputmode: "numeric", maxLength: 8 }) +
                '<div id="pinErr"></div>' +
                '<div class="form-actions">' +
                  '<button class="btn btn-primary" type="submit" id="btnPin">Simpan PIN baru</button>' +
                "</div>" +
              "</form>" +
              '<hr class="divider">' +
              '<div class="stack" style="font-size:14px">' +
                '<div class="row-between"><span class="muted">Nama aplikasi</span><span>' + ui.esc(App.config.APP_NAME) + "</span></div>" +
                '<div class="row-between"><span class="muted">Versi frontend</span><span class="num">' + ui.esc(App.config.VERSION) + "</span></div>" +
                '<div class="row-between"><span class="muted">URL backend</span><span class="muted" style="font-size:12px">' +
                  ui.esc(App.config.TURSO_URL ? "terhubung" : "belum diatur") + "</span></div>" +
              "</div>" +
            "</div>" +
          "</div>";

        document.getElementById("formPin").addEventListener("submit", function (e) {
          e.preventDefault();
          var box = document.getElementById("pinErr");
          box.innerHTML = "";
          var oldPin = document.getElementById("f_oldPin").value;
          var newPin = document.getElementById("f_newPin").value;
          var conf = document.getElementById("f_confirmPin").value;

          if (newPin !== conf) {
            box.innerHTML = ui.banner("error", "", "Konfirmasi PIN baru tidak sama.");
            return;
          }
          var btn = document.getElementById("btnPin");
          ui.busy(btn, true, "Menyimpan…");
          App.auth.changePin(oldPin, newPin).then(function () {
            ui.busy(btn, false);
            ui.toast("PIN berhasil diganti.", "success");
            e.target.reset();
            box.innerHTML = ui.banner("success", "Berhasil", "PIN baru sudah aktif.");
          }).catch(function (err) {
            ui.busy(btn, false);
            box.innerHTML = ui.banner("error", "Gagal mengganti PIN", ui.esc(ui.friendlyError(err)));
          });
        });
      }

      /* ---------------- panel: log ---------------- */
      function renderLog() {
        panel.innerHTML =
          '<div id="setBanner"></div>' +
          '<div class="card">' +
            '<div class="card-head"><span class="card-title">Log aktivitas</span>' +
              '<button class="btn btn-secondary btn-sm" id="btnLogReload" type="button">Muat ulang</button></div>' +
            '<div id="logBody">' + ui.skeleton(8, [130, 90, 90, 160, 160]) + "</div>" +
          "</div>";

        function load() {
          var body = document.getElementById("logBody");
          App.api.call("log.list", { limit: 200 }).then(function (d) {
            var rows = (d && d.entries) || [];
            if (!rows.length) {
              body.innerHTML = ui.emptyState({
                title: "Belum ada aktivitas",
                body: "Setiap perubahan nilai, siswa, dan konfigurasi akan tercatat di sini."
              });
              return;
            }
            body.innerHTML = ui.table({
              tableClass: "log-table",
              cols: [
                { key: "ts", label: "Waktu", width: "150px" },
                { key: "action", label: "Aksi", width: "110px" },
                { key: "entity", label: "Entitas", width: "110px" },
                { key: "entity_id", label: "ID" },
                { key: "before", label: "Sebelum", cls: "before-after" },
                { key: "after", label: "Sesudah", cls: "before-after" }
              ],
              rows: rows.map(function (r) {
                return {
                  data: {
                    ts: '<span class="num">' + ui.esc(fmtTs(r.ts)) + "</span>",
                    action: ui.esc(r.action),
                    entity: ui.esc(r.entity),
                    entity_id: ui.esc(r.entity_id),
                    before: '<span title="' + ui.esc(r.before) + '">' + ui.esc(trunc(r.before)) + "</span>",
                    after: '<span title="' + ui.esc(r.after) + '">' + ui.esc(trunc(r.after)) + "</span>"
                  }
                };
              }),
              empty: { title: "Belum ada aktivitas" }
            });
          }).catch(function (e) {
            body.innerHTML = ui.banner("error", "Gagal memuat log", ui.esc(ui.friendlyError(e)));
          });
        }

        document.getElementById("btnLogReload").addEventListener("click", load);
        load();
      }

      function trunc(s) {
        s = s === null || s === undefined ? "" : String(s);
        return s.length > 60 ? s.slice(0, 57) + "…" : (s || "—");
      }
      function fmtTs(iso) {
        try {
          var d = new Date(iso);
          if (isNaN(d.getTime())) return String(iso);
          var p = function (n) { return String(n).padStart(2, "0"); };
          return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear() + " " +
            p(d.getHours()) + ":" + p(d.getMinutes());
        } catch (e) { return String(iso); }
      }

      /* ---------------- shared konfig row ---------------- */
      function konfigRow(entry, showParent) {
        var off = entry.aktif === false;
        return '<div class="konfig-item' + (off ? " is-off" : "") + '" data-key="' + ui.esc(entry.key) + '" data-group="' + ui.esc(entry.group) + '">' +
          "<div>" +
            '<div class="konfig-key">' + ui.esc(entry.key) +
              (off ? ' <span class="badge badge-off">nonaktif</span>' : "") + "</div>" +
            '<div class="konfig-label">' + ui.esc(entry.label || "") +
              (showParent && entry.parent ? " · jenis " + ui.esc(entry.parent) : "") + "</div>" +
          "</div>" +
          '<div class="konfig-actions">' +
            (off ? "" :
              '<button class="btn btn-ghost btn-sm" data-kact="deactivate" type="button">Nonaktifkan</button>' +
              '<button class="btn btn-danger-ghost btn-sm" data-kact="remove" type="button">Hapus</button>') +
          "</div>" +
        "</div>";
      }

      function bindKonfigForm(formId, errId, group, btnId, transform) {
        var f = document.getElementById(formId);
        if (!f) return;
        f.addEventListener("submit", function (e) {
          e.preventDefault();
          var errBox = document.getElementById(errId);
          errBox.innerHTML = "";

          var values = {};
          Array.prototype.forEach.call(f.elements, function (el) {
            if (el.name) values[el.name] = el.value;
          });

          var entry;
          if (transform) {
            var res = transform(values);
            if (res.error) { errBox.innerHTML = ui.banner("error", "", ui.esc(res.error)); return; }
            entry = res.entry;
          } else {
            var key = String(values[group] || "").trim();
            if (!key) { errBox.innerHTML = ui.banner("error", "", "Nama wajib diisi."); return; }
            entry = { group: group, key: key, label: key };
          }

          var btn = document.getElementById(btnId);
          ui.busy(btn, true, "Menyimpan…");
          App.api.call("konfig.save", { entries: [entry] }).then(function () {
            ui.busy(btn, false);
            ui.toast("Entri ditambahkan.", "success");
            f.reset();
            refresh();
          }).catch(function (err) {
            ui.busy(btn, false);
            errBox.innerHTML = ui.banner("error", "Gagal", ui.esc(ui.friendlyError(err)));
          });
        });
      }

      function bindKonfigActions() {
        var list = panel.querySelector(".konfig-list");
        if (!list) return;
        list.addEventListener("click", function (e) {
          var btn = e.target.closest ? e.target.closest("button[data-kact]") : null;
          if (!btn) return;
          var item = btn.closest(".konfig-item");
          var group = item.getAttribute("data-group");
          var key = item.getAttribute("data-key");
          var act = btn.getAttribute("data-kact");

          if (act === "deactivate") {
            ui.confirm({
              title: "Nonaktifkan entri?",
              body: "\"" + key + "\" tidak lagi muncul di pilihan baru, tetapi data lama tetap utuh.",
              okLabel: "Nonaktifkan"
            }).then(function (ok) {
              if (!ok) return;
              App.api.call("konfig.deactivate", { group: group, key: key })
                .then(function () { ui.toast("Entri dinonaktifkan.", "success"); refresh(); })
                .catch(function (err) { handleError(err); });
            });
            return;
          }

          if (act === "remove") {
            ui.confirm({
              title: "Hapus entri?",
              body: "\"" + key + "\" akan dihapus permanen.",
              okLabel: "Hapus",
              danger: true
            }).then(function (ok) {
              if (!ok) return;
              App.api.call("konfig.remove", { group: group, key: key })
                .then(function () { ui.toast("Entri dihapus.", "success"); refresh(); })
                .catch(function (err) {
                  if (err && err.code === "CONFIG_IN_USE") {
                    ui.confirm({
                      title: "Sudah dipakai data",
                      body: "\"" + key + "\" sudah dipakai (" + (err.details || "ada nilai terkait") +
                        "). Entri tidak bisa dihapus — nonaktifkan saja agar data lama tetap utuh.",
                      okLabel: "Nonaktifkan"
                    }).then(function (doIt) {
                      if (!doIt) return;
                      App.api.call("konfig.deactivate", { group: group, key: key })
                        .then(function () { ui.toast("Entri dinonaktifkan.", "success"); refresh(); })
                        .catch(function (e2) { handleError(e2); });
                    });
                  } else {
                    handleError(err);
                  }
                });
            });
          }
        });
      }

      /* ---------------- tabs ---------------- */
      function render() {
        if (active === "kelas") renderKelas();
        else if (active === "jenis") renderJenis();
        else if (active === "keamanan") renderKeamanan();
        else renderLog();

        Array.prototype.forEach.call(tabsBar.querySelectorAll(".tab"), function (t) {
          t.setAttribute("aria-selected", String(t.getAttribute("data-tab") === active));
        });
        panel.setAttribute("aria-labelledby", "tab_" + active);
      }

      tabsBar.addEventListener("click", function (e) {
        var t = e.target.closest ? e.target.closest(".tab") : null;
        if (!t) return;
        active = t.getAttribute("data-tab");
        render();
      });

      tabsBar.addEventListener("keydown", function (e) {
        var idx = TABS.map(function (t) { return t.id; }).indexOf(active);
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          idx = (idx + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
          active = TABS[idx].id;
          render();
          document.getElementById("tab_" + active).focus();
        }
      });

      /* ---------------- boot ---------------- */
      panel.innerHTML = ui.skeleton(6, [200, 120, 120]);
      loadKonfig().then(render).catch(function (e) {
        if (e && e.code === "INVALID_TOKEN") return;
        panel.innerHTML = ui.banner("error", "Gagal memuat konfigurasi", ui.esc(ui.friendlyError(e)),
          '<button class="btn btn-secondary btn-sm" id="setRetry" type="button">Coba lagi</button>');
        var b = document.getElementById("setRetry");
        if (b) b.addEventListener("click", function () {
          panel.innerHTML = ui.skeleton(6, [200, 120, 120]);
          loadKonfig().then(render).catch(function (e2) { handleError(e2, "panel_set"); });
        });
      });
    }
  });
})();
