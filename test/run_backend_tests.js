/* ============================================================================
 * test/run_backend_tests.js — harness tes backend (offline).
 *
 * Menjalankan js/backend/engine.js di Node murni di atas SQLite in-memory
 * (better-sqlite3). Logika backend benar-benar DIEKSEKUSI — bukan sekadar
 * dibaca — dan kontrak API (envelope + registry aksi) identik dengan yang
 * dipakai di browser. Bukan pengganti uji E2E di browser asli — lihat
 * docs/qa-test-plan.md.
 *
 * Jalankan:  npm test   (dari folder test/)  atau  node test/run_backend_tests.js
 * ============================================================================ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const Database = require("better-sqlite3");

let PASS = 0, FAIL = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { PASS++; console.log("  PASS  " + name); }
  else { FAIL++; failures.push(name + (detail ? " :: " + detail : "")); console.log("  FAIL  " + name + (detail ? " :: " + detail : "")); }
}
const shaH = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");

/* ----------------------------------------------------------------------------
 * Adapter SQLite in-memory (antarmuka db: all/run/batch/exec)
 * ------------------------------------------------------------------------- */
const raw = new Database(":memory:");
const DB = { calls: 0, detail: {} };
function count(kind) { DB.calls++; DB.detail[kind] = (DB.detail[kind] || 0) + 1; }
const db = {
  async all(sql, args) { count("all"); return raw.prepare(sql).all(...(args || [])); },
  async run(sql, args) {
    count("run");
    const info = raw.prepare(sql).run(...(args || []));
    return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
  },
  async batch(stmts) {
    count("batch");
    const out = [];
    for (const s of stmts) {
      const st = raw.prepare(s.sql);
      if (st.reader) out.push({ rows: st.all(...(s.args || [])) });
      else out.push({ changes: st.run(...(s.args || [])).changes });
    }
    return out;
  },
  async exec(list) { count("exec"); for (const sql of list) raw.exec(sql); }
};
function resetCount() { DB.calls = 0; DB.detail = {}; }

/* ----------------------------------------------------------------------------
 * Muat js/ (config + backend) ke sandbox dengan `window`
 * ------------------------------------------------------------------------- */
const sandbox = {
  console, Date, Math, JSON, String, Array, Object, Number, RegExp,
  isNaN, isFinite, parseInt, parseFloat, Promise, setTimeout, clearTimeout,
  crypto: crypto.webcrypto
};
sandbox.window = sandbox;
vm.createContext(sandbox);
["js/config.js", "js/backend/schema.js", "js/backend/engine.js"].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), sandbox, { filename: f });
});

const engine = sandbox.App.backend.create(db, {
  sha256: (s) => shaH(s),
  uuid: () => crypto.randomUUID().replace(/-/g, "")
});

let token = null;
let ahmad = null, budi = null, citra = null, dodi = null;

async function call(action, payload, tk) {
  const body = { a: action };
  if (payload) Object.keys(payload).forEach((k) => { body[k] = payload[k]; });
  if (tk) body.token = tk;
  return engine.handle(body);
}
function pub(action, payload) { return call(action, payload, null); }

/* ============================================================================
 * TESTS
 * ==========================================================================*/
