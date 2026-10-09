# Entry Nilai

Aplikasi web untuk mencatat nilai **Ulangan Harian (UH), Ujian Semester (US), dan Tugas Harian (TH)** per kelas — tanpa server, tanpa database, tanpa biaya bulanan.

- **Frontend:** HTML + CSS + JS murni (tanpa framework/bundler), di-host di **GitHub Pages**.
- **Backend:** **Google Apps Script** Web App (lapor pada aplikasi via HTTPS).
- **Penyimpanan:** **Google Sheets** — satu spreadsheet, 4 sheet.
- **Bahasa antarmuka:** Indonesia · kode memakai gaya ES5 (kompatibel Apps Script & browser lama).

Panduan pengembangan lengkap: [`docs/prd.md`](docs/prd.md) → [`docs/architecture.md`](docs/architecture.md) → [`docs/schema.md`](docs/schema.md) → [`docs/ui-spec.md`](docs/ui-spec.md).

---

## Fitur (v1.0)

| # | Fitur | FR |
|---|---|---|
| 1 | Login PIN (SHA-256) + sesi token 6 jam | FR-001 |
| 2 | Master data siswa (CRUD, soft-delete, NIS unik) | FR-002 |
| 3 | Entry nilai massal per Kelas → Jenis → Kode, tabel, draft lokal | FR-003, FR-004 |
| 4 | Rekap kelas dalam satu matriks + unduh CSV | FR-005, FR-006 |
| 5 | Master Kelas / Jenis / Kode penilaian (bisa diedit guru) | FR-007 |
| 6 | Ganti PIN | FR-008 |
| 7 | Log aktivitas (audit trail append-only) | FR-009 |
| 8 | Impor/Ekspor siswa via CSV (unduh template + pratinjau impor) | FR-010 |

---

## Struktur

```
entry-nilai/
├─ index.html              shell SPA + urutan script
├─ css/  base.css · components.css · pages.css
├─ js/
│  ├─ config.js            EXEC_URL + konstanta (satu-satunya titik deploy)
│  ├─ ui.js                komponen UI reusable
│  ├─ csv.js               parser CSV + pemetaan impor siswa (FR-010)
│  ├─ store.js             localStorage: meta cache, draft, sesi
│  ├─ api.js               transport POST text/plain → fallback JSONP (ADR-002)
│  ├─ auth.js              SHA-256 (Web Crypto + fallback), sesi, guard
│  ├─ app.js               hash router, shell, wizard setup
│  └─ pages/  login · entry · rekap · siswa · pengaturan
├─ apps-script/Code.gs     backend Google Apps Script
└─ docs/  prd · architecture · schema · ui-spec · deployment
```

**Aturan modul (arsitektur §3.1):** halaman tidak boleh memanggil `fetch` langsung — semua lewat `App.api.call`. Setiap fitur = 1 file `js/pages/*.js` + 1 `<script>` + 1 baris `App.registerPage`. Menambah aksi backend = 1 handler + 1 baris `registerAction` di `Code.gs`.

---

## Menjalankan

Untuk **pengguna** (pemakaian nyata) lihat **[`docs/deployment.md`](docs/deployment.md)** — dua langkah:

1. Deploy `apps-script/Code.gs` sebagai Web App & atur `PIN_HASH` (dan opsional `SPREADSHEET_ID`).
2. Isi `EXEC_URL` di `js/config.js`, push ke GitHub Pages.

Setelah `EXEC_URL` diisi, `index.html` bisa juga dibuka dari `file://` untuk dicoba (transport POST masih butuh koneksi internet; fallback JSONP aktif).

**Menguji frontend tanpa backend:** biarkan `EXEC_URL` kosong — aplikasi menampilkan wizard setup, bukan error.

---

## Kontrak API (ringkas)

Semua respons berbentuk envelope:

```json
{ "ok": true,  "data": { ... }, "requestId": "..." }
{ "ok": false, "error": { "code": "...", "message": "...", "retryIn?: ..." }, "requestId": "..." }
```

