# PRD — Aplikasi Entry Nilai (Penilaian Sekolah)

**Project Name:** Entry Nilai — Web App Nilai Ulangan Harian, Ujian Semester, dan Tugas Harian
**Document Type:** Product Requirements Document (PRD)
**Status:** Draft v1.0 — pending approval

---

## 0. Document Control

### Document Version History

| Version | Date | Author | Summary of Changes |
|---|---|---|---|
| 0.1 | 2026-10-07 | Tech Lead / PO | Initial draft — discovery hasil dari clarification session |

### Approval / Sign-off

| Role | Name | Status | Date |
|---|---|---|---|
| Business Owner | _(user)_ | Pending | — |
| Technical Lead | Tech Lead Orchestrator | Pending | — |
| Security Reviewer | security-auditor-pro | Pending | — |

### Change Request Log

| CR ID | Date | Requested By | Description | Status |
|---|---|---|---|---|
| — | — | — | Belum ada change request (dokumen initial) | — |

---

## 1. Executive Summary

### Project Overview
Aplikasi web client-side murni (HTML + CSS + JavaScript, tanpa server aplikasi) untuk mencatat nilai siswa: **Tugas Harian**, **Ulangan Harian**, dan **Ujian Semester**. Data disimpan di **Google Sheets** melalui endpoint **Google Apps Script Web App**, dan aplikasi di-hosting gratis di **GitHub Pages**.

### Business Problem
Guru saat ini mencatat nilai lewat spreadsheet manual atau kertas. Konsekuensinya: format tidak konsisten antar guru/kelas, kesalahan rumus, sulit merekap cepat saat rapor, dan tidak ada riwayat perubahan. Guru membutuhkan cara input cepat (tabel massal per kelas), penyimpanan yang rapi, dan rekap siap pakai — tanpa harus mengelola server, database, atau biaya hosting.

### Target Users
Satu role utama: **Guru / Wali Kelas** (dan operator sekolah yang ditunjuk). Proteksi akses berupa **PIN sederhana** yang diverifikasi di server (Apps Script), bukan sekadar disembunyikan di UI.

### Expected Outcomes
- Input nilai satu kelas (30 siswa) untuk satu jenis penilaian selesai < 3 menit.
- Rekap seluruh nilai satu kelas tersedia dalam < 5 detik dan bisa diunduh CSV.
- Data tersimpan di spreadsheet milik sekolah — bisa dibuka, diaudit, dan dibackup manual kapan pun.

### Success Definition
Aplikasi dianggap sukses bila: (a) guru dapat entry dan rekap tanpa pelatihan teknis, (b) tidak ada kehilangan data selama penggunaan normal, (c) menambah fitur/jenis penilaian baru tidak membutuhkan perubahan arsitektur inti.

---

## 2. Business Objectives

| ID | Objective | Type | Success Metric / KPI |
|---|---|---|---|
| BO-001 | Mempercepat entry nilai harian guru | Primary | Waktu entry satu kelas satu jenis < 3 menit (observer test) |
| BO-002 | Menghasilkan rekap nilai per kelas yang akurat & siap pakai | Primary | 100% baris rekap sama dengan data tersimpan (verifikasi terhadap sheet) |
| BO-003 | Menyimpan data pada sistem yang dimiliki sekolah, tanpa biaya infrastruktur | Operational | Biaya hosting = Rp 0 (GitHub Pages + Sheets + Apps Script) |
| BO-004 | Menjaga kerahasiaan nilai dari pihak yang tidak berwenang | Primary | 0 akses berhasil tanpa PIN dari origin asing |
| BO-005 | Menjaga arsitektur agar mudah ditambah/dikurangi fitur | Strategic | Fitur baru hanya menambah 1 modul frontend + 1 aksi backend, tanpa ubah router inti |
| BO-006 | Menyediakan riwayat perubahan nilai untuk audit | Secondary | Setiap perubahan nilai tercatat di sheet `log` dengan actor, waktu, nilai lama & baru |

---

## 3. Project Scope

### In Scope
- Master data siswa (tambah, ubah, nonaktifkan) beserta kelasnya.
- Master jenis/kode penilaian (mis. Tugas Harian 1..n, Ulangan Harian 1..n, Ujian Semester) yang bisa dikelola pengguna.
- Entry nilai massal per kelas + per jenis + per kode, dalam bentuk tabel.
- Rekap nilai per kelas (matriks siswa × seluruh penilaian) + ekspor CSV.
- Autentikasi PIN sederhana, sesi berbasis token, rate-limit percobaan PIN.
- Log aktivitas perubahan data.
- Panduan deploy: Apps Script Web App + GitHub Pages.

### Out of Scope (v1)
- Perhitungan nilai akhir, bobot, predikat A/B/C/D, dan cetak rapor.
- Autentikasi akun Google / multi-role (admin vs guru).
- Mata pelajaran sebagai dimensi laporan (kolom `mapel` disediakan pada skema sebagai persiapan, tetapi UI laporan v1 tidak memecah per mapel).
- Notifikasi email/WhatsApp, grafik analitik, aplikasi mobile native.
- Mode offline penuh (queue antrian saat offline).

### Future Scope
Lihat Section 30.

---

## 4. Stakeholders

| Stakeholder | Responsibilities | Expectations | Success Criteria |
|---|---|---|---|
| Business Owner (Guru/Sekolah) | Menyediakan spreadsheet, menentukan PIN, memvalidasi hasil rekap | Aplikasi jalan tanpa biaya & tanpa IT support | Rekap cocok dengan data guru catat manual |
| End User (Guru/Wali Kelas) | Input nilai, kelola siswa, cetak rekap | Cepat, jelas, tidak error saat input massal | Bisa dipakai hari pertama tanpa tutorial panjang |
| Administrator (Operator sekolah, opsional) | Deploy Apps Script, ganti PIN, maintain repo | Langkah deploy tertulis & repeatable | Deploy ulang < 15 menit mengikuti `docs/deployment.md` |
| Technical Lead | Arsitektur, code review, quality gates | Kode termodul & mudah diperluas | Semua quality gate lulus |
| Auditors / Pihak sekolah | Menelusuri perubahan nilai | Ada jejak perubahan | Sheet `log` berisi actor + nilai lama & baru |
| External Users (siswa/wali) | Tidak ada akses | Data tidak bocor | Tidak ada endpoint publik yang membocorkan nilai tanpa token |

---

## 5. User Roles

Hanya **satu role** pada v1 (sesuai keputusan discovery), dengan pembatasan teknis.

| Field | Value |
|---|---|
| Role Name | `GURU` (single role) |
| Responsibilities | Kelola siswa, kelola jenis/kode penilaian, entry & koreksi nilai, generate rekap |
| Permissions | `siswa:*`, `nilai:*`, `rekap:read`, `meta:*`, `auth:verify`, `settings:changePin` |
| Restrictions | Tidak dapat menghapus sheet/kolom; tidak dapat mengubah konfigurasi server Apps Script; diblokir setelah 5 gagal PIN berturut-turut dalam 15 menit |
| Approval Authority | Tidak ada alur persetujuan (self-approve untuk semua aksinya sendiri) |
| Reporting Access | Rekap per kelas, ekspor CSV |
| Data Access Scope | Seluruh data dalam satu spreadsheet (single-organization) |

> Catatan: pemisahan role admin/guru masuk **Future Scope (BO-005)** dan akan ditambahkan sebagai middleware klaim `role` pada token — endpoint sudah disiapkan generik agar penambahan ini tidak mengubah kontrak API yang ada.

---

## 6. Assumption Log

