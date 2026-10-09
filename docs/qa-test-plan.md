# QA Test Plan & Hasil (Phase 7)

Status: **Draft ditulis setelah eksekusi** · Metode: `read-code` + `run-harness`.
Kriteria skill qa-tester-pro: tidak ada status `PASS` tanpa observasi.

---

## 1. Hasil eksekusi: Tes Fungsional Backend (harness SQLite offline)

Logika `js/backend/engine.js` dieksekusi pada Node murni di atas **SQLite
in-memory** (`better-sqlite3`). Ini **bukan** pengganti uji E2E di browser
asli; itu ada di §5.

- Command: `node test/run_backend_tests.js` (atau `cd test && npm test`)
- Hasil: **60 PASS / 0 FAIL** (semua asersi lolos).
- Harness: `test/run_backend_tests.js` — memuat `js/config.js`,
  `js/backend/schema.js`, `js/backend/engine.js` via `vm` dengan adapter
  `db` (all/run/batch/exec) berbasis `better-sqlite3`.

### Cakupan skenario (60 asersi)

| Blok | Yang dibuktikan |
|---|---|
| [1] Setup & schema | `ping` ok + `sheetOk`; `ensureSchema` membuat tabel inti (`siswa`, `nilai`, `konfig`, `log`, `meta`) |
| [2] Auth | `PIN_NOT_CONFIGURED` saat PIN belum di-set; verify benar → token + `expiresAt`; salah → `INVALID_PIN` tanpa detail; tanpa token → `INVALID_TOKEN`; rate limit 5/15menit → `RATE_LIMITED` + `retryIn` |
| [3] Konfig master | save kelas/jenis/kode; `konfig.list`; key >40 → `KEY_INVALID` skip |
| [4] Master siswa | 3 insert valid; NIS duplikat → `DUPLICATE_NIS`; nama null → `NAMA_INVALID`; filter kelas/status; partial update status; ubah NIS jadi duplikat → skip |
| [5] Nilai bulk | upsert via kunci bisnis `(siswa_id,kelas,jenis,kode)`; last-wins utk duplikat batch (`DUPLICATE_IN_BATCH` utk yg awal); `INVALID_SCORE` (101); `SISWA_NOT_FOUND`; update; `nilai:null` → delete |
| [6] Rekap | rows = siswa aktif + nonaktif ber-nilai; kolom ekspektasi; stats denominator siswa aktif; `INVALID_KELAS` utk kelas tak dikenal |
| [7] Proteksi konfig | hapus kelas dipakai 4 siswa → `CONFIG_IN_USE`(details=4); jenis punya kode turunan → `CONFIG_IN_USE`; kode dipakai nilai → `CONFIG_IN_USE`; `deactivate` ok; rekap tandai `archived`; entry utk kode/ siswa nonaktif ditolak |
| [8] Log audit | `log.list` entries + field `before`/`after`; aksi penting tercatat |
| [9] Ganti PIN | `INVALID_OLD_PIN`; `WEAK_PIN` (same); sukses `changed`; PIN lama tak berlaku; PIN baru berlaku |
| [10] Edge request | aksi tak dikenal → `UNKNOWN_ACTION`; `auth.logout` → `done` |
| [11] Perf | tambah 1 kelas = **3 panggilan db** (`all` 1, `batch` 1, `run` 1) |

Pola assert dieksekusi, contoh asli:

```
ok("insert 2 (last-wins: Ahmad@60, Citra@92.5)",
   b.ok === true && b.data.inserted === 2 && b.data.updated === 0, JSON.stringify(b.data));
```

---

## 2. Bug nyata yang ditemukan QA harness (sudah diperbaiki)

| # | Lokasi | Gejala | Akar masalah | Perbaikan |
|---|---|---|---|---|
| 1 | `actionSiswaSave_` | `nama:null` tersimpan sebagai string `"null"` (lolos validasi 2–80) & NIS null jadi `"null"` | `String(null)` = `"null"` | helper `pick_()` null-safe di `Code.gs` → null dikosongkan → `NAMA_INVALID` |
| 2 | `nilai.bulkSave` | Duplikat batch: record **pertama** yang menang | dedupe `seen` menyimpan yg pertama | pastikan **record terakhir menang** (FR-004) via memori `lastIdx`; yg awal di-skip `DUPLICATE_IN_BATCH` |
| 3 | `rekap.get` stats | `total` denominator = jumlah baris nilai (bukan jumlah siswa) | hitung total dari baris nilai | denominator = jumlah **siswa aktif** |
| 4 | `konfigUsage_` | `jenis` yang punya kode turunan bisa dihapus ⇒ orphan kode | belum cek anak | jenis dikunci bila punya child kode (`CONFIG_IN_USE`) |

Hasil pinggir yang diverifikasi: `row` index **tidak bocor** di API publik
`siswa.list`/`rekap` (internal `readSiswa_` saja — sesuai ADR-004).

---

## 3. Verifikasi statis frontend (read-code)

Belum ada browser live (perlu Apps Script Web App + GitHub Pages (§5)).
Diverifikasi dari kode:

