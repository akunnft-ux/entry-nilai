/* ============================================================================
 * test/run_backend_tests.js — harness mock Apps Script + tes fungsional backend.
 *
 * Menjalankan Code.gs pada Node murni dengan mock Spreadsheet/Cache/Props/etc.
 * Bukti "executed" (QA skill): logika di apps-script/Code.gs benar-benar
 * dieksekusi, bukan hanya dibaca. Bukan pengganti uji di Apps Script asli —
 * lihat docs/qa-test-plan.md utk langkah uji E2E di lingkungan Google.
 *
 * Jalankan:  node test/run_backend_tests.js
 * ============================================================================ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

let PASS = 0, FAIL = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { PASS++; console.log("  PASS  " + name); }
  else { FAIL++; failures.push(name + (detail ? " :: " + detail : "")); console.log("  FAIL  " + name + (detail ? " :: " + detail : "")); }
}

/* ----------------------------------------------------------------------------
 * In-memory Sheet / Range / Spreadsheet
 * ------------------------------------------------------------------------- */
class FakeRange {
  constructor(sheet, r1, c1, r2, c2) { this.sheet = sheet; this.r1 = r1; this.c1 = c1; this.r2 = r2; this.c2 = c2; }
  _slice() {
    const rows = this.sheet.data, out = [];
    for (let r = this.r1 - 1; r <= Math.min(this.r2 - 1, rows.length - 1); r++) {
      const row = rows[r] || [];
      out.push([]);
      for (let c = this.c1 - 1; c <= this.c2 - 1; c++) out[out.length - 1].push(row[c] !== undefined ? row[c] : "");
    }
    return out;
  }
  getValue() { const m = this._slice(); return (m[0]||[])[0]; }
  getValues() { return this._slice(); }
  setValue(v) { this.sheet.ensureRows(this.r1, this.c1)[this.r1 - 1][this.c1 - 1] = v; }
  setValues(vals) { for (let i = 0; i < vals.length; i++) for (let j = 0; j < vals[i].length; j++) this.sheet.ensureRows(this.r1 + i, this.c1 + j)[this.r1 + i - 1][this.c1 + j - 1] = vals[i][j]; }
}

class FakeSheet {
  constructor(name) { this.name = name; this.data = []; }
  getName() { return this.name; }
  getLastRow() { return this.data.length; }
  getLastColumn() { let m = 0; this.data.forEach((r) => { m = Math.max(m, r.length); }); return m; }
  ensureRows(r, c) { while (this.data.length < r) this.data.push([]); const row = this.data[r - 1]; while (row.length < c) row.push(""); return this.data; }
  getRange(a, b, c, d) {
    if (typeof a === "number" && typeof b === "number") return new FakeRange(this, a, b, c ? a + c - 1 : a, d ? b + d - 1 : b);
    throw new Error("getRange(a1) not supported in mock");
  }
  appendRow(row) { this.data.push(row.slice()); return this; }
  deleteRow(r) { if (r >= 1 && r <= this.data.length) this.data.splice(r - 1, 1); }
}

const sheets = {};
function makeSpreadsheet() {
  return {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => { sheets[n] = new FakeSheet(n); return sheets[n]; },
    getSheets: () => Object.keys(sheets).map((k) => sheets[k])
  };
}
function resetSheets() { Object.keys(sheets).forEach((k) => delete sheets[k]); }

/* ----------------------------------------------------------------------------
 * State
 * ------------------------------------------------------------------------- */
const cacheStore = new Map();
const propsStore = new Map();
function freshState() { resetSheets(); cacheStore.clear(); propsStore.clear(); }

const api = {
  SpreadsheetApp: { getActiveSpreadsheet: makeSpreadsheet, openById: makeSpreadsheet },
  CacheService: {
    getScriptCache: () => ({
      get: (k) => { const e = cacheStore.get(k); if (!e) return null; if (Date.now() >= e.exp) { cacheStore.delete(k); return null; } return e.v; },
      put: (k, v, sec) => { cacheStore.set(k, { v: String(v), exp: Date.now() + sec * 1000 }); },
      remove: (k) => { cacheStore.delete(k); }
    })
  },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => propsStore.has(k) ? propsStore.get(k) : null,
      setProperty: (k, v) => { propsStore.set(k, String(v)); },
      removeProperty: (k) => { propsStore.delete(k); }
    })
  },
  ContentService: {
    MimeType: { JSON: "application/json", JAVASCRIPT: "text/javascript" },
    createTextOutput: (text) => ({ text: String(text), _mime: null, setMimeType(m) { this._mime = m; return this; } })
  },
  Utilities: {
    Charset: { UTF_8: "utf-8" },
    DigestAlgorithm: { SHA_256: "SHA-256" },
    getUuid: () => crypto.randomBytes(16).toString("hex"),
    computeDigest: (algo, str) => {
      const buf = crypto.createHash("sha256").update(String(str), "utf8").digest();
      const arr = new Array(buf.length);
      for (let i = 0; i < buf.length; i++) { let b = buf[i]; arr[i] = b > 127 ? b - 256 : b; }
      return arr;
    }
  },
  Logger: { log: () => {} }
};
const shaH = (s) => crypto.createHash("sha256").update(String(s), "utf8").digest("hex");