| ID | Description | Reason | Impact | Status | Linked Risk |
|---|---|---|---|---|---|
| ASM-001 | Penyimpanan memakai Google Sheets (bukan DB relasional) | Permintaan eksplisit user | Batas ~10 juta sel/ sheet; query via `getDataRange` — perlu optimasi untuk data besar | Confirmed | RISK-002 |
| ASM-002 | Hosting di GitHub Pages, tanpa server aplikasi | Permintaan eksplisit user | Tidak ada sesi server-side yang tahan-lama; konfigurasi & rahasia tidak boleh ada di repo | Confirmed | RISK-003 |
| ASM-003 | Backend = Google Apps Script Web App ber-deploy "Anyone" | Satu-satunya cara Apps Script melayani request dari Pages | Endpoint terbuka → keamanan bergantung pada verifikasi PIN + token di server | Confirmed | RISK-001 |
| ASM-004 | Jumlah guru/pengguna sangat sedikit (1–10 orang) | Konteks sekolah | Tidak perlu sharding/kompaksi; batas kuota Apps Script cukup | Inferred | RISK-004 |
| ASM-005 | Setiap penilaian dikelola per kelas, tanpa dimensi mata pelajaran pada UI | Discovery: scope = nilai + siswa + kelas | Jika kelak perlu per-mapel, harus tambah filter & kolom (skema sudah menyediakan `mapel`) | Inferred | RISK-005 |
| ASM-006 | Nilai selalu berupa angka bulat/desimal 0–100 | Discovery: "Angka 0–100 saja" | Tidak ada bobot/predikat; validasi terbatas pada rentang | Confirmed | — |
| ASM-007 | Pengguna membuka aplikasi dari perangkat dengan browser modern & akses internet stabil | GitHub Pages menuntut browser modern; Web Crypto & ES2017 tersedia | Browser sangat lama tidak didukung | Inferred | RISK-006 |
| ASM-008 | PIN disimpan sebagai hash SHA-256 pada Script Properties | Praktik terbaik minimal untuk arsitektur tanpa akun | Bukan password kriptografi kuat (tanpa salt/KDF); dilindungi rate-limit | Unresolved | RISK-007 |
| ASM-009 | Owner bersedia melakukan langkah manual: membuat spreadsheet, deploy Apps Script, menyalin URL `/exec` ke konfigurasi frontend | GitHub Pages tidak punya env vars | Jika URL salah, aplikasi gagal terhubung → harus ada pesan error jelas | Unresolved | RISK-008 |

---

## 7. User Stories

| ID | As a | I want | So that | Realized by |
|---|---|---|---|---|
| US-001 | Guru | Memasukkan PIN sekali untuk membuka aplikasi | Data nilai tidak bisa dibuka sembarang orang | FR-001 |
| US-002 | Guru | Menambah/mengubah/menonaktifkan siswa beserta kelasnya | Daftar siswa selalu siap dipakai untuk entry nilai | FR-002 |
| US-003 | Guru | Memilih kelas → jenis penilaian → kode (mis. "UH-3"), lalu mengisi seluruh nilai dalam satu tabel | Input 30 nilai tidak membutuhkan 30 kali klik halaman | FR-003 |
| US-004 | Guru | Menyimpan seluruh tabel nilai sekaligus dengan satu tombol | Mengurangi risiko lupa simpan dan mempercepat input | FR-004 |
| US-005 | Guru | Melihat rekap seluruh nilai per kelas dalam satu matriks | Memantau perkembangan nilai siswa dan mendeteksi nilai kosong | FR-005 |
| US-006 | Guru | Mengunduh rekap sebagai file CSV | Membuka/mencetak rekap di Excel atau Google Sheets milik sekolah | FR-006 |
| US-007 | Guru | Menambah jenis/kode penilaian baru (mis. "Ulangan Harian 4") | Tidak perlu meminta developer saat kurikulum berubah | FR-007 |
| US-008 | Guru | Mengubah PIN dan melihat siapa yang terakhir mengubah nilai | Menjaga kerahasiaan & menelusuri kesalahan pencatatan | FR-008, FR-009 |
| US-009 | Guru | Melihat aplikasi tetap terpakai di layar ponsel saat di ruang kelas | Entry nilai bisa dilakukan di mana saja | NFR-004 |

---

## 8. Functional Requirements

Depth classification: **Core** = langsung melayani BO utama (full depth); **Supporting** = menopang Core; **Peripheral** = kemudahan administratif.

---

### FR-001 — Autentikasi PIN & Sesi *(Core)*

- **Description:** Pengguna membuka aplikasi → layar PIN → PIN di-hash SHA-256 di klien dan dikirim ke Apps Script → server membandingkan dengan hash di Script Properties → bila cocok, server menerbitkan token acak (TTL 6 jam) yang disimpan di `CacheService`, lalu dikembalikan ke klien. Klien menyimpan token di `localStorage` dan menyertakannya pada setiap request.
- **Business Purpose:** Mewujudkan BO-004 (kerahasiaan nilai) pada arsitektur tanpa akun.
- **Traces to:** BO-004
- **Inputs:** `pin` (string 4–8 digit, di-hash di sisi klien)
- **Outputs:** `{ token, expiresAt }`
- **Validation Rules:** PIN wajib; minimal 4 digit; server menolak bila hash tidak cocok; token wajib ada & belum kadaluarsa untuk semua endpoint data; maksimal **5 percobaan gagal per 15 menit** (per IP-ish key via `CacheService`), lalu `429`.
- **Permissions:** Publik untuk `auth.verify`; seluruh endpoint data hanya dengan token valid.
- **Error Handling:** `401 INVALID_TOKEN` → kembalikan ke layar PIN; `429 RATE_LIMITED` → tampilkan hitung mundur; timeout jaringan → tombol coba ulang (tanpa kehilangan input).
- **Dependencies:** FR-008 (ganti PIN).

#### Edge cases
1. Token kadaluarsa di tengah input tabel → klien harus menyimpan draft lokal, kembali ke layar PIN, dan memulihkan draft setelah verifikasi ulang (tanpa submit ganda).
2. Dua perangkat memakai PIN sama → keduanya sah (token berbeda); perubahan PIN tidak mencabut token lama secara agresif — keduanya kadaluarsa alami dalam 6 jam (dicatat di RISK-009).

#### Linked risk: RISK-001

**AC-001:** *Given* aplikasi baru dibuka tanpa token, *when* user memasukkan PIN salah 5 kali, *then* percobaan berikutnya ditolak `429` dan UI menampilkan sisa waktu. *Given* PIN benar, *when* verifikasi selesai, *then* user diarahkan ke halaman Entry dan request data pertama menyertakan token.

---

### FR-002 — Master Data Siswa *(Core)*

- **Description:** CRUD siswa: `id` (otomatis), `nis`, `nama`, `kelas`, `status` (aktif/nonaktif). Nonaktif = soft delete (baris tetap ada agar riwayat nilai tidak yatim).
- **Business Purpose:** Menopang BO-001 — entry massal membutuhkan daftar siswa per kelas yang akurat.
- **Traces to:** BO-001, BO-005
- **Inputs:** `nis`, `nama`, `kelas`, `status`; untuk update: `id` wajib.
- **Outputs:** daftar siswa terfilter (`kelas`, `status=aktif`) atau hasil sukses/gagal per-record.
- **Validation Rules:** `nama` wajib, 2–80 char, tanpa karakter kontrol; `nis` wajib unik (case-insensitive, diabaikan bila kosong); `kelas` wajib & harus terdaftar di master kelas; `status ∈ {aktif, nonaktif}`. Batch save bersifat **all-or-nothing** per record validation → record invalid dilewatkan dan dilaporkan (`skipped[]`), record valid tetap tersimpan.
- **Permissions:** `GURU` (semua aksi) + token valid.
- **Error Handling:** duplikat NIS → `409 DUPLICATE_NIS` + daftar siswa pemilik NIS; kelas belum terdaftar → `422 INVALID_KELAS`.
- **Dependencies:** master kelas (FR-007).

#### Edge cases
1. Siswa sudah punya nilai lalu dinonaktifkan → tetap muncul di arsip nilai, hilang dari daftar entry baru.
2. Dua tab mengubah siswa yang sama → versi dengan `updated_at` terbaru menang; tab kalah diberi peringatan "data telah diubah pihak lain" dan wajib muat ulang.

#### Linked risk: RISK-010 (dual-tab write conflict)

**AC-002:** *Given* 3 siswa baru diinput sekaligus, *when* satu memiliki NIS duplikat, *then* dua siswa valid tersimpan dan response menyebut 1 record `skipped` beserta alasannya.

---

### FR-003 — Layar Entry Nilai per Kelas + per Jenis *(Core)*

