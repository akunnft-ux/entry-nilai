/* ============================================================
 * pages/entry.js — entry nilai massal per kelas + jenis + kode
 * FR-003 (layout), FR-004 (simpan batch) · ui-spec P2
 * ============================================================ */
(function () {
  "use strict";
  var ui = App.ui;

  App.registerPage("entry", {
    title: "Entry Nilai",
    render: function (root) {
      root.innerHTML =
        '<div class="page-head">' +
          "<div><h1>Entry Nilai</h1>" +
          "<p>Pilih kelas, jenis, lalu isi seluruh nilai dalam satu tabel.</p></div>" +
        "</div>" +
        '<div id="entryBanner"></div>' +
        '<div class="filter-bar" id="filterBar">' +
          '<div class="field"><label class="label" for="fKelas">Kelas</label>' +
            '<select class="select" id="fKelas"><option value="">— pilih —</option></select></div>' +
          '<div class="field"><label class="label" for="fJenis">Jenis</label>' +
            '<select class="select" id="fJenis" disabled><option value="">— pilih —</option></select></div>' +
          '<div class="field"><label class="label" for="fKode">Kode / pekan</label>' +
            '<select class="select" id="fKode" disabled><option value="">— pilih —</option></select></div>' +
          '<div class="filter-stats" id="fStats"></div>' +
          '<div class="filter-actions">' +
            '<button class="btn btn-secondary" id="btnReload" type="button">Muat ulang</button>' +
            '<button class="btn btn-primary" id="btnSave" type="button" disabled>Simpan</button>' +
          "</div>" +
        "</div>" +
        '<div id="entryTable"></div>';

      var elKelas = document.getElementById("fKelas");
      var elJenis = document.getElementById("fJenis");
      var elKode = document.getElementById("fKode");
      var elStats = document.getElementById("fStats");
      var elBanner = document.getElementById("entryBanner");
      var elTable = document.getElementById("entryTable");
      var btnReload = document.getElementById("btnReload");
      var btnSave = document.getElementById("btnSave");

      var S = { meta: null, siswa: [], nilai: {}, rows: [], loading: false, draftLoaded: false };
      var draftTimer = null;

      /* ---------------- meta ---------------- */
      function loadMeta() {
        var cached = App.store.getMeta();
        if (cached) return Promise.resolve(cached);
        return App.api.call("meta.get", {}).then(function (meta) {
          App.store.setMeta(meta);
          return meta;
        });
      }

      function fillSelect(el, items, placeholder) {
        var cur = el.value;
        var html = '<option value="">' + ui.esc(placeholder) + "</option>";
        (items || []).forEach(function (it) {
          html += '<option value="' + ui.esc(it.key) + '">' + ui.esc(it.label || it.key) +
            (it.aktif === false ? " (nonaktif)" : "") + "</option>";
        });
        el.innerHTML = html;
        if (cur) el.value = cur;
      }

      function activeKelas() { return (S.meta.kelas || []).filter(function (k) { return k.aktif !== false; }); }
      function activeJenis() { return (S.meta.jenis || []).filter(function (k) { return k.aktif !== false; }); }
      function kodeFor(jenis) {
        return (S.meta.kode || []).filter(function (k) { return k.parent === jenis && k.aktif !== false; });
      }

      /* ---------------- data ---------------- */
      function resetTable(html) { elTable.innerHTML = html; S.rows = []; updateSummary(); }

      function loadSiswaAndNilai() {
        if (!S.kelas || !S.jenis || !S.kode) {
          resetTable(renderHint());
          return;
        }
        S.loading = true;
        resetTable('<div class="table-shell">' + ui.skeleton(8, [40, 90, 220, 80, 80]) + "</div>");

        Promise.all([
          App.api.call("siswa.list", { kelas: S.kelas, status: "aktif" }),
          App.api.call("nilai.list", { kelas: S.kelas, jenis: S.jenis, kode: S.kode })
        ]).then(function (res) {
          var siswa = (res[0] && res[0].siswa) || [];
          var nilai = (res[1] && res[1].nilai) || [];

          siswa.sort(function (a, b) { return String(a.nama).localeCompare(String(b.nama), "id"); });

          S.siswa = siswa;
          S.nilai = {};
          nilai.forEach(function (n) { S.nilai[n.siswa_id] = n; });

          buildRows();
          applyDraft();
          renderTable();
        }).catch(function (e) {
          resetTable(ui.banner("error", "Gagal memuat data", ui.esc(ui.friendlyError(e)),
            '<button class="btn btn-secondary btn-sm" id="tblRetry" type="button">Coba lagi</button>'));
          var r = document.getElementById("tblRetry");
          if (r) r.addEventListener("click", loadSiswaAndNilai);
        }).then(function () { S.loading = false; });
      }

      function buildRows() {
        S.rows = S.siswa.map(function (s) {
          var n = S.nilai[s.id];
          var origSkor = n && n.skor !== null && n.skor !== undefined && n.skor !== "" ? Number(n.skor) : null;
          var origCat = n && n.catatan ? String(n.catatan) : "";
          return {
            id: s.id, nis: s.nis || "", nama: s.nama,
            origSkor: origSkor, origCat: origCat,
            v: origSkor === null ? "" : String(origSkor).replace(".", ","),
            c: origCat,
            invalid: null
          };
        });
      }

      function applyDraft() {
        var d = App.store.getDraft(S.kelas, S.jenis, S.kode);
        S.draftLoaded = false;
        if (!d || !d.rows) return;
        var applied = 0;
        S.rows.forEach(function (row) {
          var dr = d.rows[row.id];
          if (!dr) return;
          if (dr.v !== undefined && dr.v !== row.v) { row.v = dr.v; applied++; }
          if (dr.c !== undefined && dr.c !== row.c) { row.c = dr.c; applied++; }
        });
        if (applied > 0) {
          S.draftLoaded = true;
          elBanner.innerHTML = ui.banner("warn", "Draft dipulihkan",
            applied + " perubahan belum tersimpan dikembalikan dari penyimpanan lokal.",
            '<button class="btn btn-secondary btn-sm" id="dropDraft" type="button">Buang draft</button>' +
            '<button class="btn btn-primary btn-sm" id="saveDraft" type="button">Simpan sekarang</button>');
          document.getElementById("dropDraft").addEventListener("click", function () {
            App.store.clearDraft(S.kelas, S.jenis, S.kode);
            elBanner.innerHTML = "";
            buildRows();
            renderTable();
          });
          document.getElementById("saveDraft").addEventListener("click", save);
        } else {
          elBanner.innerHTML = "";
        }
      }

      /* ---------------- render tabel ---------------- */
      function renderHint() {
        if (!activeKelas().length) {
          return '<div class="table-shell">' + ui.emptyState({
            title: "Belum ada kelas",
            body: "Tambahkan minimal satu kelas dan daftar siswanya terlebih dahulu.",
            cta: '<a class="btn btn-primary" href="#/siswa">Kelola siswa</a>'
          }) + "</div>";
        }
        if (!S.kelas) {
          return '<div class="table-shell">' + ui.emptyState({
            title: "Pilih kelas",
            body: "Pilih kelas, jenis penilaian, dan kode pada filter di atas."
          }) + "</div>";
        }
        if (!S.jenis) {
          return '<div class="table-shell">' + ui.emptyState({
            title: "Pilih jenis penilaian",
            body: "Pilih Tugas Harian, Ulangan Harian, atau Ujian Semester."
          }) + "</div>";
        }
        if (!kodeFor(S.jenis).length) {
          return '<div class="table-shell">' + ui.emptyState({
            title: "Belum ada kode penilaian",
            body: "Buat kode untuk jenis ini (misalnya \"UH-1\") di halaman Pengaturan.",
            cta: '<a class="btn btn-primary" href="#/pengaturan">Buat kode penilaian</a>'
          }) + "</div>";
        }
        return '<div class="table-shell">' + ui.emptyState({
          title: "Pilih kode penilaian",
          body: "Pilih kode / pekan penilaian pada filter di atas."
        }) + "</div>";
      }

      function renderTable() {
        if (!S.rows.length) {
          resetTable('<div class="table-shell">' + ui.emptyState({
            title: "Belum ada siswa di " + (S.kelas || "kelas ini"),
            body: "Tambahkan siswa terlebih dahulu agar bisa mengisi nilai.",
            cta: '<a class="btn btn-primary" href="#/siswa">Tambah siswa</a>'
          }) + "</div>");
          return;
        }

        var html = '<div class="table-shell">' +
          '<div class="table-scroll nice"><table class="data sticky-col entry-table">' +
          "<thead><tr>" +
            '<th scope="col" class="col-pin col-idx">#</th>' +
            '<th scope="col" class="col-nis">NIS</th>' +
            '<th scope="col" class="col-nama">Nama siswa</th>' +
            '<th scope="col" class="col-nilai center">Nilai</th>' +
            '<th scope="col" class="col-catatan">Catatan</th>' +
          "</tr></thead><tbody>";

        S.rows.forEach(function (row, i) {
          html += '<tr data-id="' + ui.esc(row.id) + '">' +
            '<td class="col-pin col-idx num">' + (i + 1) + "</td>" +
            '<td class="col-nis num">' + ui.esc(row.nis) + "</td>" +
            '<td class="col-nama">' + ui.esc(row.nama) + "</td>" +
            '<td class="col-nilai center">' +
              '<label class="visually-hidden" for="v_' + ui.esc(row.id) + '">Nilai ' + ui.esc(row.nama) + "</label>" +
              '<input class="cell-input" id="v_' + ui.esc(row.id) + '" data-role="nilai" data-id="' + ui.esc(row.id) + '" ' +
                'inputmode="decimal" maxlength="5" autocomplete="off" value="' + ui.esc(row.v) + '">' +
            "</td>" +
            '<td class="col-catatan">' +
              '<label class="visually-hidden" for="c_' + ui.esc(row.id) + '">Catatan ' + ui.esc(row.nama) + "</label>" +
              '<input class="cell-text" id="c_' + ui.esc(row.id) + '" data-role="catatan" data-id="' + ui.esc(row.id) + '" ' +
                'maxlength="200" autocomplete="off" value="' + ui.esc(row.c) + '">' +
            "</td>" +
          "</tr>";
        });

        html += "</tbody></table></div></div>" +
          '<div class="summary-bar">' +
            '<span class="summary-count" id="cntDirty"><span class="dot"></span><span class="txt">Tidak ada perubahan</span></span>' +
            '<span class="summary-count invalid" id="cntInvalid" hidden><span class="dot"></span><span class="txt"></span></span>' +
            '<span class="right muted" id="cntFilled" style="font-size:12px"></span>' +
          "</div>";

        elTable.innerHTML = html;
        S.rows.forEach(function (row) { decorateRow(row); });
        updateSummary();
      }

      function rowById(id) {
        for (var i = 0; i < S.rows.length; i++) if (S.rows[i].id === id) return S.rows[i];
        return null;
      }

      function decorateRow(row) {
        var tr = elTable.querySelector('tr[data-id="' + cssEscape(row.id) + '"]');
        if (!tr) return;
        tr.classList.toggle("is-filled", row.origSkor !== null || ui.parseNilai(row.v).value !== undefined);
        tr.classList.toggle("is-invalid", !!row.invalid);
        var input = tr.querySelector('[data-role="nilai"]');
        if (input) {
          if (row.invalid) input.setAttribute("aria-invalid", "true");
          else input.removeAttribute("aria-invalid");
        }
      }

      function cssEscape(s) { return String(s).replace(/["\\]/g, "\\$&"); }

      function isChanged(row) {
        var p = ui.parseNilai(row.v);
        if (p.invalid) return true;                        /* selalu dianggap berubah */
        var next = p.empty ? null : p.value;
        if (next !== row.origSkor) return true;
        return row.c !== row.origCat;
      }

      function changedCount() {
        var n = 0;
        S.rows.forEach(function (r) { if (isChanged(r)) n++; });
        return n;
      }
      function invalidRows() {
        return S.rows.filter(function (r) { return ui.parseNilai(r.v).invalid; });
      }
      function filledCount() {
        var n = 0;
        S.rows.forEach(function (r) { var p = ui.parseNilai(r.v); if (!p.invalid && !p.empty) n++; });
        return n;
      }

      function updateSummary() {
        var elDirty = document.getElementById("cntDirty");
        var elInvalid = document.getElementById("cntInvalid");
        var elFilled = document.getElementById("cntFilled");
        if (!elDirty) return;

        var changed = changedCount();
        var invalid = invalidRows().length;
        var filled = filledCount();

        elDirty.classList.toggle("dirty", changed > 0);
        elDirty.querySelector(".txt").textContent = changed > 0
          ? changed + " belum tersimpan"
          : "Tidak ada perubahan";

        if (invalid > 0) {
          elInvalid.hidden = false;
          elInvalid.querySelector(".txt").textContent = invalid + " nilai tidak valid";
        } else {
          elInvalid.hidden = true;
        }

        if (elFilled) elFilled.textContent = filled + " / " + S.rows.length + " siswa terisi";

        var stats = document.getElementById("fStats");
        if (stats) {
          stats.textContent = S.rows.length ? (S.rows.length + " siswa · " + filled + " terisi") : "";
        }

        btnSave.disabled = changed === 0 || S.loading;
        App.state.dirty = changed > 0;
      }

      /* ---------------- draft ---------------- */
      function scheduleDraft() {
        if (draftTimer) clearTimeout(draftTimer);
        draftTimer = setTimeout(saveDraftNow, App.config.DRAFT_DEBOUNCE_MS);
      }

      function saveDraftNow() {
        if (!S.kelas || !S.jenis || !S.kode) return;
        var rows = {};
        S.rows.forEach(function (r) {
          if (isChanged(r)) rows[r.id] = { v: r.v, c: r.c };
        });
        if (Object.keys(rows).length) App.store.setDraft(S.kelas, S.jenis, S.kode, rows);
        else App.store.clearDraft(S.kelas, S.jenis, S.kode);
      }

      /* ---------------- simpan ---------------- */
      function save() {
        if (!S.kelas || !S.jenis || !S.kode) return;
        if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; }

        var records = [];
        var skipped = [];
        var kept = 0;

        S.rows.forEach(function (row) {
          if (!isChanged(row)) return;
          var p = ui.parseNilai(row.v);
          if (p.invalid) {
            skipped.push({ siswa_id: row.id, nama: row.nama, reason: p.invalid });
            return;
          }
          var nilai = p.empty ? null : p.value;   /* null = hapus nilai yang sebelumnya terisi */
          if (nilai === null && row.origSkor === null && row.c === row.origCat) return;
          records.push({ siswa_id: row.id, nilai: nilai, catatan: row.c || "" });
          kept++;
        });

        if (!records.length) {
          if (skipped.length) {
            elBanner.innerHTML = ui.banner("error", "Tidak ada yang bisa disimpan",
              "Semua nilai yang diubah tidak valid (0–100).");
          }
          return;
        }

        ui.busy(btnSave, true, "Menyimpan…");
        elBanner.innerHTML = "";

        saveBatch(records, 0, { inserted: 0, updated: 0, deleted: 0, skipped: skipped })
          .then(function (sum) {
            ui.busy(btnSave, false);
            /* terapkan hasil ke state asal */
            records.forEach(function (rec) {
              var row = rowById(rec.siswa_id);
              if (!row) return;
              row.origSkor = rec.nilai;
              row.origCat = rec.catatan || "";
              row.v = rec.nilai === null ? "" : String(rec.nilai).replace(".", ",");
              row.c = row.origCat;
              decorateRow(row);
            });

            App.store.clearDraft(S.kelas, S.jenis, S.kode);
            S.draftLoaded = false;

            var msg = sum.updated + " diperbarui, " + sum.inserted + " baru" +
              (sum.deleted ? ", " + sum.deleted + " dihapus" : "");
            if (sum.skipped.length) {
              elBanner.innerHTML = ui.banner("warn", "Tersimpan sebagian",
                ui.esc(msg) + " · " + sum.skipped.length + " dilewati:<br>" +
                sum.skipped.map(function (s) {
                  return "• " + ui.esc(s.nama || s.siswa_id) + " — " + ui.esc(s.message || s.reason);
                }).join("<br>"));
              App.ui.toast(msg + ", " + sum.skipped.length + " dilewati", "warn");
            } else {
              elBanner.innerHTML = ui.banner("success", "Tersimpan", ui.esc(msg) + ".");
              App.ui.toast(msg, "success");
              setTimeout(function () {
                if (elBanner.querySelector(".banner-success")) elBanner.innerHTML = "";
              }, 4000);
            }
            updateSummary();
          })
          .catch(function (e) {
            ui.busy(btnSave, false);
            elBanner.innerHTML = ui.banner("error", "Gagal menyimpan",
              ui.esc(ui.friendlyError(e)) + "<br>Draft tetap tersimpan di perangkat ini.",
              '<button class="btn btn-secondary btn-sm" id="retrySave" type="button">Coba lagi</button>');
            var b = document.getElementById("retrySave");
            if (b) b.addEventListener("click", save);
            saveDraftNow();
          });
      }

      function saveBatch(records, offset, summary) {
        var chunk = records.slice(offset, offset + App.config.BATCH_SIZE);
        if (!chunk.length) return Promise.resolve(summary);
        return App.api.call("nilai.bulkSave", {
          kelas: S.kelas, jenis: S.jenis, kode: S.kode, records: chunk
        }).then(function (data) {
          summary.inserted += data.inserted || 0;
          summary.updated += data.updated || 0;
          summary.deleted += data.deleted || 0;
          (data.skipped || []).forEach(function (s) { summary.skipped.push(s); });
          return saveBatch(records, offset + App.config.BATCH_SIZE, summary);
        });
      }

      /* ---------------- event ---------------- */
      elTable.addEventListener("input", function (e) {
        var t = e.target;
        var id = t.getAttribute && t.getAttribute("data-id");
        if (!id) return;
        var row = rowById(id);
        if (!row) return;

        if (t.getAttribute("data-role") === "nilai") {
          var p = ui.parseNilai(t.value);
          row.invalid = p.invalid || null;
          row.v = t.value;
          decorateRow(row);
        } else {
          row.c = t.value;
          decorateRow(row);
        }
        updateSummary();
        scheduleDraft();
      });

      elTable.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        var t = e.target;
        if (!t.getAttribute || t.getAttribute("data-role") !== "nilai") return;
        e.preventDefault();
        var tr = t.closest("tr");
        var next = tr && tr.nextElementSibling;
        if (next) {
          var n = next.querySelector('[data-role="nilai"]');
          if (n) { n.focus(); n.select(); }
        } else {
          btnSave.focus();
        }
      });

      function onFilterChange() {
        S.kelas = elKelas.value;
        S.jenis = elJenis.value;
        S.kode = elKode.value;

        /* kaskade: kode mengikuti jenis */
        elKode.disabled = !S.jenis;
        if (S.jenis) {
          var kodeList = kodeFor(S.jenis);
          fillSelect(elKode, kodeList, "— pilih —");
          S.kode = kodeList.some(function (k) { return k.key === S.kode; }) ? S.kode : "";
          elKode.value = S.kode;
        } else {
          elKode.innerHTML = '<option value="">— pilih —</option>';
          S.kode = "";
        }

        elJenis.disabled = !S.kelas;
        if (!S.kelas) {
          elJenis.innerHTML = '<option value="">— pilih —</option>';
          elJenis.disabled = true;
          S.jenis = "";
          S.kode = "";
        } else if (elJenis.options.length <= 1) {
          fillSelect(elJenis, activeJenis(), "— pilih —");
        }

        elBanner.innerHTML = "";
        App.state.dirty = false;
        loadSiswaAndNilai();
      }

      elKelas.addEventListener("change", function () {
        if (S.kelas && App.state.dirty) {
          var k = elKelas.value;
          elKelas.value = S.kelas;
          ui.confirm({
            title: "Pindah kelas?",
            body: "Ada nilai yang belum tersimpan. Perubahan tetap tersimpan sebagai draft lokal.",
            okLabel: "Pindah"
          }).then(function (ok) {
            if (ok) { elKelas.value = k; onFilterChange(); }
          });
          return;
        }
        onFilterChange();
      });
      elJenis.addEventListener("change", onFilterChange);
      elKode.addEventListener("change", onFilterChange);

      btnReload.addEventListener("click", function () {
        App.store.clearMeta();
        elBanner.innerHTML = "";
        loadAll();
      });
      btnSave.addEventListener("click", save);

      /* ---------------- boot halaman ---------------- */
      function loadAll() {
        return loadMeta().then(function (meta) {
          S.meta = meta;
          fillSelect(elKelas, activeKelas(), "— pilih —");
          fillSelect(elJenis, activeJenis(), "— pilih —");
          if (!S.kelas && activeKelas().length === 1) {
            elKelas.value = activeKelas()[0].key;
            S.kelas = elKelas.value;
          }
          elJenis.disabled = !S.kelas;
          onFilterChange();
        }).catch(function (e) {
          if (e && e.code === "INVALID_TOKEN") return;
          resetTable(ui.banner("error", "Gagal memuat konfigurasi", ui.esc(ui.friendlyError(e)),
            '<button class="btn btn-secondary btn-sm" id="metaRetry" type="button">Coba lagi</button>'));
          var b = document.getElementById("metaRetry");
          if (b) b.addEventListener("click", loadAll);
        });
      }

      loadAll();
    }
  });
})();
