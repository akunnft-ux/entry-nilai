/* ============================================================
 * pages/siswa.js — master data siswa (FR-002) · ui-spec P4
 * ============================================================ */
(function () {
  "use strict";
  var ui = App.ui;

  App.registerPage("siswa", {
    title: "Siswa",
    render: function (root) {
      root.innerHTML =
        '<div class="page-head">' +
          "<div><h1>Data Siswa</h1><p>Kelola daftar siswa per kelas. Siswa dinonaktifkan tidak dihapus — riwayat nilainya tetap aman.</p></div>" +
        "</div>" +
        '<div id="siswaBanner"></div>' +
        '<div class="siswa-layout">' +
          '<div class="card siswa-form">' +
            '<div class="card-head"><span class="card-title" id="formTitle">Tambah siswa</span></div>' +
            '<div class="card-body">' +
              '<form id="siswaForm" novalidate>' +
                '<input type="hidden" name="id" id="fId" value="">' +
                ui.field({ label: "NIS", name: "nis", hint: "Opsional. Harus unik bila diisi.", maxLength: 32 }) +
                ui.field({ label: "Nama lengkap", name: "nama", required: true, maxLength: 80, placeholder: "Nama siswa" }) +
                ui.field({ label: "Kelas", name: "kelas", type: "select", required: true, options: [] }) +
                ui.field({ label: "Status", name: "status", type: "select", value: "aktif",
                  options: [{ value: "aktif", label: "Aktif" }, { value: "nonaktif", label: "Nonaktif" }] }) +
                '<div id="formError"></div>' +
                '<div class="form-actions">' +
                  '<button class="btn btn-primary" id="btnSave" type="submit">Simpan siswa</button>' +
                  '<button class="btn btn-ghost" id="btnReset" type="button" hidden>Batal</button>' +
                "</div>" +
              "</form>" +
            "</div>" +
          "</div>" +

          '<div class="card">' +
            '<div class="card-head">' +
              '<div class="row grow">' +
                '<div class="search-wrap grow"><label class="visually-hidden" for="sSearch">Cari siswa</label>' +
                  '<input class="input" id="sSearch" type="search" placeholder="Cari nama atau NIS…" autocomplete="off"></div>' +
                '<div class="field" style="margin:0;min-width:130px"><label class="visually-hidden" for="sKelas">Kelas</label>' +
                  '<select class="select" id="sKelas"><option value="">Semua kelas</option></select></div>' +
                '<div class="field" style="margin:0;min-width:120px"><label class="visually-hidden" for="sStatus">Status</label>' +
                  '<select class="select" id="sStatus">' +
                    '<option value="">Semua status</option>' +
                    '<option value="aktif">Aktif</option>' +
                    '<option value="nonaktif">Nonaktif</option>' +
                  "</select></div>" +
              "</div>" +
              '<span class="muted" id="sCount" style="font-size:12px"></span>' +
            "</div>" +
            '<div id="siswaTable"></div>' +
          "</div>" +
        "</div>";

      var form = document.getElementById("siswaForm");
      var formError = document.getElementById("formError");
      var formTitle = document.getElementById("formTitle");
      var btnReset = document.getElementById("btnReset");
      var btnSave = document.getElementById("btnSave");
      var elTable = document.getElementById("siswaTable");
      var elKelasFilter = document.getElementById("sKelas");
      var elStatus = document.getElementById("sStatus");
      var elSearch = document.getElementById("sSearch");
      var elCount = document.getElementById("sCount");
      var elBanner = document.getElementById("siswaBanner");

      var meta = null;
      var all = [];
      var searchTimer = null;

      /* ---------------- helpers ---------------- */
      function kelasOptions(includeAll) {
        var list = ((meta && meta.kelas) || []).filter(function (k) { return k.aktif !== false; });
        var opts = list.map(function (k) { return { value: k.key, label: k.label || k.key }; });
        return includeAll ? [{ value: "", label: "Semua kelas" }].concat(opts) : opts;
      }

      function setKelasSelect(el, withAll) {
        var cur = el.value;
        var html = "";
        if (withAll) html += '<option value="">Semua kelas</option>';
        else html += '<option value="">— pilih —</option>';
        kelasOptions(false).forEach(function (o) {
          html += '<option value="' + ui.esc(o.value) + '">' + ui.esc(o.label) + "</option>";
        });
        el.innerHTML = html;
        if (cur) el.value = cur;
      }

      function loadMeta() {
        var cached = App.store.getMeta();
        if (cached) return Promise.resolve(cached);
        return App.api.call("meta.get", {}).then(function (m) {
          App.store.setMeta(m);
          return m;
        });
      }

      function load() {
        return App.api.call("siswa.list", {}).then(function (data) {
          all = (data && data.siswa) || [];
          renderTable();
        }).catch(function (e) {
          if (e && e.code === "INVALID_TOKEN") return;
          elTable.innerHTML = ui.banner("error", "Gagal memuat siswa", ui.esc(ui.friendlyError(e)),
            '<button class="btn btn-secondary btn-sm" id="swRetry" type="button">Coba lagi</button>');
          var b = document.getElementById("swRetry");
          if (b) b.addEventListener("click", load);
        });
      }

      function filtered() {
        var k = elKelasFilter.value;
        var st = elStatus.value;
        var q = elSearch.value.trim().toLowerCase();
        return all.filter(function (s) {
          if (k && s.kelas !== k) return false;
          if (st && s.status !== st) return false;
          if (q) {
            var hay = (String(s.nama) + " " + String(s.nis || "")).toLowerCase();
            if (hay.indexOf(q) === -1) return false;
          }
          return true;
        }).sort(function (a, b) {
          var c = String(a.kelas).localeCompare(String(b.kelas), "id");
          if (c !== 0) return c;
          return String(a.nama).localeCompare(String(b.nama), "id");
        });
      }

      function renderTable() {
        var rows = filtered();
        elCount.textContent = rows.length + " siswa ditampilkan";

        var body = ui.table({
          cols: [
            { key: "nis", label: "NIS", cls: "num", width: "110px" },
            { key: "nama", label: "Nama" },
            { key: "kelas", label: "Kelas", width: "110px" },
            { key: "status", label: "Status", cls: "center", width: "110px" },
            { key: "_a", label: "Aksi", cls: "right", width: "150px" }
          ],
          rows: rows.map(function (s) {
            return {
              id: s.id,
              cls: s.status === "nonaktif" ? "is-inactive" : "",
              data: {
                nis: ui.esc(s.nis || "—"),
                nama: ui.esc(s.nama),
                kelas: ui.esc(s.kelas),
                status: s.status === "nonaktif"
                  ? '<span class="badge badge-off">nonaktif</span>'
                  : '<span class="badge badge-ok">aktif</span>',
                _a: '<div class="row-actions">' +
                    '<button class="btn btn-ghost btn-sm" data-act="edit" data-id="' + ui.esc(s.id) + '" type="button">Ubah</button>' +
                    (s.status === "nonaktif"
                      ? '<button class="btn btn-ghost btn-sm" data-act="activate" data-id="' + ui.esc(s.id) + '" type="button">Aktifkan</button>'
                      : '<button class="btn btn-danger-ghost btn-sm" data-act="off" data-id="' + ui.esc(s.id) + '" type="button">Nonaktifkan</button>') +
                    "</div>"
              }
            };
          }),
          empty: {
            title: all.length ? "Tidak cocok dengan filter" : "Belum ada siswa",
            body: all.length
              ? "Ubah kata kunci atau filter kelas/status."
              : "Tambahkan siswa pertama melalui form di samping.",
            cta: all.length ? "" : ""
          }
        });

        elTable.innerHTML = body;
      }

      /* ---------------- form ---------------- */
      function resetForm() {
        form.reset();
        document.getElementById("fId").value = "";
        formTitle.textContent = "Tambah siswa";
        btnSave.textContent = "Simpan siswa";
        btnReset.hidden = true;
        formError.innerHTML = "";
        var nama = document.getElementById("f_nama");
        if (nama) { nama.removeAttribute("aria-invalid"); nama.focus(); }
      }

      function startEdit(id) {
        var s = all.filter(function (x) { return x.id === id; })[0];
        if (!s) return;
        document.getElementById("fId").value = s.id;
        document.getElementById("f_nis").value = s.nis || "";
        document.getElementById("f_nama").value = s.nama;
        document.getElementById("f_kelas").value = s.kelas;
        document.getElementById("f_status").value = s.status || "aktif";
        formTitle.textContent = "Ubah siswa";
        btnSave.textContent = "Simpan perubahan";
        btnReset.hidden = false;
        formError.innerHTML = "";
        document.getElementById("f_nama").focus();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      function toggleStatus(id, status) {
        App.api.call("siswa.save", { records: [{ id: id, status: status }] }).then(function () {
          ui.toast(status === "aktif" ? "Siswa diaktifkan." : "Siswa dinonaktifkan. Nilainya tetap tersimpan.", "success");
          load();
        }).catch(function (e) {
          elBanner.innerHTML = ui.banner("error", "Gagal", ui.esc(ui.friendlyError(e)));
        });
      }

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        formError.innerHTML = "";

        var id = document.getElementById("fId").value;
        var nis = document.getElementById("f_nis").value.trim();
        var nama = document.getElementById("f_nama").value.trim();
        var kelas = document.getElementById("f_kelas").value;
        var status = document.getElementById("f_status").value;

        var namaEl = document.getElementById("f_nama");
        if (nama.length < 2 || nama.length > 80) {
          namaEl.setAttribute("aria-invalid", "true");
          formError.innerHTML = ui.banner("error", "", "Nama harus 2–80 karakter.");
          namaEl.focus();
          return;
        }
        namaEl.removeAttribute("aria-invalid");
        if (!kelas) {
          formError.innerHTML = ui.banner("error", "", "Kelas wajib dipilih.");
          return;
        }

        var record = { nis: nis, nama: nama, kelas: kelas, status: status };
        if (id) record.id = id;

        ui.busy(btnSave, true, "Menyimpan…");
        App.api.call("siswa.save", { records: [record] }).then(function (res) {
          ui.busy(btnSave, false);
          var skipped = (res && res.skipped) || [];
          if (skipped.length) {
            formError.innerHTML = ui.banner("error", "Tidak tersimpan", ui.esc(skipped[0].reason));
            return;
          }
          ui.toast(id ? "Perubahan tersimpan." : "Siswa ditambahkan.", "success");
          resetForm();
          load();
        }).catch(function (err) {
          ui.busy(btnSave, false);
          formError.innerHTML = ui.banner("error", "Gagal menyimpan", ui.esc(ui.friendlyError(err)));
        });
      });

      btnReset.addEventListener("click", resetForm);

      elTable.addEventListener("click", function (e) {
        var btn = e.target.closest ? e.target.closest("button[data-act]") : null;
        if (!btn) return;
        var id = btn.getAttribute("data-id");
        var act = btn.getAttribute("data-act");

        if (act === "edit") { startEdit(id); return; }
        if (act === "activate") { toggleStatus(id, "aktif"); return; }
        if (act === "off") {
          var s = all.filter(function (x) { return x.id === id; })[0];
          ui.confirm({
            title: "Nonaktifkan siswa?",
            body: "Nonaktifkan \"" + (s ? s.nama : id) + "\"? Nilai yang sudah ada tetap tersimpan dan tetap muncul di rekap.",
            okLabel: "Nonaktifkan",
            danger: true
          }).then(function (ok) { if (ok) toggleStatus(id, "nonaktif"); });
        }
      });

      elSearch.addEventListener("input", function () {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(renderTable, 200);
      });
      elKelasFilter.addEventListener("change", renderTable);
      elStatus.addEventListener("change", renderTable);

      /* ---------------- boot ---------------- */
      setKelasSelect(elKelasFilter, true);
      setKelasSelect(document.getElementById("f_kelas"), false);

      loadMeta().then(function (m) {
        meta = m;
        setKelasSelect(elKelasFilter, true);
        setKelasSelect(document.getElementById("f_kelas"), false);
        if (!elKelasFilter.value) {
          var opts = kelasOptions(false);
          if (opts.length === 1) elKelasFilter.value = opts[0].value;
        }
        renderTable();
        return load();
      }).catch(function (e) {
        if (e && e.code === "INVALID_TOKEN") return;
        elTable.innerHTML = ui.banner("error", "Gagal memuat konfigurasi", ui.esc(ui.friendlyError(e)));
      });
    }
  });
})();