- **Description:** Pemilih berurutan: **Kelas → Jenis (Tugas Harian / Ulangan Harian / Ujian Semester) → Kode (mis. "TH-1", "UH-3", "US-Ganjil")** → dirender tabel seluruh siswa aktif kelas tersebut dengan input nilai per baris. Nilai yang sudah ada dimuat lebih dulu (upstream-edit).
- **Business Purpose:** Realisasi langsung BO-001.
- **Traces to:** BO-001
- **Inputs:** `kelas`, `jenis`, `kode`, `{ siswa_id: nilai }`
- **Outputs:** tabel nilai tersimpan untuk kombinasi tersebut; indikator baris kosong/terisi.
- **Validation Rules:** `nilai` angka 0–100 (boleh desimal 1 digit); input kosong dianggap "tidak dinilai" (bukan 0) dan tidak dikirim sebagai record; `jenis` harus dari daftar master; `kode` harus terdaftar di bawah `jenis` tersebut.
- **Permissions:** `GURU` + token valid.
- **Error Handling:** bila kelas tidak punya siswa aktif → empty state dengan CTA ke halaman Siswa; bila koneksi gagal saat muat → layar retry, draft lokal tidak dihapus.
- **Dependencies:** FR-002, FR-007.

#### Edge cases
1. Siswa ditambahkan setelah tabel terbuka → tabel harus bisa dimuat ulang tanpa hilang nilai yang belum disimpan (konfirmasi bila ada dirty state).
2. Nilai "100", "0", dan "75,5" → ketiganya valid; "101", "-5", "abc" → inline error pada sel, record tidak ikut submit, dan ringkasan `skipped` ditampilkan.

#### Linked risk: RISK-011 (kehilangan input saat sesi habis)

**AC-003:** *Given* kelas X dengan 30 siswa aktif, *when* guru memilih kelas → jenis → kode, *then* tabel menampilkan 30 baris terurut nama dengan nilai tersimpan (jika ada) dalam < 3 detik.

---

### FR-004 — Simpan Batch Nilai (Upsert) *(Core)*

- **Description:** Satu aksi menyimpan seluruh tabel. Baris dengan `siswa_id` + `kelas` + `jenis` + `kode` yang sudah ada → **update**; belum ada → **insert**. Setiap perubahan mencatat nilai lama & baru ke sheet `log`.
- **Business Purpose:** BO-001 (kecepatan) + BO-006 (audit).
- **Traces to:** BO-001, BO-006
- **Inputs:** payload array `{ siswa_id, kelas, jenis, kode, nilai, catatan? }` + token.
- **Outputs:** `{ inserted, updated, skipped: [{siswa_id, reason}] }`
- **Validation Rules:** semua record tervalidasi sebelum menulis (transaction per batch — bila `getDataRange` gagal atau kuota habis, tidak ada tulisan parsial); nilai harus 0–100; `siswa_id` harus aktif di kelas tersebut.
- **Permissions:** `GURU` + token valid.
- **Error Handling:** kuota Apps Script terlampaui → `429 QUOTA_EXCEEDED` + instruksi tunggu 1 menit; sheet terkunci (concurrent edit) → retry otomatis 3× dengan backoff 300/600/1200 ms, lalu `503 SHEET_BUSY`.
- **Dependencies:** FR-003.

#### Edge cases
1. Batch 500 baris melampaui batas payload → klien memecah per 200 record dan menyusun ringkasan gabungan.
2. Record yang sama dua kali dalam satu payload → record terakhir menang, yang pertama masuk `skipped` dengan alasan `DUPLICATE_IN_BATCH`.

#### Linked risk: RISK-002 (skala data), RISK-012 (kuota Apps Script)

**AC-004:** *Given* 30 nilai diubah, *when* tombol Simpan ditekan, *then* response `updated=30` dan sheet `log` berisi 30 baris baru dengan actor, timestamp, nilai lama, dan nilai baru.

---

### FR-005 — Rekap Nilai per Kelas *(Core)*

- **Description:** Matriks: baris = siswa aktif, kolom = seluruh kombinasi `jenis`+`kode` yang punya data di kelas itu (diurutkan jenis lalu kode), sel = nilai atau `—`. Menampilkan jumlah terisi/kosong per kolom.
- **Business Purpose:** Realisasi BO-002.
- **Traces to:** BO-002
- **Inputs:** `kelas`
- **Outputs:** `{ columns: [{jenis, kode}], rows: [{nis, nama, cells: {...}}], stats }`
- **Validation Rules:** hanya nilai milik kelas terpilih; siswa nonaktif yang punya nilai tetap ditampilkan (ditandai `nonaktif`) agar tidak ada data hilang dari rekap.
- **Permissions:** `GURU` + token valid.
- **Error Handling:** kelas tanpa data → empty state "Belum ada nilai untuk kelas ini".
- **Dependencies:** FR-003.

#### Edge cases
1. Kode penilaian dihapus dari master setelah ada nilai → tetap muncul sebagai kolom rekap (ditandai `diarsipkan`).
2. Nama siswa mengandung koma/kutip → aman saat ekspor CSV (FR-006) dengan quoting RFC 4180.

**AC-005:** *Given* kelas dengan 3 jenis penilaian, *when* rekap dibuka, *then* matriks menampilkan semua kombinasi kolom beserta jumlah kosong per kolom, dan angka sama dengan data sheet.

---

### FR-006 — Ekspor CSV Rekap *(Supporting)*

- **Description:** Tombol "Unduh CSV" menghasilkan file `rekap-{kelas}-{tanggal}.csv` (UTF-8 dengan BOM agar dibuka benar di Excel) langsung di browser — tanpa server.
- **Traces to:** BO-002
- **Inputs:** data rekap FR-005 di memori.
- **Outputs:** file `.csv` terunduh.
- **Validation Rules:** angka nilai tidak diformat ulang; sel kosong = string kosong; quoting `"` → `""` bila mengandung koma/kutip/newline.
- **Permissions:** `GURU` + token valid (harus sudah login).
- **Error Handling:** browser memblokir popup/download → pesan "izin download ditolak".
- **Dependencies:** FR-005.

**AC-006:** *Given* rekap kelas X, *when* Unduh CSV ditekan, *then* file terunduh dan ketika dibuka di Excel jumlah baris = jumlah siswa + 1 header, tanpa pergeseran kolom.

---

### FR-007 — Master Kelas, Jenis & Kode Penilaian *(Supporting)*

- **Description:** Konfigurasi yang bisa diedit pengguna: daftar **kelas**; daftar **jenis** (`TUGAS`, `UH`, `UAS` — bisa ditambah/dihapus); daftar **kode** per jenis. Data disimpan pada sheet `konfig` sebagai baris key-value/entri terstruktur.
- **Business Purpose:** BO-005 — menambah jenis penilaian baru tidak menyentuh kode.
- **Traces to:** BO-005
- **Inputs:** entri `{group, key, label, aktif}`.
- **Outputs:** daftar konfigurasi tersaring.
- **Validation Rules:** `key` unik per `group`; `label` 1–40 char; penghapusan entri **yang sudah dipakai nilai** diblokir → hanya bisa dinonaktifkan (`aktif=false`) agar riwayat tetap utuh.
- **Permissions:** `GURU` + token valid.
- **Error Handling:** hapus entri terpakai → `409 CONFIG_IN_USE` + jumlah nilai terkait.
- **Dependencies:** — (FR-002/003 bergantung padanya).

**AC-007:** *Given* guru menambah jenis "Proyek", *when* kembali ke layar Entry, *then* "Proyek" tersedia sebagai pilihan jenis tanpa redeploy aplikasi.

---

### FR-008 — Pengaturan PIN *(Peripheral)*

- **Description:** Form ganti PIN: PIN lama → PIN baru (konfirmasi). Hash baru ditulis ke Script Properties.
- **Traces to:** BO-004
- **Inputs:** `oldPin`, `newPin`, `confirmPin`.
- **Outputs:** status sukses/gagal.
- **Validation Rules:** PIN lama wajib benar; PIN baru 4–8 digit; konfirmasi harus sama; tidak boleh sama dengan PIN lama.
- **Permissions:** `GURU` + token valid.
- **Error Handling:** PIN lama salah → `401` tanpa membocorkan detail; kuota terlampaui → `429`.
- **Dependencies:** FR-001.

**AC-008:** *Given* token valid, *when* PIN lama salah, *then* perubahan gagal dan PIN lama tetap berlaku.

---

