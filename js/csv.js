/* ============================================================
 * csv.js — util murni untuk impor data siswa dari CSV.
 *
 * Dipakai halaman siswa (FR-010). Tanpa DOM/tanpa fetch → bisa
 * diuji langsung di Node (lihat test/run_csv_tests.js).
 *   App.csv.parse(text)                          → Array<Array<String>>
 *   App.csv.mapSiswa(rows, kelasList, existing)  → { header, records, invalid, stats, error? }
 * ============================================================ */
window.App = window.App || {};

App.csv = (function () {
  "use strict";

  /* Parser CSV RFC-4180 sederhana: quote ", escaped "", koma dalam quote,
   * newline CRLF/LF, buang BOM, abadikan baris yang (setelah trim) kosong. */
  function parse(text) {
    var s = text === null || text === undefined ? "" : String(text);
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);          /* strip BOM */

    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    var i = 0;
    var len = s.length;

    while (i < len) {
      var c = s.charAt(i);
      if (inQuotes) {
        if (c === '"') {
          if (s.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"' && field === "") { inQuotes = true; i++; continue; }
      if (c === '"') { field += c; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\r") {
        if (s.charAt(i + 1) === "\n") i++;
        row.push(field); rows.push(row); row = []; field = ""; i++; continue;
      }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    row.push(field);
    rows.push(row);

    var out = [];
    for (var r = 0; r < rows.length; r++) {
      var rr = rows[r];
      var empty = true;
      for (var j = 0; j < rr.length; j++) {
        if (String(rr[j]).trim() !== "") { empty = false; break; }
      }
      if (!empty) out.push(rr);
    }
    return out;
  }

  /* Ubah baris CSV → record siswa siap kirim ke `siswa.save`.
   * - Header wajib memuat `nama` dan `kelas` (case-insensitive).
   * - `status` kosong dianggap "aktif".
   * - Record dengan NIS yang cocok dengan `existing` diberi `id` (update),
   *   sisanya insert. NIS ganda dalam file ditandai invalid. */
  function mapSiswa(rows, kelasList, existing) {
    var result = { header: [], records: [], invalid: [], stats: { baris: 0, baru: 0, update: 0, invalid: 0 } };
    if (!rows || !rows.length) { result.error = "FILE_KOSONG"; return result; }

    var header = [];
    for (var h = 0; h < rows[0].length; h++) header.push(String(rows[0][h] === null || rows[0][h] === undefined ? "" : rows[0][h]).trim().toLowerCase());
    result.header = header;

    var iNis = header.indexOf("nis");
    var iNama = header.indexOf("nama");
    var iKelas = header.indexOf("kelas");
    var iStatus = header.indexOf("status");
    if (iNama === -1 || iKelas === -1) { result.error = "HEADER_INVALID"; return result; }

    var validKelas = {};
    (kelasList || []).forEach(function (k) {
      var key = typeof k === "string" ? k : (k && k.key);
      if (key) validKelas[String(key)] = true;
    });

    var byNis = {};
    (existing || []).forEach(function (s) {
      var n = String((s && s.nis) || "").trim().toLowerCase();
      if (n && !byNis[n]) byNis[n] = s;
    });

    var seenNis = {};

    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      var lineNo = r + 1;                       /* 1-based termasuk header */
      var cell = function (idx) {
        if (idx === -1) return "";
        var v = row[idx];
        return String(v === null || v === undefined ? "" : v).trim();
      };
      var nis = cell(iNis);
      var nama = cell(iNama);
      var kelas = cell(iKelas);
      var status = cell(iStatus).toLowerCase() || "aktif";

      result.stats.baris++;

      var reason = null;
      if (!nama || nama.length < 2 || nama.length > 80 || /[\u0000-\u001f]/.test(nama)) reason = "Nama harus 2–80 karakter.";
      else if (!kelas) reason = "Kelas wajib diisi.";
      else if (!validKelas[kelas]) reason = "Kelas tidak dikenal: " + kelas + ".";
      else if (status !== "aktif" && status !== "nonaktif") reason = "Status harus aktif/nonaktif.";
      else if (nis.length > 32) reason = "NIS terlalu panjang (maks 32).";

      var nisKey = nis.toLowerCase();
      if (!reason && nisKey) {
        if (seenNis[nisKey]) reason = "NIS ganda dalam file: " + nis + ".";
        else seenNis[nisKey] = true;
      }

      if (reason) {
        result.invalid.push({ line: lineNo, nis: nis, nama: nama, kelas: kelas, status: status, reason: reason });
        continue;
      }

      var rec = { nis: nis, nama: nama, kelas: kelas, status: status };
      var match = nisKey ? byNis[nisKey] : null;
      if (match) { rec.id = match.id; result.stats.update++; }
      else result.stats.baru++;
      result.records.push(rec);
    }

    result.stats.invalid = result.invalid.length;
    return result;
  }

  return { parse: parse, mapSiswa: mapSiswa };
})();
