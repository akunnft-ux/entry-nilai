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
          '<div class="row">' +
            '<button class="btn btn-secondary" id="btnTemplate" type="button">Unduh template CSV</button>' +
            '<button class="btn btn-secondary" id="btnImport" type="button">Impor CSV</button>' +
            '<input type="file" id="fileImport" accept=".csv,text/csv,application/vnd.ms-excel" hidden>' +
          "</div>" +
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
      var btnTemplate = document.getElementById("btnTemplate");
      var btnImport = document.getElementById("btnImport");
      var fileImport = document.getElementById("fileImport");

      var meta = null;
      var all = [];
      var searchTimer = null;
      var importJob = null;   /* { records, offset, prog } */
      var PAGE_SIZE = 25;
      var page = 1;

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
        var rowsAll = filtered();
        var total = rowsAll.length;
        var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (page > pages) page = pages;
        if (page < 1) page = 1;
        var rows = rowsAll.slice((page - 1) * PAGE_SIZE, (page - 1) * PAGE_SIZE + PAGE_SIZE);
        elCount.textContent = total + " siswa ditampilkan";

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

        elTable.innerHTML = body + ui.pager({ page: page, pageSize: PAGE_SIZE, total: total });
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

      /* ---------------- impor CSV (FR-010) ---------------- */
      function downloadTemplate() {
        var rows = [
          ["nis", "nama", "kelas", "status"],
          ["1001", "Ahmad Fauzi", "7A", "aktif"],
          ["1002", "Budi Santoso", "7A", "aktif"]
        ];
        try {
          ui.downloadCsv("template-siswa.csv", rows);
          ui.toast("Template diunduh. Isi datanya lalu impor kembali.", "success");
        } catch (e) {
          ui.toast("Browser memblokir unduhan. Izinkan download untuk situs ini.", "error");
        }
      }

      function rowsHtml(items, fmt) {
        if (!items || !items.length) return "";
        var shown = items.slice(0, 10);
        var extra = items.length - shown.length;
        return '<div style="margin-top:8px;font-size:12px">' +
          shown.map(function (it) { return "• " + fmt(it); }).join("<br>") +
          (extra > 0 ? "<br>… dan " + extra + " baris lain" : "") +
        "</div>";
      }

      function renderImportPreview(mapped) {
        if (mapped.error === "HEADER_INVALID") {
          elBanner.innerHTML = ui.banner("error", "Header tidak sesuai",
            "Kolom wajib <b>nama</b> dan <b>kelas</b> tidak ditemukan. Unduh template untuk contoh format.");
          return;
        }
        if (mapped.error === "FILE_KOSONG") {
          elBanner.innerHTML = ui.banner("error", "File kosong", "Tidak ada baris yang bisa dibaca.");
          return;
        }

        var s = mapped.stats;
        var total = s.baru + s.update;
        var invalidHtml = rowsHtml(mapped.invalid, function (r) {
          return "Baris " + r.line + ": " + ui.esc(r.nama || "-") + " — " + ui.esc(r.reason);
        });

        if (!total) {
          elBanner.innerHTML = ui.banner("error", "Tidak ada baris valid",
            ui.esc(s.invalid) + " baris tidak valid." + invalidHtml);
          return;
        }

        elBanner.innerHTML = ui.banner("warn", "Pratinjau impor",
          s.baris + " baris dibaca: <b>" + s.baru + "</b> siswa baru, <b>" + s.update + "</b> diperbarui" +
          (s.invalid ? ", <b>" + s.invalid + "</b> dilewati" : "") + "." + invalidHtml,
          '<button class="btn btn-primary btn-sm" id="impConfirm" type="button">Simpan ' + total + " baris</button>" +
          '<button class="btn btn-ghost btn-sm" id="impCancel" type="button">Batal</button>');

        var ok = document.getElementById("impConfirm");
        if (ok) ok.addEventListener("click", function () {
          importJob = { records: mapped.records.slice(), offset: 0,
                        prog: { saved: 0, inserted: 0, updated: 0, skipped: [] } };
          doImport();
        });
        var no = document.getElementById("impCancel");
        if (no) no.addEventListener("click", function () { elBanner.innerHTML = ""; });
      }

      function handleFile(file) {
        if (!file) return;
        elBanner.innerHTML = "";
        importJob = null;
        if (file.size > 1024 * 1024) {
          elBanner.innerHTML = ui.banner("error", "File terlalu besar",
            "Maksimum 1 MB. Bagi data menjadi beberapa file lalu impor satu per satu.");
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          var rows;
          try { rows = App.csv.parse(String(reader.result || "")); }
          catch (e) {
            elBanner.innerHTML = ui.banner("error", "Gagal membaca file", "Pastikan file berformat CSV.");
            return;
          }
          renderImportPreview(App.csv.mapSiswa(rows, (meta && meta.kelas) || [], all));
        };
        reader.onerror = function () {
          elBanner.innerHTML = ui.banner("error", "Gagal membaca file", "Coba lagi atau gunakan file lain.");
        };
        reader.readAsText(file, "UTF-8");
      }

      function importBatch(job) {
        var chunk = job.records.slice(job.offset, job.offset + App.config.BATCH_SIZE);
        if (!chunk.length) return Promise.resolve();
        return App.api.call("siswa.save", { records: chunk }).then(function (res) {
          job.prog.saved += (res && res.saved) || 0;
          job.prog.inserted += (res && res.inserted) || 0;
          job.prog.updated += (res && res.updated) || 0;
          (res && res.skipped ? res.skipped : []).forEach(function (x) { job.prog.skipped.push(x); });
          job.offset += App.config.BATCH_SIZE;
          return importBatch(job);
        });
      }

      function doImport() {
        if (!importJob) return;
        var job = importJob;
        elBanner.innerHTML = ui.banner("warn", "Mengimpor…",
          "Menyimpan " + job.records.length + " baris, mohon tunggu.");

        importBatch(job).then(function () {
          importJob = null;
          load();
          var msg = job.prog.inserted + " ditambahkan, " + job.prog.updated + " diperbarui";
          if (job.prog.skipped.length) {
            elBanner.innerHTML = ui.banner("warn", "Impor selesai sebagian",
              ui.esc(msg) + " · " + job.prog.skipped.length + " dilewati" +
              rowsHtml(job.prog.skipped, function (r) {
                return ui.esc(r.nama || r.nis || r.id || "-") + " — " + ui.esc(r.message || r.reason || "dilewati");
              }));
            ui.toast("Impor selesai, " + job.prog.skipped.length + " dilewati", "warn");
          } else {
            elBanner.innerHTML = ui.banner("success", "Impor selesai", ui.esc(msg) + ".");
            ui.toast(msg, "success");
            setTimeout(function () {
              if (elBanner.querySelector(".banner-success")) elBanner.innerHTML = "";
            }, 5000);
          }
        }).catch(function (e) {
          elBanner.innerHTML = ui.banner("error", "Impor gagal",
            ui.esc(ui.friendlyError(e)) + "<br>" + job.prog.inserted + " ditambahkan, " +
            job.prog.updated + " diperbarui sebelum gagal.",
            '<button class="btn btn-secondary btn-sm" id="impRetry" type="button">Lanjutkan</button>' +
            '<button class="btn btn-ghost btn-sm" id="impAbort" type="button">Batal</button>');
          var r = document.getElementById("impRetry");
          if (r) r.addEventListener("click", doImport);
          var a = document.getElementById("impAbort");
          if (a) a.addEventListener("click", function () { importJob = null; elBanner.innerHTML = ""; });
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
        var pgBtn = e.target.closest ? e.target.closest("button[data-page]") : null;
        if (pgBtn) {
          var n = parseInt(pgBtn.getAttribute("data-page"), 10);
          if (n && n !== page) { page = n; renderTable(); }
          return;
        }
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

      function onFilterChange() { page = 1; renderTable(); }
      elSearch.addEventListener("input", function () {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(onFilterChange, 200);
      });
      elKelasFilter.addEventListener("change", onFilterChange);
      elStatus.addEventListener("change", onFilterChange);

      btnTemplate.addEventListener("click", downloadTemplate);
      btnImport.addEventListener("click", function () { fileImport.value = ""; fileImport.click(); });
      fileImport.addEventListener("change", function () {
        handleFile(fileImport.files && fileImport.files[0]);
      });

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