### FR-009 — Log Aktivitas *(Peripheral)*

- **Description:** Setiap tulis/hapus pada `siswa`, `nilai`, dan `konfig` menulis baris ke sheet `log`: `timestamp`, `actor` (token subject), `action`, `entity`, `entity_id`, `before`, `after`.
- **Traces to:** BO-006
- **Inputs:** internal (otomatis dari aksi FR-002/004/007).
- **Outputs:** baris log.
- **Validation Rules:** `before/after` disimpan sebagai JSON yang dipotong maks 5000 char; log tidak dapat diedit/dihapus lewat API.
- **Permissions:** hanya `GURU` yang dapat **membaca**; tidak ada endpoint tulis/hapus manual.
- **Error Handling:** gagal menulis log **tidak** membatalkan transaksi utama, tetapi menghasilkan entri `LOG_WRITE_FAILED` pada response.
- **Dependencies:** —

**AC-009:** *Given* satu nilai diubah dari 78 → 85, *when* tersimpan, *then* sheet `log` berisi `before={"nilai":78}`, `after={"nilai":85}`, `action=UPDATE`, dan timestamp ISO-8601.

---

## 9. Non-Functional Requirements

| ID | Category | Requirement | Target (measurable) | Traces to |
|---|---|---|---|---|
| NFR-001 | Performance | Waktu muat halaman utama | LCP < 2,5 s pada koneksi 4G | BO-001 |
| NFR-002 | Performance | Latensi API ( Apps Script warm) | p95 < 1500 ms; cold start < 6 s dengan indikator loading | BO-001 |
| NFR-003 | Scalability | Volume data | Mendukung 40 kelas × 40 siswa = 1.600 siswa dan 100.000 baris nilai dengan muat rekap < 5 s | BO-005 |
| NFR-004 | Mobile | Responsiveness | Berfungsi penuh pada lebar 360 px; tabel entry bisa di-scroll horizontal tanpa hilang header | BO-001 |
| NFR-005 | Reliability | Kegagalan jaringan | Tidak ada kehilangan input: draft disimpan ke `localStorage` setiap perubahan dan dipulihkan setelah reload | BO-001 |
| NFR-006 | Maintainability | Struktur modul | Setiap fitur berdiri di satu file `js/pages/*.js`; menambah fitur = 1 file + 1 baris registrasi route | BO-005 |
| NFR-007 | Availability | Layanan | GitHub Pages + Apps Script: 99,9% bulanan (SLA pihak ketiga); aplikasi tetap bisa dibuka (offline screen) bila API mati | BO-003 |
| NFR-008 | Accessibility | Kontras & keyboard | Kontras teks ≥ 4.5:1; seluruh alur entry dapat dioperasikan dengan keyboard | BO-001 |
| NFR-009 | Localization | Bahasa | Antarmuka Bahasa Indonesia | BO-001 |
| NFR-010 | Bundle size | Aset frontend | Total aset < 300 KB (tanpa framework) agar muat cepat di jaringan sekolah | NFR-001 |

**Metode pengukuran:** NFR-001/002 diukur DevTools throttling; NFR-003 dengan dataset sintetis 100k baris; NFR-004 dengan device 360 px; NFR-006 diverifikasi code review (tidak ada `switch` raksasa di modul inti).

---

## 10. Data Requirements

### Entity: `siswa`
- **Purpose:** Daftar peserta didik per kelas.
- **Attributes:** `id` (string, PK, otomatis `S-<random>`), `nis` (string, unik, opsional), `nama` (string, required), `kelas` (string, FK → `konfig.kelas`), `status` (`aktif|nonaktif`), `created_at`, `updated_at`.
- **Relationships:** 1:N → `nilai`.
- **Retention:** Selama tahun ajaran berjalan + 1 tahun; penghapusan fisik hanya manual oleh owner.
- **Audit:** Ya (FR-009).
- **Validation:** lihat FR-002.
- **Ownership:** Sekolah (owner spreadsheet).

### Entity: `nilai`
- **Purpose:** Satu skor untuk satu siswa pada satu kombinasi kelas/jenis/kode.
- **Attributes:** `id` (PK), `siswa_id` (FK), `kelas`, `jenis`, `kode`, `mapel` (default `"-"`), `skor` (number 0–100), `catatan` (opsional, ≤200 char), `created_at`, `updated_at`, `actor`.
- **Relationships:** N:1 → `siswa`; unik pada (`siswa_id`, `kelas`, `jenis`, `kode`).
- **Retention:** ≥ 5 tahun (kebutuhan riwayat rapor/akreditasi).
- **Audit:** Ya — setiap perubahan menghasilkan baris `log`.
- **Ownership:** Sekolah.

### Entity: `konfig`
- **Purpose:** Master kelas, jenis, kode, dan parameter aplikasi (PIN hash, label).
- **Attributes:** `group` (`kelas|jenis|kode|app`), `key`, `label`, `aktif` (boolean), `urut` (number), `updated_at`.
- **Relationships:** direferensikan `siswa.kelas`, `nilai.jenis`, `nilai.kode`.
- **Retention:** Selamanya (tidak boleh dihapus bila sudah dipakai — FR-007).
- **Audit:** Ya.

### Entity: `log`
- **Purpose:** Jejak audit perubahan.
- **Attributes:** `ts` (ISO-8601), `actor`, `action`, `entity`, `entity_id`, `before` (JSON ≤5000 char), `after` (JSON ≤5000 char), `request_id`.
- **Retention:** 2 tahun, lalu boleh diarsipkan/dihapus manual (Section 25).

---

## 11. Database Requirements

Karena DB = Google Sheets, "tabel" = sheet di satu spreadsheet.

- **Entities / Sheets:** `siswa`, `nilai`, `konfig`, `log` — masing-masing satu sheet, baris pertama = header (schema tetap, dijaga oleh `ensureSchema()` pada Code.gs).
- **Primary Key:** kolom `id` — dibuat aplikasi (bukan nomor baris, agar aman terhadap penghapusan baris manual).
- **Foreign Keys:** logical only (Sheets tidak enforce) → divalidasi di aplikasi (FR-002/003).
- **Indexes:** tidak ada index fisik; **cache** dibangun saat boot: baca `siswa` sekali per sesi ke memori, dan bangun `Map` index `nilai` per (`siswa_id|kelas|jenis|kode`) untuk upsert O(1).
- **Soft Delete:** `siswa.status=nonaktif`, `konfig.aktif=false`. Tidak ada penghapusan fisik via API untuk `siswa` & `nilai`.
- **Audit Strategy:** sheet `log` (FR-009), append-only via API.
- **Data Retention / Archiving:** lihat Section 25.
- **Schema Evolution:** `ensureSchema()` menambah kolom baru bila belum ada (dengan nilai default) — aman untuk upgrade mendatang tanpa migrasi manual.

---

## 12. Text ERD

```
konfig (group,key,label,aktif,urut,updated_at)
  │  group='kelas'  ─────────────┐
  │  group='jenis'/'kode'        │
  ▼                              ▼
siswa(id,nis,nama,kelas,status,created_at,updated_at)
  │  1:N
  ▼
nilai(id,siswa_id,kelas,jenis,kode,mapel,skor,catatan,created_at,updated_at,actor)

log(ts,actor,action,entity,entity_id,before,after,request_id)
  └── merujuk entity + entity_id (siswa|nilai|konfig) — referensi lemah

Relasi:
  konfig(kelas)  1:N  siswa.kelas
  konfig(jenis)  1:N  nilai.jenis
  konfig(kode)   1:N  nilai.kode
  siswa          1:N  nilai.siswa_id
  (log)          N:1  entity id pada siswa|nilai|konfig
```

---

## 13. Business Rules

