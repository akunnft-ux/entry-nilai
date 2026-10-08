/* ============================================================
 * pages/rekap.js — matriks rekap per kelas + ekspor CSV
 * FR-005, FR-006 · ui-spec P3
 * ============================================================ */
(function () {
  "use strict";
  var ui = App.ui;

  function todayStamp() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  App.registerPage("rekap", {
    title: "Rekap",
    render: function (root) {
      root.innerHTML =
        '<div class="page-head">' +
          "<div><h1>Rekap Nilai</h1><p>Matriks seluruh penilaian untuk satu kelas.</p></div>" +
          '<div class="row">' +
            '<div class="field" style="margin:0"><label class="label" for="rKelas">Kelas</label>' +
              '<select class="select" id="rKelas"><option value="">— pilih —</option></select></div>' +
            '<button class="btn btn-secondary" id="btnCsv" type="button" disabled>Unduh CSV</button>' +
          "</div>" +
        "</div>" +
        '<div id="rekapBanner"></div>' +
        '<div id="rekapBody"></div>';

      var elKelas = document.getElementById("rKelas");
      var elBody = document.getElementById("rekapBody");
      var elBanner = document.getElementById("rekapBanner");
      var btnCsv = document.getElementById("btnCsv");

      var meta = null;
      var current = null; /* {columns, rows, stats} */

      function loadMeta() {
        var cached = App.store.getMeta();
        if (cached) return Promise.resolve(cached);
        return App.api.call("meta.get", {}).then(function (m) {
          App.store.setMeta(m);
          return m;
        });
      }

      function fillKelas(items) {
        var html = '<option value="">— pilih —</option>';
        (items || []).forEach(function (k) {
          if (k.aktif === false) return;
          html += '<option value="' + ui.esc(k.key) + '">' + ui.esc(k.label || k.key) + "</option>";
        });
        elKelas.innerHTML = html;
        if (items && items.length === 1 && items[0].aktif !== false) elKelas.value = items[0].key;
      }

      function groupColumns(columns) {
        var order = [];
        var map = {};
        columns.forEach(function (c) {
          var key = c.jenis;
          if (!map[key]) { map[key] = { jenis: key, label: c.jenisLabel || key, items: [] }; order.push(key); }
          map[key].items.push(c);
        });
        return order.map(function (k) { return map[k]; });
      }

      function cellKey(c) { return c.jenis + "|" + c.kode; }

      function renderMatrix(data) {
        current = data;
        var cols = data.columns || [];
        var rows = data.rows || [];
        var groups = groupColumns(cols);

        if (!cols.length || !rows.length) {
          btnCsv.disabled = true;
          elBody.innerHTML = '<div class="table-shell">' + ui.emptyState({
            title: "Belum ada nilai untuk kelas ini",
            body: "Isi nilai terlebih dahulu pada halaman Entry.",
            cta: '<a class="btn btn-primary" href="#/entry">Entry nilai</a>'
          }) + "</div>";
          return;
        }

        btnCsv.disabled = false;

        var html = '<div class="table-shell">' +
          '<div class="table-scroll nice"><table class="data sticky-col rekap-table">' +
          "<thead>" +
            '<tr><th class="col-pin" rowspan="2" scope="col">NIS</th>' +
            '<th rowspan="2" scope="col">Nama siswa</th>' +
            '<th rowspan="2" scope="col" class="center">Status</th>';
        groups.forEach(function (g) {
          html += '<th class="grp" colspan="' + g.items.length + '" scope="colgroup">' + ui.esc(g.label) +
            (g.items.every(function (i) { return i.archived; }) ? " *" : "") + "</th>";
        });
        html += "</tr><tr>";
        groups.forEach(function (g) {
          g.items.forEach(function (c) {
            html += '<th scope="col" class="center' + (c.archived ? " archived" : "") + '" title="' +
              ui.esc(c.jenisLabel + " / " + c.kodeLabel) + '">' + ui.esc(c.kodeLabel || c.kode) + "</th>";
          });
        });
        html += "</tr></thead><tbody>";

        rows.forEach(function (r) {
          html += "<tr" + (r.status === "nonaktif" ? ' class="is-inactive"' : "") + ">" +
            '<td class="col-pin num">' + ui.esc(r.nis) + "</td>" +
            "<td>" + ui.esc(r.nama) + "</td>" +
            '<td class="center">' + (r.status === "nonaktif"
              ? '<span class="badge badge-off">nonaktif</span>'
              : '<span class="badge badge-ok">aktif</span>') + "</td>";
          cols.forEach(function (c) {
            var v = r.cells ? r.cells[cellKey(c)] : null;
            var has = v !== null && v !== undefined && v !== "";
            html += '<td class="cell num' + (has ? "" : " empty-cell") + (c.archived ? " archived" : "") + '">' +
              (has ? ui.fmtNilai(v) : "—") + "</td>";
          });
          html += "</tr>";
        });

        html += "</tbody><tfoot><tr>" +
          '<td class="col-pin" colspan="3">Jumlah terisi</td>';
        (data.stats || []).forEach(function (s) {
          html += '<td class="num" title="' + s.terisi + " dari " + s.total + ' siswa">' +
            s.terisi + "/" + s.total + "</td>";
        });
        html += "</tr></tfoot></table></div></div>";

        html += '<div class="rekap-legend" style="margin-top:8px">' +
          "<span>— = belum dinilai</span>" +
          "<span>* = penilaian sudah dinonaktifkan</span>" +
          "<span>Siswa nonaktif tetap ditampilkan bila punya nilai.</span>" +
          "</div>";

        elBody.innerHTML = html;
      }

      function load() {
        var kelas = elKelas.value;
        if (!kelas) {
          current = null;
          btnCsv.disabled = true;
          elBody.innerHTML = '<div class="table-shell">' + ui.emptyState({
            title: "Pilih kelas",
            body: "Pilih kelas untuk melihat rekap nilainya."
          }) + "</div>";
          return;
        }
        elBanner.innerHTML = "";
        btnCsv.disabled = true;
        elBody.innerHTML = '<div class="table-shell">' + ui.skeleton(8, [70, 180, 70, 60, 60, 60]) + "</div>";

        App.api.call("rekap.get", { kelas: kelas }).then(function (data) {
          renderMatrix(data || {});
        }).catch(function (e) {
          if (e && e.code === "INVALID_TOKEN") return;
          elBody.innerHTML = ui.banner("error", "Gagal memuat rekap", ui.esc(ui.friendlyError(e)),
            '<button class="btn btn-secondary btn-sm" id="rkRetry" type="button">Coba lagi</button>');
          var b = document.getElementById("rkRetry");
          if (b) b.addEventListener("click", load);
        });
      }

      function exportCsv() {
        if (!current) return;
        var cols = current.columns || [];
        var rows = [];

        rows.push(["NIS", "Nama", "Status"].concat(
          cols.map(function (c) {
            return (c.jenisLabel || c.jenis) + " - " + (c.kodeLabel || c.kode);
          })
        ));

        (current.rows || []).forEach(function (r) {
          rows.push([r.nis || "", r.nama || "", r.status || ""].concat(
            cols.map(function (c) {
              var v = r.cells ? r.cells[cellKey(c)] : null;
              return v === null || v === undefined || v === "" ? "" : v;
            })
          ));
        });

        rows.push([]);
        rows.push(["Jumlah terisi"].concat(
          (current.stats || []).map(function (s) { return s.terisi + "/" + s.total; })
        ));

        var filename = "rekap-" + String(elKelas.value).replace(/[^\w-]+/g, "_") + "-" + todayStamp() + ".csv";

        try {
          ui.downloadCsv(filename, rows);
          ui.toast("CSV diunduh: " + filename, "success");
        } catch (e) {
          ui.toast("Browser memblokir unduhan. Izinkan download untuk situs ini.", "error");
        }
      }

      elKelas.addEventListener("change", load);
      btnCsv.addEventListener("click", exportCsv);

      loadMeta().then(function (m) {
        meta = m;
        fillKelas((meta && meta.kelas) || []);
        if (elKelas.value) load(); else load();
      }).catch(function (e) {
        if (e && e.code === "INVALID_TOKEN") return;
        elBody.innerHTML = ui.banner("error", "Gagal memuat konfigurasi", ui.esc(ui.friendlyError(e)));
      });
    }
  });
})();