| Halaman | Yang dicek | Status |
|---|---|---|
| login | kirim `sha256(pin)`; `SETUP_setPin` saat `PIN_NOT_CONFIGURED`; form lock | PASS (baca) |
| entry | validasi input 0–100 maks 1 desimal; `nilai:null` = hapus; kirim `{kelas,jenis,kode}` ke `nilai.bulkSave`; chunk `BATCH_SIZE`; skipped ditampilkan (`s.message||s.reason`) | PASS (baca) |
| rekap | matriks render, kolom archived, legend, export CSV RFC4180 + anti-injection, footer `terisi/total` | PASS (baca) |
| siswa | CRUD/soft-delete, filter, aksi baris konsisten | PASS (baca) |
| pengaturan | 4 tab; konfig rows; deactivate/hapus; ganti PIN; log | PASS (baca) |
| CSS | semua class yang dipakai halaman ada di `css/` (grep verifikasi) | PASS (baca) |

Tidak ada test runner frontend di repo (tanpa framework, keputusan stack).
Uji fungsional browser tercakup di §5.

---

## 4. Performance (NFR-003, respons < 3s)

**DIUKUR (offline + smoke ke Turso asli).** Arsitektur v2 tidak punya server
aplikasi dan tidak ada *cold start*: browser berbicara langsung ke Turso
(libSQL) via satu endpoint HTTP `/v2/pipeline`. Setiap request API = 1–3
round-trip (setiap round-trip = 1 POST berisi banyak statement sekaligus).

Optimisasi yang diukur:
1. `schema.ensure` jalur cepat: cek `meta.schema_version` (1 query) → DDL
   dilewati bila skema sudah terkini.
2. `readKonfig` cache in-memory 10 dtk + invalidate saat konfig ditulis.
3. Log audit di-*queue* lalu flush **satu** `INSERT` multi-baris di akhir
   request (bebas biaya tambahan berapa pun banyak record).
4. `konfig.save` baca sekali + tulis satu `batch`.
5. Sesi diverifikasi dari cache in-memory (fallback 1 query ke tabel `session`).

**Hasil ukur harness [11]:** tambah 1 kelas = **3 panggilan db** (`all` 1,
`batch` 1, `run` 1 → ≤3 round-trip). **Smoke ke Turso asli** (region Sydney):
`init/schema`, `ping`, `konfig.save/list/remove` semua ok; RTT steady-state
≈ **210 ms/round-trip** dari lingkungan uji (jaringan Indonesia ≈ 100–150 ms).
`batch` 3 statement = 1 round-trip (biaya nyaris nol per statement tambahan).

> Catatan CORS: Turso mengirim `access-control-allow-origin: *` (tanpa
> `Access-Control-Max-Age`), sehingga tiap request dapat memicu preflight
> `OPTIONS` — sedikit menambah latensi tetapi tetap jauh di bawah batas 3 dtk.

---

## 5. Test plan E2E manual (eksekusi setelah deploy)

Dijalankan oleh operator (atau revisi lanjutan) setelah mengikuti
`docs/deployment.md`:

**Setup**
1. Salin `apps-script/Code.gs` ke project Apps Script baru; isi Script
   Properties `SPREADSHEET_ID` (opsional: `PIN_HASH`) dan `APP_PASSWORD`.
2. Deploy Web App: Execute as *Me*, access *Anyone*; catat URL.
3. Isi `EXEC_URL` di `js/config.js`; push cabang ke GitHub Pages.
4. Akses halaman → Login → tombol "Atur PIN" (setup wizard).

**Kasus uji fungsional (E2E)**
| ID | Kasus | Langkah | Hasil yang diharapkan |
|---|---|---|---|
| E2E-1 | Setup PIN | Buka web, login pertama kali, atur PIN 4–8 digit | Login sukses, token aktif |
| E2E-2 | Master kelas | Pengaturan → tambah kelas 7A | Muncul, bisa dikunci |
| E2E-3 | Master siswa | Data Siswa → tambah 3 siswa 7A | Muncul dsb. |
| E2E-4 | Entry nilai | Entry → isi sebagian 1, nilai 95 → simpan | `terisi` berubah 1/x |
| E2E-5 | Kosongkan nilai | nilai dikosongkan → simpan | sel kosong lagi, `terisi` turun |
| E2E-6 | CSV rekap | Rekap → export CSV | File .csv terbuka valid (anti-injection cell) |
| E2E-7 | Ganti PIN | Pengaturan → ganti PIN | PIN lama ditolak, PIN baru diterima |
| E2E-8 | Log | Pengaturan → Log | Riwayat aksi tercatat + ts |
| E2E-9 | Offline/rate | 6× login salah pada 15 menit | `RATE_LIMITED`, retryIn >0 |
| E2E-10 | Busy | (opsional) tmp ubah fungsi utk simulasikan lock | `SHEET_BUSY`, frontend tampilkan "Coba lagi" |

**Hasil** diisi setelah eksekusi (kolom `PASS/FAIL + bukti screenshot/konsol`).
**NFR-003**: ukur `performance.now()` dari klick Simpan → respon, 10× peraksi,
simpan rata-rata. Sisik: < 3s.

---

## 6. Register gap (dibawa ke Phase 10 checklist)

- [ ] NFR-003 respons <3s belum terukur (butuh instance live)
- [ ] Uji E2E browser belum dieksekusi (butuh deploy)
- [ ] `SHEET_BUSY` auto-retry 3× belum ada di frontend (hanya tombol manual)
- [ ] Konkurensi riil Apps Script (uas ledakan) belum diamati