/* ============================================================
 * backend/schema.js — DDL SQLite (libSQL) + bootstrap idempoten.
 *
 * Semua tabel dibuat dengan "IF NOT EXISTS" sehingga aman dijalankan
 * setiap kali aplikasi dibuka. Versi skema disimpan di tabel meta.
 * ============================================================ */
window.App = window.App || {};

App.schema = (function () {
  "use strict";

  var VERSION = 1;

  /* Kolom `group` & `key` adalah kata kunci SQL — dipetakan ke grp/k. */
  var DDL = [
    "CREATE TABLE IF NOT EXISTS siswa (" +
      "id TEXT PRIMARY KEY, nis TEXT NOT NULL DEFAULT '', nama TEXT NOT NULL, " +
      "kelas TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'aktif', " +
      "created_at TEXT, updated_at TEXT, created_by TEXT, updated_by TEXT)",
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_siswa_nis ON siswa(nis COLLATE NOCASE) WHERE nis <> ''",
    "CREATE INDEX IF NOT EXISTS ix_siswa_kelas ON siswa(kelas)",

    "CREATE TABLE IF NOT EXISTS nilai (" +
      "id TEXT PRIMARY KEY, siswa_id TEXT NOT NULL, kelas TEXT NOT NULL, " +
      "jenis TEXT NOT NULL, kode TEXT NOT NULL, mapel TEXT DEFAULT '-', " +
      "skor REAL, catatan TEXT DEFAULT '', created_at TEXT, updated_at TEXT, actor TEXT)",
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_nilai_ctx ON nilai(siswa_id, kelas, jenis, kode)",
    "CREATE INDEX IF NOT EXISTS ix_nilai_ctx ON nilai(kelas, jenis, kode)",

    "CREATE TABLE IF NOT EXISTS konfig (" +
      "grp TEXT NOT NULL, k TEXT NOT NULL, label TEXT NOT NULL, " +
      "aktif INTEGER NOT NULL DEFAULT 1, urut INTEGER NOT NULL DEFAULT 0, " +
      "parent TEXT DEFAULT '', updated_at TEXT, PRIMARY KEY (grp, k))",

    "CREATE TABLE IF NOT EXISTS log (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, actor TEXT, action TEXT, " +
      "entity TEXT, entity_id TEXT, before TEXT, after TEXT, request_id TEXT)",
    "CREATE INDEX IF NOT EXISTS ix_log_id ON log(id)",

    "CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)",
    "CREATE TABLE IF NOT EXISTS session (token TEXT PRIMARY KEY, actor TEXT, exp INTEGER)"
  ];

  async function ensure(db) {
    /* Jalur cepat: skema sudah versi terkini → 1 query ringan, tanpa DDL. */
    try {
      var rows = await db.all("SELECT v FROM meta WHERE k = 'schema_version'");
      if (rows.length && Number(rows[0].v) >= VERSION) return VERSION;
    } catch (e) { /* tabel meta belum ada → jalankan DDL di bawah */ }
    await db.exec(DDL);
    await db.run(
      "INSERT INTO meta (k, v) VALUES ('schema_version', ?) " +
      "ON CONFLICT(k) DO UPDATE SET v = excluded.v",
      [String(VERSION)]
    );
    return VERSION;
  }

  return { VERSION: VERSION, DDL: DDL, ensure: ensure };
})();