| ID | Rule |
|---|---|
| BR-001 | Nilai hanya angka 0–100 (maks 1 desimal). Nilai kosong ≠ 0. |
| BR-002 | Siswa `nonaktif` tidak muncul di layar entry baru, tetapi tetap ada di rekap bila punya nilai. |
| BR-003 | Satu (`siswa_id`,`kelas`,`jenis`,`kode`) hanya boleh memiliki satu baris nilai (upsert, bukan insert ganda). |
| BR-004 | Jenis/kode yang sudah dipakai nilai tidak boleh dihapus — hanya dinonaktifkan. |
| BR-005 | Semua tulis data wajib menyertakan token valid & tidak kadaluarsa. |
| BR-006 | Setiap perubahan nilai wajib menghasilkan baris `log` dengan `before`/`after`. |
| BR-007 | PIN hanya boleh diubah oleh pemegang PIN lama. |
| BR-008 | Setelah 5 gagal PIN dalam 15 menit, `auth.verify` ditolak (429). |
| BR-009 | Rekap selalu menyertakan seluruh kolom penilaian kelas, termasuk yang sudah dinonaktifkan (ditandai). |
| BR-010 | Tidak ada endpoint publik (tanpa token) yang mengembalikan `nilai` atau `siswa`. |

---

## 14. Workflow Definitions

### W1 — Login
`Buka app` → `Cek token di localStorage` → *(alt A: token valid & belum expired)* → `Langsung ke Entry` → `Selesai`
→ *(alt B: tidak ada/token kadaluarsa)* → `Layar PIN` → `Input PIN` → `POST auth.verify`
→ *(failure 1: PIN salah)* → `Pesan "PIN salah" + sisa percobaan` → ulang (maks 5×) → *(failure 2: kuota)* → `Hitung mundur 15 menit` → ulang
→ *(success)* → `Simpan token` → `Layar Entry` → `Selesai`

### W2 — Entry Nilai
`Pilih Kelas` → `Pilih Jenis` → `Pilih Kode` → `Muat tabel (+ nilai tersimpan)`
→ `Isi nilai` → *(alt: nilai invalid)* → `Inline error, record dilewatkan, ditampilkan di ringkasan` → lanjut isi
→ `Klik Simpan` → `Validasi lokal` → `POST nilai.bulkSave`
→ *(failure: jaringan/kuota/sheet busy)* → `Pesan + draft tetap tersimpan lokal` → `Coba lagi`
→ *(success)* → `Toast "30 nilai tersimpan"` → `Rekap siap dilihat` → `Selesai`

### W3 — Rekap & Ekspor
`Pilih Kelas` → `POST rekap.get` → *(alt: belum ada data)* → `Empty state` → `Selesai`
→ *(normal)* → `Render matriks + statistik` → `Klik Unduh CSV` → `Buat blob UTF-8 BOM` → `Download file` → *(failure: browser memblokir)* → `Pesan izin download` → `Selesai`

### W4 — Kelola Master Siswa
`Halaman Siswa` → `Pilih/tambah kelas` → `Tambah/Ubah siswa` → `Simpan`
→ *(failure: NIS duplikat / nama kosong)* → `409/422 + sorot field` → koreksi → ulang
→ *(alt: nonaktifkan)* → `Soft delete` → `Log tercatat` → `Selesai`

---

## 15. API Requirements

Transport: **HTTPS POST** ke Apps Script Web App `/exec`, body JSON (`Content-Type: text/plain; charset=utf-8` untuk menghindari CORS preflight — lihat verifikasi di `docs/architecture.md`). Semua respons `ContentService.createTextOutput(JSON).setMimeType(ContentService.MimeType.JSON)`. Envelope seragam:

```json
{ "ok": true,  "data": { ... }, "requestId": "..." }
{ "ok": false, "error": { "code": "INVALID_TOKEN", "message": "..." }, "requestId": "..." }
```

| ID | Action (param `a`) | Method | Purpose | Request | Response | Permissions | Error Cases | Rate limit |
|---|---|---|---|---|---|---|---|---|
| API-001 | `ping` | POST | Uji koneksi & cek skema | — | `{version, sheetOk}` | Publik (tanpa token) | `SHEET_NOT_READY` | 60/menit |
| API-002 | `auth.verify` | POST | Verifikasi PIN → token | `{pin}` | `{token, expiresAt}` | Publik | `INVALID_PIN` (401), `RATE_LIMITED` (429) | 5/15 menit |
| API-003 | `meta.get` | POST | Kelas, jenis, kode, info app | `{token}` | `{kelas[], jenis[], kode[], app{}}` | Token | `INVALID_TOKEN` (401) | 60/menit |
| API-004 | `siswa.list` | POST | Daftar siswa | `{token, kelas?, status?}` | `{siswa[]}` | Token | `INVALID_TOKEN`, `INVALID_KELAS` | 60/menit |
| API-005 | `siswa.save` | POST | Create/update batch | `{token, records[]}` | `{saved, skipped[]}` | Token | `DUPLICATE_NIS` (409), `INVALID_KELAS` (422), `INVALID_ROW` | 30/menit |
| API-006 | `nilai.list` | POST | Nilai terfilter | `{token, kelas, jenis?, kode?}` | `{nilai[]}` | Token | `INVALID_FILTER` | 60/menit |
| API-007 | `nilai.bulkSave` | POST | Upsert batch | `{token, kelas, jenis, kode, records[]}` | `{inserted, updated, deleted, skipped[]}` | Token | `QUOTA_EXCEEDED` (429), `SHEET_BUSY` (503), `INVALID_ROW` | 30/menit |
| API-008 | `rekap.get` | POST | Matriks rekap kelas | `{token, kelas}` | `{columns[], rows[], stats}` | Token | `INVALID_KELAS` | 30/menit |
| API-009 | `konfig.list` | POST | Baca master konfig | `{token, group?}` | `{entries[]}` | Token | `INVALID_TOKEN` | 60/menit |
| API-010 | `konfig.save` | POST | Tambah/ubah konfig | `{token, entries[]}` | `{saved, skipped[]}` | Token | `CONFIG_IN_USE` (409) | 30/menit |
| API-011 | `konfig.remove` | POST | Hapus permanen konfig | `{token, group, key}` | `{removed:true}` | Token | `CONFIG_IN_USE` (409), `NOT_FOUND` | 30/menit |
| API-011b | `konfig.deactivate` | POST | Nonaktifkan konfig (soft) | `{token, group, key}` | `{deactivated:true}` | Token | `NOT_FOUND` | 30/menit |
| API-012 | `log.list` | POST | Baca log (200 terakhir) | `{token, limit?}` | `{entries[]}` | Token | `INVALID_TOKEN` | 10/menit |
| API-013 | `settings.changePin` | POST | Ganti PIN | `{token, oldPin, newPin}` | `{changed:true}` | Token | `INVALID_OLD_PIN` (401), `WEAK_PIN` (422) | 5/15 menit |

> Router **generik** (`switch (action)` + registry aksi per domain) — menambah fitur = menambah 1 handler terdaftar, tanpa mengubah mekanisme routing (BO-005).
>
> **Deviasi v1 yang diterapkan:** (1) `nilai.bulkSave` butuh konteks `{kelas, jenis, kode}` (bukan `{records[]}` saja); respon menambahkan `deleted` utk `nilai:null`. (2) `rekap.get` **tidak** melempar `EMPTY_CLASS` — kelas kosong/tanpa nilai mengembalikan struktur kosong (`rows:[]`), frontend menampilkan empty-state. (3) hapus = hard delete (`konfig.remove` → `{removed:true}`), nonaktifkan = soft delete (`konfig.deactivate` → `{deactivated:true}`).

---

## 16. Integration Requirements

| Integration | Purpose | Trigger Events | Data Flow | Failure Handling |
|---|---|---|---|---|
| **Google Apps Script Web App** | Backend & akses Sheets | Semua aksi data | Browser → HTTPS POST `/exec` → Code.gs → Spreadsheet | Timeout 15 s → retry dengan backoff → pesan jelas "Server tidak merespons" + tombol coba ulang; draft lokal tetap utuh |
| **Google Sheets** | Penyimpanan persisten | Tulis/baca oleh Code.gs | Code.gs `SpreadsheetApp` → 4 sheet | Sheet hilang → `ensureSchema()` membuat ulang & mencatat warning; sel terkunci → retry 3× backoff |
| **GitHub Pages** | Hosting statis | Deploy | Repo → CDN Pages | Build/deploy gagal → versi lama tetap online (Pages menyimpan release sebelumnya → rollback = revert commit) |
| **Google Script Properties** | Rahasia (PIN hash) & konfig | Baca saat `auth.verify` / `changePin` | Script Properties ↔ Code.gs | Properti belum diisi → `PIN_NOT_CONFIGURED` + instruksi setup di `docs/deployment.md` |
| **Web Crypto API (klien)** | Hash PIN SHA-256 | Saat submit PIN | `crypto.subtle.digest` → body request | Konteks non-HTTPS → aplikasi menolak berjalan dengan pesan "akses lewat HTTPS" |