(async function main() {
  console.log("\n[1] Setup & schema");
  await engine.init();
  {
    const r = await pub("ping", {});
    ok("ping ok", r.ok === true, JSON.stringify(r));
    ok("ping melaporkan sheetOk", r.data && r.data.sheetOk === true);
    const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((x) => x.name);
    ok("ensureSchema membuat tabel inti", ["siswa", "nilai", "konfig", "log", "meta"].every((t) => tables.includes(t)), tables.join(","));
  }

  console.log("\n[2] Auth");
  {
    const r0 = await pub("auth.verify", { pin: "0".repeat(64) });
    ok("verify tanpa PIN_HASH → PIN_NOT_CONFIGURED", r0.ok === false && r0.error.code === "PIN_NOT_CONFIGURED");
    await engine.setPin("1234");
    const okPin = await pub("auth.verify", { pin: shaH("1234") });
    ok("verify PIN benar → token", okPin.ok === true && !!okPin.data.token, JSON.stringify(okPin));
    token = okPin.data.token;
    ok("expiresAt di masa depan", typeof okPin.data.expiresAt === "number" && okPin.data.expiresAt > Date.now());
    const bad = await pub("auth.verify", { pin: shaH("9999") });
    ok("verify PIN salah → INVALID_PIN (tanpa detail)", bad.ok === false && bad.error.code === "INVALID_PIN" && !bad.error.details);
    const noTok = await call("meta.get", {}, null);
    ok("endpoint data tanpa token → INVALID_TOKEN", noTok.ok === false && noTok.error.code === "INVALID_TOKEN");
    const withTok = await call("meta.get", {}, token);
    ok("meta.get dengan token → ok", withTok.ok === true && !!withTok.data.kelas);

    for (let i = 0; i < 5; i++) await pub("auth.verify", { pin: shaH("1111") });
    const rl = await pub("auth.verify", { pin: shaH("1234") });
    ok("attempt ke-6 → RATE_LIMITED + retryIn", rl.ok === false && rl.error.code === "RATE_LIMITED" && rl.error.retryIn > 0, JSON.stringify(rl));
    engine._rl["RL:AUTH"] = undefined;   /* bersihkan bucket rate-limit auth */
  }

  console.log("\n[3] Konfig master");
  {
    const s1 = await call("konfig.save", { entries: [{ group: "kelas", key: "7A", label: "7A" }] }, token);
    ok("save kelas 7A", s1.ok === true && s1.data.saved === 1, JSON.stringify(s1));
    await call("konfig.save", { entries: [{ group: "jenis", key: "UH", label: "Ulangan Harian" }] }, token);
    await call("konfig.save", { entries: [{ group: "kode", key: "UH-1", label: "UH ke-1", parent: "UH" }] }, token);
    const list = await call("konfig.list", {}, token);
    ok("konfig.list berisi 3 entri", list.ok === true && list.data.entries.length === 3);
    const bad = await call("konfig.save", { entries: [{ group: "jenis", key: "A B C D E F G H I J K L M N O P Q R S T U V", label: "x" }] }, token);
    ok("key >40 karakter → KEY_INVALID skip", bad.ok === true && bad.data.skipped.length === 1 && bad.data.skipped[0].reason === "KEY_INVALID");
  }

  console.log("\n[4] Master siswa");
  {
    const s = await call("siswa.save", {
      records: [
        { nis: "1001", nama: "Ahmad Fauzi", kelas: "7A", status: "aktif" },
        { nis: "1002", nama: "Budi Santoso", kelas: "7A", status: "aktif" },
        { nis: "1003", nama: "Citra Lestari", kelas: "7A", status: "aktif" },
        { nis: "1002", nama: "Duplikat NIS", kelas: "7A", status: "aktif" }
      ]
    }, token);
    ok("3 valid tersimpan (saved=3, inserted=3)", s.ok === true && s.data.saved === 3 && s.data.inserted === 3, JSON.stringify(s.data));
    ok("NIS duplikat → skipped DUPLICATE_NIS", s.data.skipped.some((x) => x.reason === "DUPLICATE_NIS"));
    ok("siswa valid semuanya (tanpa NAMA_INVALID)", !s.data.skipped.some((x) => x.reason === "NAMA_INVALID"));

    const badName = await call("siswa.save", { records: [{ nis: "1099", nama: null, kelas: "7A" }] }, token);
    ok("nama null → skipped NAMA_INVALID (bukan disimpan 'null')", badName.ok === true && badName.data.skipped.some((x) => x.reason === "NAMA_INVALID"), JSON.stringify(badName.data));

    const all = await call("siswa.list", {}, token);
    ok("siswa.list → 3 siswa", all.ok === true && all.data.siswa.length === 3);
    ahmad = all.data.siswa.find((x) => x.nis === "1001"); budi = all.data.siswa.find((x) => x.nis === "1002"); citra = all.data.siswa.find((x) => x.nis === "1003");
    ok("row index TIDAK bocor ke publik", ahmad && ahmad.row === undefined, JSON.stringify(Object.keys(ahmad || {})));

    const st = await call("siswa.save", { records: [{ id: budi.id, status: "nonaktif" }] }, token);
    ok("partial update status → updated 1", st.ok === true && st.data.updated === 1, JSON.stringify(st.data));
    const nonaktif = await call("siswa.list", { status: "nonaktif" }, token);
    ok("siswa.list status=nonaktif → 1", nonaktif.ok === true && nonaktif.data.siswa.length === 1);
    const aktif = await call("siswa.list", { kelas: "7A", status: "aktif" }, token);
    ok("siswa.list aktif 7A → 2 (tanpa Budi)", aktif.ok === true && aktif.data.siswa.length === 2);

    const dup = await call("siswa.save", { records: [{ id: citra.id, nis: "1001", nama: "Citra", kelas: "7A" }] }, token);
    ok("ubah NIS jadi duplikat → skipped DUPLICATE_NIS", dup.ok === true && dup.data.skipped.some((x) => x.reason === "DUPLICATE_NIS"));
  }

  console.log("\n[5] Nilai bulk upsert");
  {
    const d = await call("siswa.save", { records: [{ nis: "1004", nama: "Dodi Prasetyo", kelas: "7A" }] }, token);
    ok("tambah Dodi (persiapan)", d.ok === true && d.data.saved === 1);
    const aktif = await call("siswa.list", { status: "aktif" }, token);
    dodi = aktif.data.siswa.find((x) => x.nis === "1004");
    ahmad = aktif.data.siswa.find((x) => x.nis === "1001");
    citra = aktif.data.siswa.find((x) => x.nis === "1003");

    const b = await call("nilai.bulkSave", {
      kelas: "7A", jenis: "UH", kode: "UH-1",
      records: [
        { siswa_id: ahmad.id, nilai: 85, catatan: "" },
        { siswa_id: citra.id, nilai: 92.5, catatan: "bagus" },
        { siswa_id: ahmad.id, nilai: 60, catatan: "yang terakhir menang" },
        { siswa_id: dodi.id, nilai: 101, catatan: "" },
        { siswa_id: "S-TIDAKADA", nilai: 50, catatan: "" }
      ]
    }, token);
    ok("insert 2 (last-wins: Ahmad@60, Citra@92.5)", b.ok === true && b.data.inserted === 2 && b.data.updated === 0, JSON.stringify(b.data));
    ok("duplikat batch yg awal → DUPLICATE_IN_BATCH", b.data.skipped.some((x) => x.reason === "DUPLICATE_IN_BATCH"));
    ok("skip skor>100 → INVALID_SCORE", b.data.skipped.some((x) => x.siswa_id === dodi.id && x.reason === "INVALID_SCORE"));
    ok("skip siswa tak dikenal → SISWA_NOT_FOUND", b.data.skipped.some((x) => x.reason === "SISWA_NOT_FOUND"));

    const n1 = await call("nilai.list", { kelas: "7A", jenis: "UH", kode: "UH-1" }, token);
    ok("nilai.list → 2 nilai", n1.ok === true && n1.data.nilai.length === 2);
    const aRow = n1.data.nilai.find((x) => x.siswa_id === ahmad.id);
    ok("last-wins diterapkan Ahmad@60", aRow && aRow.skor === 60, JSON.stringify(aRow));

    const u = await call("nilai.bulkSave", {
      kelas: "7A", jenis: "UH", kode: "UH-1",
      records: [{ siswa_id: citra.id, nilai: 95, catatan: "diperbaiki" }]
    }, token);
    ok("update Citra 92.5→95 → updated 1", u.ok === true && u.data.updated === 1, JSON.stringify(u.data));

    const del = await call("nilai.bulkSave", {
      kelas: "7A", jenis: "UH", kode: "UH-1",
      records: [{ siswa_id: ahmad.id, nilai: null }]
    }, token);
    ok("nilai null → delete 1", del.ok === true && del.data.deleted === 1, JSON.stringify(del.data));

    const n2 = await call("nilai.list", { kelas: "7A" }, token);
    ok("nilai tersisa 1 (Citra@95)", n2.ok === true && n2.data.nilai.length === 1 && n2.data.nilai[0].skor === 95, JSON.stringify(n2.data));
  }

  console.log("\n[6] Rekap & CSV data");
  {
    const r = await call("rekap.get", { kelas: "7A" }, token);
    ok("rekap.get → rows=3 aktif (tanpa Budi nonaktif)", r.ok === true && r.data.rows.length === 3, JSON.stringify({ rows: r.data.rows.map((x) => x.nama), cols: r.data.columns }));
    ok("rekap.columns memuat UH-1", r.data.columns.length === 1 && r.data.columns[0].kode === "UH-1");
    ok("rekap.stats terisi 1 dari 3", r.data.stats && r.data.stats[0].terisi === 1 && r.data.stats[0].total === 3, JSON.stringify(r.data.stats));
    const bad = await call("rekap.get", { kelas: "Z9" }, token);
    ok("rekap kelas tak dikenal → INVALID_KELAS", bad.ok === false && bad.error.code === "INVALID_KELAS");
  }

  console.log("\n[7] Konfig proteksi hapus & status aktif");
  {
    const rmKelas = await call("konfig.remove", { group: "kelas", key: "7A" }, token);
    ok("hapus kelas yg dipakai 4 siswa → CONFIG_IN_USE", rmKelas.ok === false && rmKelas.error.code === "CONFIG_IN_USE" && String(rmKelas.error.details) === "4", JSON.stringify(rmKelas));
    const rmJenis = await call("konfig.remove", { group: "jenis", key: "UH" }, token);
    ok("hapus jenis yg punya kode turunan → CONFIG_IN_USE", rmJenis.ok === false && rmJenis.error.code === "CONFIG_IN_USE");
    const rmKode = await call("konfig.remove", { group: "kode", key: "UH-1" }, token);
    ok("hapus kode yg dipakai nilai → CONFIG_IN_USE", rmKode.ok === false && rmKode.error.code === "CONFIG_IN_USE");

    const deact = await call("konfig.deactivate", { group: "kode", key: "UH-1" }, token);
    ok("deactivate kode → ok", deact.ok === true && deact.data.deactivated === true);
    const rekap2 = await call("rekap.get", { kelas: "7A" }, token);
    ok("rekap menandai kolom archived", rekap2.ok === true && rekap2.data.columns[0].archived === true);

    const bulkOff = await call("nilai.bulkSave", {
      kelas: "7A", jenis: "UH", kode: "UH-1",
      records: [{ siswa_id: citra.id, nilai: 99 }]
    }, token);
    ok("entry nilai utk kode nonaktif → ditolak INVALID_FILTER", bulkOff.ok === false && bulkOff.error.code === "INVALID_FILTER");

    await call("konfig.save", { entries: [{ group: "kode", key: "UH-2", label: "UH ke-2", parent: "UH" }] }, token);
    const offSiswa = await call("nilai.bulkSave", {
      kelas: "7A", jenis: "UH", kode: "UH-2",
      records: [{ siswa_id: budi.id, nilai: 80 }]
    }, token);
    ok("entry nilai utk siswa nonaktif → SISWA_INACTIVE skip", offSiswa.ok === true && offSiswa.data.skipped.some((x) => x.reason === "SISWA_INACTIVE"), JSON.stringify(offSiswa.data));

    const emptyRow = await call("nilai.bulkSave", {
      kelas: "7A", jenis: "UH", kode: "UH-2",
      records: [{ siswa_id: "", nilai: 50 }]
    }, token);
    ok("siswa_id kosong → INVALID_ROW", emptyRow.ok === true && emptyRow.data.skipped.some((r) => r.reason === "INVALID_ROW"));
  }

  console.log("\n[8] Log audit");
  {
    const l = await call("log.list", {}, token);
    ok("log.list → entries", l.ok === true && l.data.entries.length > 0, JSON.stringify(l.data.entries.length));
    const acts = l.data.entries.map((e) => e.action);
    ok("entri log punya before/after JSON", l.data.entries[0].hasOwnProperty("before") && l.data.entries[0].hasOwnProperty("after"));
    ok("log berisi aksi penting", ["LOGIN_OK", "INSERT", "UPDATE", "DELETE", "DEACTIVATE", "CONFIG_SAVE"].some((a) => acts.includes(a)), acts.slice(0, 10).join(","));
  }

  console.log("\n[9] Ganti PIN");
  {
    const wrong = await call("settings.changePin", { oldPin: shaH("0000"), newPin: shaH("9999") }, token);
    ok("PIN lama salah → INVALID_OLD_PIN", wrong.ok === false && wrong.error.code === "INVALID_OLD_PIN");
    const same = await call("settings.changePin", { oldPin: shaH("1234"), newPin: shaH("1234") }, token);
    ok("PIN baru = PIN lama → WEAK_PIN", same.ok === false && same.error.code === "WEAK_PIN");
    const ok1 = await call("settings.changePin", { oldPin: shaH("1234"), newPin: shaH("5678") }, token);
    ok("ganti PIN benar → changed", ok1.ok === true && ok1.data.changed === true);
    const oldLogin = await pub("auth.verify", { pin: shaH("1234") });
    ok("PIN lama tak berlaku lagi → INVALID_PIN", oldLogin.ok === false && oldLogin.error.code === "INVALID_PIN", JSON.stringify(oldLogin));
    const newToken = await pub("auth.verify", { pin: shaH("5678") });
    ok("PIN baru berlaku (token baru)", newToken.ok === true && !!newToken.data.token);
  }

  console.log("\n[10] Permintaan tanpa action / tidak dikenal");
  {
    const ua = await call("tidak.ada", {}, token);
    ok("aksi tak dikenal → UNKNOWN_ACTION", ua.ok === false && ua.error.code === "UNKNOWN_ACTION");
    const lg = await call("auth.logout", {}, token);
    ok("logout → done", lg.ok === true && lg.data.done === true);
  }

  console.log("\n[11] Ukur round-trip DB per konfig.save");
  {
    const fresh = await pub("auth.verify", { pin: shaH("5678") });
    token = fresh.data.token;
    resetCount();   /* ukur SETELAH login */
    const resp = await call("konfig.save", { entries: [{ group: "kelas", key: "9D", label: "9D" }] }, token);
    console.log("    resp konfig.save(9D): " + JSON.stringify(resp));
    console.log("    panggilan DB: " + DB.calls + " " + JSON.stringify(DB.detail));
    ok("konfig.save 1 kelas: hemat round-trip (≤4)", DB.calls <= 4 && resp.ok === true, JSON.stringify(DB.detail));
    ok("tulis dikelompokkan (≤1 batch + 1 log)", DB.detail.batch <= 1 && (DB.detail.run || 0) <= 1, JSON.stringify(DB.detail));
  }

  console.log("\n==============================================");
  console.log("PASS: " + PASS + "  FAIL: " + FAIL);
  if (failures.length) { console.log("\nGagal:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
  console.log("Semua tes backend lolos.");
})().catch((e) => { console.error(e); process.exit(1); });