/* ----------------------------------------------------------------------------
 * Load Code.gs
 * ------------------------------------------------------------------------- */
const sandbox = { ...api, console, Date, Math, JSON, String, Array, Object, Number, RegExp, isNaN, isFinite, parseInt, parseFloat };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8"), sandbox, { filename: "Code.gs" });

function call(action, payload, tk) {
  const body = { a: action };
  if (payload) Object.keys(payload).forEach((k) => { body[k] = payload[k]; });
  if (tk) body.token = tk;
  return JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify(body) }, parameter: {} }).text);
}
function pub(action, payload) { return call(action, payload, null); }

/* ============================================================================
 * TESTS
 * ==========================================================================*/
let token = null;
let ahmad = null, budi = null, citra = null, dodi = null;

console.log("\n[1] Setup & schema");
freshState();
{
  const r = pub("ping", {});
  ok("ping ok", r.ok === true, JSON.stringify(r));
  ok("ping melaporkan sheetOk", r.data && r.data.sheetOk === true);
  ok("ensureSchema membuat 4 sheet", Object.keys(sheets).length === 4, Object.keys(sheets).join(","));
}

console.log("\n[2] Auth");
{
  const r0 = pub("auth.verify", { pin: "0".repeat(64) });
  ok("verify tanpa PIN_HASH → PIN_NOT_CONFIGURED", r0.ok === false && r0.error.code === "PIN_NOT_CONFIGURED");
  vm.runInContext('SETUP_setPin("1234")', sandbox);
  const okPin = pub("auth.verify", { pin: shaH("1234") });
  ok("verify PIN benar → token", okPin.ok === true && !!okPin.data.token, JSON.stringify(okPin));
  token = okPin.data.token;
  ok("expiresAt di masa depan", typeof okPin.data.expiresAt === "number" && okPin.data.expiresAt > Date.now());
  const bad = pub("auth.verify", { pin: shaH("9999") });
  ok("verify PIN salah → INVALID_PIN (tanpa detail)", bad.ok === false && bad.error.code === "INVALID_PIN" && !bad.error.details);
  const noTok = call("meta.get", {}, null);
  ok("endpoint data tanpa token → INVALID_TOKEN", noTok.ok === false && noTok.error.code === "INVALID_TOKEN");
  const withTok = call("meta.get", {}, token);
  ok("meta.get dengan token → ok", withTok.ok === true && !!withTok.data.kelas);

  for (let i = 0; i < 5; i++) pub("auth.verify", { pin: shaH("1111") });
  const rl = pub("auth.verify", { pin: shaH("1234") });
  ok("attempt ke-6 → RATE_LIMITED + retryIn", rl.ok === false && rl.error.code === "RATE_LIMITED" && rl.error.retryIn > 0, JSON.stringify(rl));
  /* bersihkan bucket rate-limit auth utk skenario berikut */
  sandbox.CacheService.getScriptCache().remove("RL:AUTH");
}

console.log("\n[3] Konfig master");
{
  const s1 = call("konfig.save", { entries: [{ group: "kelas", key: "7A", label: "7A" }] }, token);
  ok("save kelas 7A", s1.ok === true && s1.data.saved === 1, JSON.stringify(s1));
  call("konfig.save", { entries: [{ group: "jenis", key: "UH", label: "Ulangan Harian" }] }, token);
  call("konfig.save", { entries: [{ group: "kode", key: "UH-1", label: "UH ke-1", parent: "UH" }] }, token);
  const list = call("konfig.list", {}, token);
  ok("konfig.list berisi 3 entri", list.ok === true && list.data.entries.length === 3);
  const bad = call("konfig.save", { entries: [{ group: "jenis", key: "A B C D E F G H I J K L M N O P Q R S T U V", label: "x" }] }, token);
  ok("key >40 karakter → KEY_INVALID skip", bad.ok === true && bad.data.skipped.length === 1 && bad.data.skipped[0].reason === "KEY_INVALID");
}