Tidak ada integrasi lain (email/WhatsApp/calendar = out of scope).

---

## 17. UI Requirements

Aplikasi **SPA single-page** dengan routing hash. Halaman:

| Page | Purpose | Components | Actions | Desktop | Mobile (≤480px) | Loading | Empty | Error |
|---|---|---|---|---|---|---|---|---|
| `#/login` | Verifikasi PIN | Kartu PIN, input numeric, tombol Masuk, indikator koneksi | Submit PIN | Kartu terpusat 380px | Kartu full-width | Spinner tombol | — | Pesan PIN salah + sisa percobaan; hitung mundur rate-limit |
| `#/entry` | Entry nilai massal | Filter Kelas/Jenis/Kode, tabel sticky header, sel input numerik, baris ringkasan, tombol Simpan/Reset | Ubah nilai, simpan, reset, muat ulang | Tabel lebar penuh, header sticky | Tabel scroll horizontal + kolom nama sticky kiri | Skeleton baris | CTA "Tambah siswa" | Banner gagal simpan + jumlah record dilewatkan |
| `#/rekap` | Rekap kelas | Filter kelas, matriks, legenda, statistik kolom, tombol Unduh CSV | Pilih kelas, unduh | Matriks penuh | Scroll keduanya arah | Skeleton | "Belum ada nilai" | Pesan gagal muat + retry |
| `#/siswa` | Master siswa | Form tambah/ubah, tabel siswa, filter kelas/status, tombol nonaktifkan | CRUD siswa | 2 kolom (form + tabel) | Form di atas, tabel di bawah | Skeleton | CTA tambah siswa pertama | Validasi inline + banner server |
| `#/pengaturan` | Master konfig + PIN + log | Tab [Kelas | Jenis/Kode | Keamanan | Log] | Tambah/ubah/nonaktif konfig, ganti PIN, lihat log | Tab horizontal | Tab scrollable | Spinner | "Belum ada data" | Pesan `CONFIG_IN_USE`, `INVALID_OLD_PIN` |

**Global:** header dengan nama aplikasi + navigasi + status koneksi + tombol Keluar; toast notifikasi; modal konfirmasi untuk aksi destruktif; indikator "tidak tersimpan" bila ada dirty state; `.nojekyll` agar aset tak diproses Jekyll.

---

## 18. Reporting Requirements

| Report | ID | Filters | Grouping | Sorting | Export | Permissions |
|---|---|---|---|---|---|---|
| Rekap Nilai per Kelas | REP-001 | `kelas` (wajib) | Baris=siswa; Kolom=`jenis`+`kode` | Kolom: jenis lalu kode; Baris: nama A→Z | CSV UTF-8 BOM (FR-006) | `GURU` |
| Statistik Kelengkapan | REP-002 | `kelas` | Per kolom penilaian (terisi/kosong/%) | Ikut urutan kolom rekap | Ikut CSV (baris footer) | `GURU` |
| Log Aktivitas | REP-003 | `entity`, `limit` (default 200) | Tidak ada | `ts` desc | CSV opsional (v1: tampil layar saja) | `GURU` |

Tidak ada laporan agregat lintas kelas pada v1 (bukan kebutuhan discovery).

---

## 19. Notification Requirements

**Tidak ada notifikasi pada v1** (tidak ada kanal yang diminta pada discovery).

| Trigger (jika nanti ditambahkan) | Recipients | Content | Failure Handling |
|---|---|---|---|
| *(placeholder)* Gagal simpan massal | Guru aktif | Ringkasan record gagal | Retry queue; jangan memutus input |

---

## 20. Audit Requirements

- **Di-audit:** `siswa.save` (termasuk status → nonaktif), `nilai.bulkSave`, `konfig.save`, `konfig.remove`, `konfig.deactivate`, `settings.changePin`.
- **Who:** `actor` = ringkas token (mis. `guru-<8char>`), disimpan pada setiap record & log.
- **When:** `ts` ISO-8601 UTC, dikonversi ke lokal saat tampil.
- **Before/After:** objek JSON sebelum & sesudah (untuk `bulkSave` dicatat per record yang benar-benar berubah — nilai sama → tidak ada baris log, agar log bersih).
- **IP / Device:** `clientIP` dicatat bila tersedia (Apps Script `e.context` kadang menyediakannya); bila tidak, isi `unknown` — bukan syarat keberhasilan aksi.
- **Retention:** 2 tahun (Section 25).
- **Integritas:** API tidak menyediakan tulis/hapus `log`.

---

## 21. Security Requirements

| ID | Requirement | Detail |
|---|---|---|
| SEC-001 | Authentication | PIN → SHA-256 (klien) → bandingkan hash di Script Properties → terbitkan token acak 128-bit, TTL 6 jam, disimpan `CacheService` |
| SEC-002 | Authorization | Semua endpoint data (API-003..013) wajib token valid; `ping` & `auth.verify` satu-satunya yang publik |
| SEC-003 | PIN policy | 4–8 digit; disimpan **hashed** (tidak pernah plaintext di log/sheet); tidak ada endpoint yang mengembalikan PIN |
| SEC-004 | Session policy | TTL 6 jam; keluar = hapus token lokal + `auth.logout` (hapus dari cache); token lama setelah ganti PIN tetap sah hingga TTL (lihat RISK-009) |
| SEC-005 | Rate limiting | `auth.verify` 5/15 menit; endpoint tulis 30/menit; baca 60/menit — via `CacheService` counter |
| SEC-006 | Transport | Wajib HTTPS (GitHub Pages & Apps Script); app menolak jalan di konteks non-secure |
| SEC-007 | Data exposure | Tidak ada nilai/siswa pada endpoint publik; pesan error generik (tanpa detail stack/URL sheet) ke klien |
| SEC-008 | Injection | Semua nilai ditulis via API, bukan kueri; wajib `setValue` pada sel bertipe (angka) — tidak ada risiko formula injection; CSV diekspor dengan quoting RFC 4180 dan prefix `'` untuk sel diawali `=+-@` (CSV/formula injection guard) |
| SEC-009 | Secrets | Tidak ada API key/URL rahasia di repo; URL `/exec` dianggap publik (by-design) — keamanan bertumpu pada SEC-001/002/005 |
| SEC-010 | Audit logging | FR-009 |

> **Catatan kejujuran batasan:** PIN + token pada Apps Script **bukan** autentikasi kelas enterprise. RISK-001 mendokumentasikan batas ini; mitigasi utama = rate-limit + hashed PIN + minimal exposure. Peningkatan ke Google Sign-In tercantum di Section 30.

---

## 22. Performance Requirements

| ID | Metric | Target | Measurement |
|---|---|---|---|
| NFR-001 | First Contentful Paint (4G) | < 1,5 s | DevTools throttling |
| NFR-002 | API warm p95 | < 1500 ms | 50 request berurutan, catat p95 |
| NFR-002b | API cold start | < 6 s, dengan indikator loading | Panggil setelah idle > 5 menit |
| FR-003 | Muat tabel entry (40 siswa) | < 3 s | Stopwatch UI |
| FR-005 | Rekap 100k baris nilai | < 5 s | Dataset sintetis |
| NFR-010 | Total aset frontend | < 300 KB | `du` / Network panel |

---

## 23. Scalability Requirements

- **Expected users:** 1–10 guru, simultan ≤ 3.
- **Expected data:** 40 kelas × 40 siswa (1.600 siswa) × 20 penilaian = ~32.000 baris nilai per tahun; tumbuh ~32k baris/tahun.
- **Storage growth:** ~5 juta sel dalam 5 tahun → masih di bawah batas 10 juta sel/sheet Google; **milestone**: saat `nilai` melebihi ~500k baris → pindah ke sheet per tahun ajaran (arsitektur sudah menyiapkan pemisahan lewat kolom `tahun_ajaran` opsional).
- **Concurrency:** ≤ 3 penulis serentak; mitigasi retry + deteksi dirty state (RISK-010).
- **Growth lever:** bila kelak perlu multi-sekolah → tambah kolom `sekolah_id` + filter wajib; endpoint generik (API-001..013) tidak berubah.

