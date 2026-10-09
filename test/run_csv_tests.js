/* ============================================================================
 * test/run_csv_tests.js — uji App.csv (parser + mapping impor siswa, FR-010).
 *
 * Menjalankan js/csv.js di Node murni (vm) dengan shim `window` = sandbox
 * global, tanpa DOM. Membuktikan logika parse & validasi benar-benar dieksekusi.
 *
 * Jalankan:  node test/run_csv_tests.js
 * ========================================================================== */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let PASS = 0, FAIL = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { PASS++; console.log("  PASS  " + name); }
  else { FAIL++; failures.push(name + (detail ? " :: " + detail : "")); console.log("  FAIL  " + name + (detail ? " :: " + detail : "")); }
}

const sandbox = { console };
sandbox.window = sandbox;                 /* window === global → `App` resolve */
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "js", "csv.js"), "utf8"),
  sandbox,
  { filename: "csv.js" }
);
const csv = sandbox.App.csv;

console.log("\n[1] Parser CSV");
{
  const a = csv.parse("a,b,c\r\n1,2,3");
  ok("baris CRLF → 2 baris", a.length === 2, JSON.stringify(a));
  ok("sel sederhana", a[0].length === 3 && a[0][2] === "c" && a[1][0] === "1", JSON.stringify(a));

  const q = csv.parse('"a,b",c\n"quote ""x""",d');
  ok("koma dalam quote", q[0][0] === "a,b" && q[0][1] === "c", JSON.stringify(q));
  ok("escaped quote", q[1][0] === 'quote "x"' && q[1][1] === "d", JSON.stringify(q));

  const bom = csv.parse("\ufeffnis,nama\n1,A");
  ok("BOM dibuang dari header", bom[0][0] === "nis" && bom[0][1] === "nama", JSON.stringify(bom[0]));

  const empty = csv.parse("a,b\n\n , \n1,2\n");
  ok("baris kosong diabaikan (3 baris bermakna)", empty.length === 2, JSON.stringify(empty));
  ok("tanpa newline akhir tetap terbaca", csv.parse("x,y").length === 1);
  ok("field quote mid-teks tidak dianggap quote", csv.parse('ab"cd,e')[0][0] === 'ab"cd', JSON.stringify(csv.parse('ab"cd,e')));
}

console.log("\n[2] Mapping dasar & update-by-NIS");
{
  const existing = [{ id: "S-1", nis: "1001", nama: "Ahmad", kelas: "7A", status: "aktif" }];
  const rows = [
    ["nis", "nama", "kelas", "status"],
    ["1001", "Ahmad Fauzi", "7A", "aktif"],
    ["1002", "Budi Santoso", "7A", ""]
  ];
  const m = csv.mapSiswa(rows, [{ key: "7A" }], existing);
  ok("tanpa error", !m.error);
  ok("2 stats.baru=1 update=1", m.stats.baru === 1 && m.stats.update === 1, JSON.stringify(m.stats));
  ok("baris NIS lama diberi id (update)", m.records[0].id === "S-1" && m.records[0].nama === "Ahmad Fauzi", JSON.stringify(m.records[0]));
  ok("status kosong → aktif", m.records[1].status === "aktif" && m.records[1].id === undefined, JSON.stringify(m.records[1]));
}

console.log("\n[3] Validasi per baris");
{
  const rows = [
    ["NIS", "Nama", "Kelas", "Status"],   /* header case-insensitive */
    ["2001", "Valid Siswa", "7A", "aktif"],
    ["2002", "A", "7A", "aktif"],                          /* nama < 2 */
    ["2003", "Nama Ok", "9Z", "aktif"],                    /* kelas tak dikenal */
    ["2004", "Nama Ok", "7A", "alumni"],                   /* status invalid */
    ["2005", "Nama Ok", "7A", "aktif"],
    ["2005", "Ganda Nis", "7A", "aktif"],                  /* NIS ganda → ditandai */
    ["", "Tanpa Nis", "7A", "nonaktif"],                   /* NIS kosong = valid */
    ["2006", "X".repeat(81), "7A", "aktif"]                /* nama > 80 */
  ];
  const m = csv.mapSiswa(rows, [{ key: "7A" }], []);
  ok("3 valid (2001, 2005, tanpa-nis)", m.stats.baru === 3, JSON.stringify(m.stats));
  ok("invalid terhitung 5", m.stats.invalid === 5, JSON.stringify(m.invalid.map((x) => x.reason)));
  ok("nama pendek invalid", m.invalid.some((x) => x.reason.indexOf("2–80") !== -1));
  ok("kelas tak dikenal invalid", m.invalid.some((x) => x.reason.indexOf("Kelas tidak dikenal") !== -1));
  ok("status invalid ditolak", m.invalid.some((x) => x.reason.indexOf("Status") !== -1));
  ok("NIS ganda ditandai", m.invalid.some((x) => x.reason.indexOf("ganda") !== -1));
  ok("nama >80 invalid", m.invalid.some((x) => x.line === 9));
  ok("status nonaktif diterima", m.records.some((r) => r.nama === "Tanpa Nis" && r.status === "nonaktif"));
}

console.log("\n[4] Header & file kosong");
{
  ok("header tanpa nama/kelas → HEADER_INVALID", csv.mapSiswa([["nis", "status"], ["1", "aktif"]], [], []).error === "HEADER_INVALID");
  ok("file tanpa baris → FILE_KOSONG", csv.mapSiswa([], [], []).error === "FILE_KOSONG");
}

console.log("\n==============================================");
console.log("PASS: " + PASS + "  FAIL: " + FAIL);
if (failures.length) { console.log("\nGagal:"); failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
console.log("Semua tes CSV lolos.");