console.log("\n[4] Master siswa");
{
  const s = call("siswa.save", {
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

  const badName = call("siswa.save", { records: [{ nis: "1099", nama: null, kelas: "7A" }] }, token);
  ok("nama null → skipped NAMA_INVALID (bukan disimpan 'null')", badName.ok === true && badName.data.skipped.some((x) => x.reason === "NAMA_INVALID"), JSON.stringify(badName.data));

  const all = call("siswa.list", {}, token);
  ok("siswa.list → 3 siswa", all.ok === true && all.data.siswa.length === 3);
  ahmad = all.data.siswa.find((x) => x.nis === "1001"); budi = all.data.siswa.find((x) => x.nis === "1002"); citra = all.data.siswa.find((x) => x.nis === "1003");
  ok("row index TIDAK bocor ke publik (internal readSiswa_)", ahmad && ahmad.row === undefined, JSON.stringify(Object.keys(ahmad || {})));

  const st = call("siswa.save", { records: [{ id: budi.id, status: "nonaktif" }] }, token);
  ok("partial update status → updated 1", st.ok === true && st.data.updated === 1, JSON.stringify(st.data));
  const nonaktif = call("siswa.list", { status: "nonaktif" }, token);
  ok("siswa.list status=nonaktif → 1", nonaktif.ok === true && nonaktif.data.siswa.length === 1);
  const aktif = call("siswa.list", { kelas: "7A", status: "aktif" }, token);
  ok("siswa.list aktif 7A → 2 (tanpa Budi)", aktif.ok === true && aktif.data.siswa.length === 2);

  const dup = call("siswa.save", { records: [{ id: citra.id, nis: "1001", nama: "Citra", kelas: "7A" }] }, token);
  ok("ubah NIS jadi duplikat → skipped DUPLICATE_NIS", dup.ok === true && dup.data.skipped.some((x) => x.reason === "DUPLICATE_NIS"));
}

console.log("\n[5] Nilai bulk upsert");
{
  const d = call("siswa.save", { records: [{ nis: "1004", nama: "Dodi Prasetyo", kelas: "7A" }] }, token);
  ok("tambah Dodi (persiapan)", d.ok === true && d.data.saved === 1);
  const aktif = call("siswa.list", { status: "aktif" }, token);
  dodi = aktif.data.siswa.find((x) => x.nis === "1004");
  ahmad = aktif.data.siswa.find((x) => x.nis === "1001");
  citra = aktif.data.siswa.find((x) => x.nis === "1003");

  const b = call("nilai.bulkSave", {
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

  const n1 = call("nilai.list", { kelas: "7A", jenis: "UH", kode: "UH-1" }, token);
  ok("nilai.list → 2 nilai", n1.ok === true && n1.data.nilai.length === 2);
  const aRow = n1.data.nilai.find((x) => x.siswa_id === ahmad.id);
  ok("last-wins diterapkan Ahmad@60", aRow && aRow.skor === 60, JSON.stringify(aRow));

  const u = call("nilai.bulkSave", {
    kelas: "7A", jenis: "UH", kode: "UH-1",
    records: [{ siswa_id: citra.id, nilai: 95, catatan: "diperbaiki" }]
  }, token);
  ok("update Citra 92.5→95 → updated 1", u.ok === true && u.data.updated === 1, JSON.stringify(u.data));

  const del = call("nilai.bulkSave", {
    kelas: "7A", jenis: "UH", kode: "UH-1",
    records: [{ siswa_id: ahmad.id, nilai: null }]
  }, token);
  ok("nilai null → delete 1", del.ok === true && del.data.deleted === 1, JSON.stringify(del.data));

  const n2 = call("nilai.list", { kelas: "7A" }, token);
  ok("nilai tersisa 1 (Citra@95)", n2.ok === true && n2.data.nilai.length === 1 && n2.data.nilai[0].skor === 95);
}

console.log("\n[6] Rekap & CSV data");
{
  const r = call("rekap.get", { kelas: "7A" }, token);
  ok("rekap.get → rows=3 aktif (tanpa Budi nonaktif)", r.ok === true && r.data.rows.length === 3, JSON.stringify({ rows: r.data.rows.map((x) => x.nama), cols: r.data.columns }));
  ok("rekap.columns memuat UH-1", r.data.columns.length === 1 && r.data.columns[0].kode === "UH-1");
  ok("rekap.stats terisi 1 dari 3", r.data.stats && r.data.stats[0].terisi === 1 && r.data.stats[0].total === 3, JSON.stringify(r.data.stats));
  const bad = call("rekap.get", { kelas: "Z9" }, token);
  ok("rekap kelas tak dikenal → INVALID_KELAS", bad.ok === false && bad.error.code === "INVALID_KELAS");
}

console.log("\n[7] Konfig proteksi hapus & status aktif");
{
  const rmKelas = call("konfig.remove", { group: "kelas", key: "7A" }, token);
  ok("hapus kelas yg dipakai 4 siswa → CONFIG_IN_USE", rmKelas.ok === false && rmKelas.error.code === "CONFIG_IN_USE" && String(rmKelas.error.details) === "4", JSON.stringify(rmKelas));
  const rmJenis = call("konfig.remove", { group: "jenis", key: "UH" }, token);
  ok("hapus jenis yg punya kode turunan → CONFIG_IN_USE", rmJenis.ok === false && rmJenis.error.code === "CONFIG_IN_USE");
  const rmKode = call("konfig.remove", { group: "kode", key: "UH-1" }, token);
  ok("hapus kode yg dipakai nilai → CONFIG_IN_USE", rmKode.ok === false && rmKode.error.code === "CONFIG_IN_USE");

  const deact = call("konfig.deactivate", { group: "kode", key: "UH-1" }, token);
  ok("deactivate kode → ok", deact.ok === true && deact.data.deactivated === true);
  const rekap2 = call("rekap.get", { kelas: "7A" }, token);
  ok("rekap menandai kolom archived", rekap2.ok === true && rekap2.data.columns[0].archived === true);

  const bulkOff = call("nilai.bulkSave", {
    kelas: "7A", jenis: "UH", kode: "UH-1",
    records: [{ siswa_id: citra.id, nilai: 99 }]
  }, token);
  ok("entry nilai utk kode nonaktif → ditolak INVALID_FILTER", bulkOff.ok === false && bulkOff.error.code === "INVALID_FILTER");

  call("konfig.save", { entries: [{ group: "kode", key: "UH-2", label: "UH ke-2", parent: "UH" }] }, token);
  const offSiswa = call("nilai.bulkSave", {
    kelas: "7A", jenis: "UH", kode: "UH-2",
    records: [{ siswa_id: budi.id, nilai: 80 }]
  }, token);
  ok("entry nilai utk siswa nonaktif → SISWA_INACTIVE skip", offSiswa.ok === true && offSiswa.data.skipped.some((x) => x.reason === "SISWA_INACTIVE"), JSON.stringify(offSiswa.data));

  const emptyRow = call("nilai.bulkSave", {
    kelas: "7A", jenis: "UH", kode: "UH-2",
    records: [{ siswa_id: "", nilai: 50 }]
  }, token);
  ok("siswa_id kosong → INVALID_ROW", emptyRow.ok === true && emptyRow.data.skipped.some((r) => r.reason === "INVALID_ROW"));
}

console.log("\n[8] Log audit");
{
  const l = call("log.list", {}, token);
  ok("log.list → entries", l.ok === true && l.data.entries.length > 0, JSON.stringify(l.data.entries.length));
  const acts = l.data.entries.map((e) => e.action);
  ok("entri log punya before/after JSON", l.data.entries[0].hasOwnProperty("before") && l.data.entries[0].hasOwnProperty("after"));
  ok("log berisi aksi penting", ["LOGIN_OK", "INSERT", "UPDATE", "DELETE", "DEACTIVATE", "CONFIG_SAVE"].some((a) => acts.includes(a)), acts.slice(0, 10).join(","));
}

console.log("\n[9] Ganti PIN");
{
  const wrong = call("settings.changePin", { oldPin: shaH("0000"), newPin: shaH("9999") }, token);
  ok("PIN lama salah → INVALID_OLD_PIN", wrong.ok === false && wrong.error.code === "INVALID_OLD_PIN");
  const same = call("settings.changePin", { oldPin: shaH("1234"), newPin: shaH("1234") }, token);
  ok("PIN baru = PIN lama → WEAK_PIN", same.ok === false && same.error.code === "WEAK_PIN");
  const ok1 = call("settings.changePin", { oldPin: shaH("1234"), newPin: shaH("5678") }, token);
  ok("ganti PIN benar → changed", ok1.ok === true && ok1.data.changed === true);
  const oldLogin = pub("auth.verify", { pin: shaH("1234") });
  ok("PIN lama tak berlaku lagi → INVALID_PIN", oldLogin.ok === false && oldLogin.error.code === "INVALID_PIN", JSON.stringify(oldLogin));
  const newToken = pub("auth.verify", { pin: shaH("5678") });
  ok("PIN baru berlaku (token baru)", newToken.ok === true && !!newToken.data.token);
}

console.log("\n[10] Permintaan tanpa action / tidak dikenal");
{
  const ua = call("tidak.ada", {}, token);
  ok("aksi tak dikenal → UNKNOWN_ACTION", ua.ok === false && ua.error.code === "UNKNOWN_ACTION");
  const lg = call("auth.logout", {}, token);
  ok("logout → done", lg.ok === true && lg.data.done === true);
}

console.log("\n==============================================");
console.log("PASS: " + PASS + "  FAIL: " + FAIL);
if (failures.length) { console.log("\nGagal:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("Semua tes backend lolos.");