---

## 24. Multi-Tenancy Considerations

**Rekomendasi: Single Organization (satu sekolah, satu spreadsheet).** Alasan: konteks discovery adalah satu lembaga; multi-tenant akan menambah isolasi data, konfigurasi PIN per tenant, dan biaya operasional yang tidak diminta. Jalur upgrade tercatat di Section 30 (tambah `sekolah_id`).

---

## 25. Data Retention Policy

| Entity | Retention | Archiving | Deletion Rules | Backup |
|---|---|---|---|---|
| `siswa` | ≥ 5 tahun ajaran | Soft delete (`status=nonaktif`); fisik manual bila > 5 tahun | Tidak ada penghapusan via API | Owner mengunduh sheet sebagai `.xlsx` per semester (otomatis via Drive → opsional) |
| `nilai` | ≥ 5 tahun | Sheet per tahun ajaran bila > 500k baris | Tidak ada penghapusan via API (koreksi = ubah + log) | Idem |
| `konfig` | Selamanya | Dinonaktifkan bila usang | Nonaktif, bukan hapus | Ikut spreadsheet |
| `log` | 2 tahun | Ekspor CSV lalu hapus baris > 2 tahun (manual/trigger bulanan opsional) | Baris > 2 tahun | Ekspor berkala |

Legal: nilai siswa adalah data pendidikan → akses dibatasi ke pemegang PIN sekolah.

---

## 26. Edge Cases

| # | Case | Handling | FR |
|---|---|---|---|
| EC-01 | Data ganda (NIS duplikat) | `409` + identitas pemilik NIS | FR-002 |
| EC-02 | Data hilang (sheet/kolom dihapus manual) | `ensureSchema()` re-create + warning ke UI | semua |
| EC-03 | Concurrent update (2 tab) | Deteksi `updated_at`, beri peringatan, minta reload | FR-002 |
| EC-04 | Pelanggaran permission (token kadaluarsa) | `401` → layar PIN, draft dipulihkan | FR-001 |
| EC-05 | Sesi expired di tengah input | Draft `localStorage` → restore setelah login ulang | FR-001, NFR-005 |
| EC-06 | Network failure saat simpan | Retry 3× → pesan jelas, draft tidak hilang | FR-004 |
| EC-07 | Record dihapus/dinonaktifkan di tab lain | Baris masuk `skipped` + alasan `SISWA_NOT_ACTIVE` | FR-004 |
| EC-08 | Kode penilaian dinonaktifkan setelah ada nilai | Tetap tampil di rekap bertanda `diarsipkan` | FR-005 |
| EC-09 | Import/gagal ekspor CSV | Browser block → pesan izin; fallback: seleksi + salin | FR-006 |
| EC-10 | Payload > 200 record | Dipecah per batch di klien, ringkasan digabung | FR-004 |
| EC-11 | Kuota Apps Script habis | `429 QUOTA_EXCEEDED` + instruksi tunggu, draft utuh | FR-004 |
| EC-12 | PIN belum dikonfigurasi | `PIN_NOT_CONFIGURED` + langkah setup | FR-001 |

---

## 27. Risk Assessment

| ID | Category | Description | Likelihood | Impact | Mitigation | Linked ASM |
|---|---|---|---|---|---|---|
| RISK-001 | Security | Endpoint Apps Script publik → data terekspos bila PIN lemah/bocor | Medium | High | Hashed PIN, rate-limit 5/15 mnt, token TTL 6 jam, minimal endpoint publik, BR-010; jalur upgrade Google Sign-In | ASM-003 |
| RISK-002 | Performance/Scale | Semua baca = full-sheet scan → lambat saat data besar | Medium | Medium | Index in-memory per sesi, cache list siswa, rekap per kelas (bukan seluruh sheet), milestone sheet per tahun | ASM-001 |
| RISK-003 | Deployment | Rahasia/URL salah masuk repo | Low | High | Tidak ada rahasia di repo; URL `/exec` dianggap publik; PIN hash hanya di Script Properties | ASM-002 |
| RISK-004 | Operational | Kuota Apps Script (URL Fetch, runtime) terlampaui saat entry massal | Medium | Medium | Batch 200, backoff, `429` jelas, hindari pemanggilan per-baris | ASM-004 |
| RISK-005 | Requirement | Kebutuhan per-mapel muncul mendadak → rework | Medium | Medium | Kolom `mapel` sudah ada di skema; filter & laporan per mapel hanya menambah UI | ASM-005 |
| RISK-006 | Compatibility | Browser lama tanpa Web Crypto/ES2017 | Low | Medium | Feature-detect saat boot; pesan "gunakan browser modern" | ASM-007 |
| RISK-007 | Security | SHA-256 tanpa KDF → PIN lemah mudah ditebak offline bila hash bocor | Medium | Medium | Rate-limit online; rekomendasi PIN acak 6–8 digit; upgrade ke KDF/Sign-In di v2 | ASM-008 |
| RISK-008 | Deployment | User salah deploy / URL `/exec` salah tempel → app gagal terhubung | High | Medium | `ping` saat boot + wizard setup di UI + `docs/deployment.md` langkah-demi-langkah dengan screenshot | ASM-009 |
| RISK-009 | Security | Token lama tetap hidup 6 jam setelah ganti PIN | Medium | Low | Dokumentasikan; opsional: versi PIN → invalidasi token ber-lampau v2 | ASM-008 |
| RISK-010 | Data integrity | Dua tab menulis baris yang sama | Medium | Medium | Deteksi `updated_at`, peringatan reload, upsert berbasis kunci unik (BR-003) | ASM-004 |
| RISK-011 | UX / Data loss | Draft hilang saat sesi habis | Medium | High | `localStorage` draft per (kelas,jenis,kode) + pemulihan pasca-login | ASM-007 |
| RISK-012 | Reliability | Sheet terkunci oleh editor Google Sheets lain | Medium | Medium | Retry 3× backoff → `503 SHEET_BUSY` + saran tutup tab Sheets | ASM-001 |

---

## 28. Acceptance Criteria

| ID | FR | Given | When | Then | Conditions |
|---|---|---|---|---|---|
| AC-001 | FR-001 | Layar PIN terbuka | PIN salah 5× / PIN benar dimasukkan | 429 + hitung mundur / token diterima & masuk Entry | Hash dibandingkan di server, bukan di klien saja |
| AC-002 | FR-002 | 3 siswa baru, 1 NIS duplikat | Simpan batch | 2 tersimpan, 1 `skipped` + alasan | Tidak ada partial-silent-failure |
| AC-003 | FR-003 | Kelas dgn 30 siswa aktif | Pilih kelas→jenis→kode | 30 baris tampil < 3 dtk, nilai lama terbaca | Header sticky & input numerik aktif |
| AC-004 | FR-004 | 30 nilai diubah | Klik Simpan | `updated=30` + 30 baris log `before/after` | Atomic per batch; retry bila sheet busy |
| AC-005 | FR-005 | Kelas dgn 3 jenis | Buka rekap | Matriks + statistik per kolom tampil & sama dgn sheet | Siswa nonaktif bernilai tetap tampil |
| AC-006 | FR-006 | Rekap siap | Unduh CSV | File UTF-8 BOM, baris = siswa + 1 header | Sel `=+-@` diprefix aman |
| AC-007 | FR-007 | Jenis "Proyek" ditambahkan | Kembali ke Entry | "Proyek" tersedia tanpa redeploy | Kode dipakai nilai tak bisa dihapus |
| AC-008 | FR-008 | Token valid | PIN lama salah | Perubahan gagal, PIN lama tetap berlaku | Tidak bocor detail |
| AC-009 | FR-009 | Nilai 78→85 | Tersimpan | Log `before={"nilai":78}` `after={"nilai":85}` | Log append-only |
| AC-010 | NFR-005 | Jaringan putus saat isi tabel | Reload halaman | Draft dipulihkan, tidak ada duplikat | Key draft per kelas+jenis+kode |
| AC-011 | NFR-004 | Layar 360 px | Buka Entry | Bisa isi & simpan nilai | Tabel scroll, nama tetap terlihat |

---

## 28a. Traceability Matrix