| Action | Auth | Keterangan |
|---|---|---|
| `ping` | publik | status & versi |
| `auth.verify` | publik | `{pin}` (sudah sha256) → `{token, expiresAt}` |
| `auth.logout` | token | hapus token |
| `meta.get` | token | `{kelas[], jenis[], kode[], app}` |
| `siswa.list` | token | `{kelas?, status?}` → `{siswa[]}` |
| `siswa.save` | token | `{records[]}` → `{saved, inserted, updated, skipped[]}` |
| `nilai.list` | token | `{kelas, jenis?, kode?}` → `{nilai[]}` |
| `nilai.bulkSave` | token | `{kelas, jenis, kode, records[]}` → `{inserted, updated, deleted, skipped[]}` |
| `rekap.get` | token | `{kelas}` → `{columns[], rows[], stats[]}` |
| `konfig.list` | token | `{group?}` → `{entries[]}` |
| `konfig.save` | token | `{entries[]}` |
| `konfig.remove` | token | `{group, key}` → `409 CONFIG_IN_USE` bila terpakai |
| `konfig.deactivate` | token | `{group, key}` — nonaktifkan (soft delete) |
| `log.list` | token | `{limit? ≤200}` → `{entries[]}` |
| `settings.changePin` | token | `{oldPin, newPin}` (keduanya sudah sha256) |

**Aturan nilai:** baris yang dikosongkan dikirim sebagai `nilai: null` = **hapus record** (FR-004). Validasi server otoritatif: skor 0–100 maks 1 desimal, NIS unik case-insensitive, kunci bisnis nilai `(siswa_id, kelas, jenis, kode)` di-upsert.

**Impor siswa (FR-010)** memakai `siswa.save` yang sama — template CSV `nis,nama,kelas,status` diunduh dari halaman Siswa, dipratinjau sebelum disimpan, dan NIS yang sudah ada diperbarui (bukan digandakan). Tidak ada action backend baru.

---

## Keputusan penting (ADR)

Ringkasan: `docs/architecture.md`.

- **ADR-001** SPA tanpa bundler (GitHub Pages compatible).
- **ADR-002** Transport: POST `text/plain` (tanpa preflight) + fallback GET-JSONP — karena `ContentService.TextOutput` tidak punya `setHeader`.
- **ADR-003** Satu role `GURU` + token; endpoint publik sesedikit mungkin.
- **ADR-004** Semua akses baris lewat **kunci bisnis**, bukan nomor baris (tahan edit manual/insert owner).
- **ADR-005** Soft delete siswa/konfig (`status=nonaktif`, `aktif=false`).
- **ADR-006** Schema **additive-only**; `ensureSchema()` idempoten dibuat ulang saat boot.

---

## Keamanan

- PIN **tidak pernah** disimpan sebagai teks: klien mengirim `sha256(pin)`, server menyimpan `sha256(sha256(pin))` di **Script Properties** (bukan di repo).
- Rate limit: `auth.verify` 5/15 menit (per skrip, karena Apps Script tidak mengekspos IP), tulis 30/menit, baca 60/menit.
- Semua endpoint data menolak tanpa token (`INVALID_TOKEN`); informasi error generik (tidak membocorkan detail PIN).
- Ekspor CSV dengan quoting RFC 4180 + guard `= + - @` (anti spreadsheet injection).

Batasan jujur yang perlu diketahui (detail di PRD `docs/prd.md` §30): backup spreadsheet **manual** per semester; akses langsung ke sheet oleh pemilik (owner) berada di luar kendali aplikasi.

---

## Stack & versi

| Bagian | Teknologi |
|---|---|
| Frontend | Vanilla JS (ES5-compatible) + CSS3 |
| Backend | Google Apps Script (V8 runtime) |
| Storage | Google Sheets |
| Hosting | GitHub Pages (publik) |
| SSL | HTTPS (wajib — Web Crypto `crypto.subtle` hanya jalan di konteks secure) |

---