| BO | FR / NFR | AC | RISK |
|---|---|---|---|
| BO-001 | FR-002, FR-003, FR-004, NFR-001, NFR-002, NFR-004, NFR-005, NFR-010 | AC-002, AC-003, AC-004, AC-010, AC-011 | RISK-002, RISK-011 |
| BO-002 | FR-005, FR-006, NFR-003 | AC-005, AC-006 | RISK-002 |
| BO-003 | NFR-007 | — | RISK-003 |
| BO-004 | FR-001, FR-008, FR-009, SEC-001..010 | AC-001, AC-008, AC-009 | RISK-001, RISK-007, RISK-009 |
| BO-005 | FR-007, NFR-006, NFR-003 | AC-007 | RISK-005 |
| BO-006 | FR-004, FR-009 | AC-004, AC-009 | RISK-012 |
| (cross) | FR-002, FR-003, FR-004 | EC-01..EC-12 | RISK-010, RISK-012 |

> Setiap FR/NFR punya minimal satu AC; setiap BO terwakili ≥ 1 FR/NFR. FR yang tidak punya AC: tidak ada.

---

## 29. Release Strategy

| Phase | Scope | Deliverable |
|---|---|---|
| **Phase 1 — MVP** | FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007 (kelas/jenis/kode), FR-009 | Aplikasi siap dipakai guru |
| **Phase 2 — Hardening** | FR-008 (ganti PIN di UI), rate-limit penuh, log UI, dokumentasi deploy, panduan rollback | Siap produksi sekolah |
| **Phase 3 — Rilis resmi** | QA penuh, security review, deploy GitHub Pages | `READY FOR PRODUCTION` |
| Future | Lihat Section 30 | — |

**MVP Scope = Phase 1.** Production Scope = Phase 1 + 2 + quality gates.

---

## 30. Future Enhancements

1. **Google Sign-In** sebagai pengganti PIN (menghilangkan RISK-001/007).
2. **Dimensi Mata Pelajaran** penuh: filter, rekap per mapel, laporan lintas mapel (skema sudah punya kolom `mapel`).
3. **Bobot & predikat**: nilai akhir, A/B/C/D, konfigurasi bobot per jenis.
4. **Multi-sekolah**: `sekolah_id` + isolasi filter.
5. **Mode offline + queue** antrian sinkronisasi (service worker).
6. **Analitik**: grafik distribusi nilai, peringkat, tren antar penilaian.
7. **Impor massal** dari CSV/Google Forms.
8. **Pencetakan rapor** PDF (client-side).
9. **Invalidasi token agresif** saat ganti PIN (menutup RISK-009).
10. **Backup otomatis** terjadwal ke Google Drive.

---

## 31. Technical Recommendations

| Layer | Choice | Justification |
|---|---|---|
| Frontend | **HTML + CSS + JS murni** (tanpa framework, tanpa build step) | Permintaan eksplisit; muat cepat (NFR-010); deploy = salin file; guru tidak perlu toolchain |
| Struktur | Namespace global `App.*` + modul per fitur (`js/pages/*.js`) via `<script>` biasa | Bisa dibuka via `file://` untuk debugging lokal (ES modules diblokir di `file://`), tetap terorganir & scalable |
| Backend | **Google Apps Script Web App** (`doPost` + router aksi generik) | Permintaan eksplisit; tanpa server, gratis, akses native ke Sheets |
| Database | **Google Sheets** (4 sheet + `ensureSchema`) | Permintaan eksplisit; bisa dibuka/diaudit owner |
| Hosting | **GitHub Pages** | Permintaan eksplisit; HTTPS gratis; rollback = git revert |
| Auth | PIN SHA-256 + token via `CacheService` | Seimbang antara "tanpa server akun" & BO-004; jalur upgrade Sign-In terdokumentasi |
| Monitoring | `ping` health-check + sheet `log` + browser console | Gratis, cukup untuk skala sekolah |
| Docs | `docs/` (prd, architecture, deployment) + `README.md` | Menopang BO-005 & RISK-008 |

---

## 32. Effort & Resource Estimation

*Estimasi indikatif — belum berdasarkan velocity tim terkonfirmasi.*

| Epic / Feature group | Effort (person-day) | Roles |
|---|---|---|
| Setup repo + struktur + konfig deploy | 0,5 | Fullstack |
| Backend Apps Script (router, auth, siswa, nilai, konfig, rekap, log) | 2,0 | Backend |
| Frontend: shell, router, API client, komponen dasar | 1,0 | Frontend |
| Frontend: Entry nilai + Rekap + CSV | 1,5 | Frontend |
| Frontend: Siswa + Pengaturan + Login | 1,0 | Frontend |
| Code review + perbaikan | 0,5 | Tech Lead |
| QA (plan, eksekusi, regresi) | 1,0 | QA |
| Security review + hardening | 0,5 | Security |
| Deployment + dokumentasi | 0,5 | DevOps |
| **Total** | **~8,5 person-day** | 1 fullstack (bisa 1 orang) |

**Critical path:** Backend Apps Script → Frontend API client → Entry/Rekap → QA → Deploy.
**Timeline rilis (1 orang, penuh waktu):** Minggu 1 = Phase 1 (MVP); Minggu 2 = Phase 2 + gates + Phase 3 deploy.

---

## 33. Glossary

| Term | Definition |
|---|---|
| **UH** | Ulangan Harian — penilaian rutin di kelas |
| **UAS** | Ujian Semester — penilaian akhir semester |
| **TH** | Tugas Harian — penilaian tugas rutin |
| **Kode penilaian** | Pengenal unik satu kali penilaian dalam satu jenis (mis. `UH-3`) |
| **Upsert** | Operasi tulis yang melakukan update bila kunci sudah ada, insert bila belum |
| **Token** | Kunci sesi acak sementara yang dibuktikan server setelah PIN benar |
| **Script Properties** | Penyimpanan key-value privat milik proyek Apps Script (tempat hash PIN) |
| **Soft delete** | Menonaktifkan record tanpa menghapus barisnya |
| **Envelope** | Format respons API seragam `{ok, data|error, requestId}` |
| **Dirty state** | Kondisi ada perubahan belum disimpan |
| **Draft lokal** | Salinan input tersimpan di `localStorage` untuk mencegah kehilangan data |

---

## 34. Final Validation Summary

| Checklist item | Status | Catatan |
|---|---|---|
| Stakeholders defined (Responsibilities/Expectations/Success Criteria) | ✓ | Section 4 |
| User roles — 7 sub-field lengkap | ✓ | Section 5 (satu role, dibenarkan discovery) |
| Workflows + alternate & failure flow | ✓ | W1–W4, masing-masing punya alt & failure |
| Permissions cross-reference ke Core/Supporting FR | ✓ | Tiap FR punya baris Permissions |
| Validations eksplisit tiap FR | ✓ | Tidak ada "TBD" |
| Reports: Filters + Grouping + Export | ✓ | REP-001..003 |
| Notifications: failure handling | ✓ | V1 tanpa notifikasi — dinyatakan eksplisit (Section 19) |
| Integrations: Data Flow + Failure Handling | ✓ | Section 16 |
| Audit: Before/After + retention | ✓ | Section 20 + 25 |
| Security: authorization mapped ke role | ✓ | SEC-001..010 → role `GURU` |
| Performance target numerik | ✓ | NFR-001..010 + Section 22 |
| Retention per entity | ✓ | Section 25 |
| Risks: Core FR non-trivial → ≥1 RISK | ✓ | FR-001→RISK-001, FR-004→RISK-002/012, FR-002→RISK-010, FR-007→RISK-005, FR-003→RISK-011 |
| Assumptions: Unresolved punya Linked Risk | ✓ | ASM-008→RISK-007; ASM-009→RISK-008 |
| Acceptance criteria: semua FR ada AC | ✓ | AC-001..AC-011 |
| Traceability matrix lengkap | ✓ | Section 28a |

**Outstanding Gaps:** tidak ada yang memblokir arsitektur. Dua hal perlu dikonfirmasi saat implementasi: (1) perilaku CORS Apps Script dari browser diverifikasi teknis di Phase 3 — bila berbeda, transport disesuaikan (fallback GET/JSONP), (2) ASM-008/009 masih `Unresolved` dan terkait RISK-007/008.
