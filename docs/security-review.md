# Security Review (Phase 8)

Penilai: skill `security-auditor-pro` · Basis bukti: baca kode `apps-script/Code.gs` + `js/**`, tes harness `node test/run_backend_tests.js` (55 asersi), `node --check`.

> Aturan release skill: deployment **diblokir** bila Critical > 0 atau High > 0.

---

> ## ⚠️ Pembaruan v2.0.0 — model keamanan berubah (publik token)
>
> Aplikasi kini memakai Turso (libSQL) langsung dari browser tanpa server
> aplikasi. **Token database tertanam di `js/config.js` = publik.** Siapa pun
> yang memiliki URL halaman dapat membaca/menulis database. Ini **keputusan
> yang disadari** untuk pemakaian pribadi satu pengguna (prioritas: kecepatan
> & sinkronisasi HP+laptop, tanpa server). Review di bawah (berbasis Apps
> Script) tetap valid untuk bagian lain (validasi input, output escaping,
> proteksi integritas, audit log) karena logika divalidasi ulang di
> `js/backend/engine.js`. Untuk skenario multi-user, wajib pindah ke
> proxy/Worker yang menyimpan token di sisi server.

## 1. Security Overview

Aplikasi client (HTML/JS/CS murni di GitHub Pages) berbicara ke Web App
Google Apps Script (POST `text/plain`, fallback GET JSONP). Pelindung: PIN +
token sesi, rate limit, validasi server, output escaping, audit log.
Tidak ada secret di repositori (tanpa bundler/env via ADR-001).

Stack relevan OWASP yang diaplikasikan: Broken Access Control, Cryptographic
Failures, Injection, Security Misconfiguration, Authentication Failures,
Logging Failures.

---

## 2. Findings

### F-1 Authentication — PIN & token (Low)
- PIN di-hash client (`sha256(pin)`), server menyimpan **double-hash**
  `sha256(sha256(pin))` di Script Property `PIN_HASH` (tipe hash chain). PIN
  plaintext tidak pernah disimpan/dikirim. Client pakai `crypto.subtle`
  (secure context) dengan fallback SHA-256 murni-JS di non-secure.
- Token sesi random (UUID) di `CacheService`, TTL 6 jam; diverifikasi per
  request; logout mencabut token.
- **Catatan (diterima):** Apps Script tidak expose alamat IP → rate limit
  `auth.verify` 5/15menit bersifat **global per script**, bukan per-klien.
  Dampak: DoS diri sendiri lebih mungkin daripada brute force terisolasi.
  Di-mitigasi: reset bucket saat login berhasil; `error.details` disembunyikan
  pada `INVALID_PIN` (anti-fingerprint loop).
- `settings.changePin` memvalidasi PIN lama + menolak PIN baru = lama (`WEAK_PIN`).

### F-2 Authorization / Access Control (Pass)
- **Tidak ada role** (sistem single-user guru) → kontrol sederhana; tidak ada
  kebutuhan pembagian resource antar pengguna.
- Path dilindungi: semua aksi selain `ping` + `auth.verify` melempar
  `INVALID_TOKEN` tanpa token valid (diverifikasi di harness [2]).
- Proteksi integritas: `konfig.remove` diblokir bila dipakai
  (`CONFIG_IN_USE`); nilai hanya bisa dibuat untuk `kelas/jenis/kode`
  terdaftar & siswa aktif.

### F-3 Injection (Pass)
- **SQL/NoSQL:** tidak ada query DB; storage = Sheet via API resmi (nilai
  string diset lewat `Range.setValues`), tidak ada string query dinamis.
- **XSS:** semua render UI via helper `ui.esc()`/`ui.el`; `ui.table` meng-esc
  `cls`, `id`, `label`, `data-id`; konten sel di-esc. Input dari user
  (nama siswa, catatan, label konfig) tidak pernah di-inject mentah.
- **CSV Injection (SEC-008):** `ui.csvCell()` me-prefiks `'` pada sel yang
  diawali `= + - @` — diverifikasi di `ui.js:233`.
- **JSONP callback injection:** `respond_` memvalidasi nama callback dengan
  regex `^[A-Za-z_$][0-9A-Za-z_$]{0,63}$`, fallback `'callback'` — prevent
  prototype/global pollution via `cb` dari GET.

### F-4 Input validation (server) (Pass)
- Skor: numerik, 0–100, maksimal 1 desimal (bukan string lewat).
- NIS/Grup/key: panjang + validasi; key konfig ≤ 40 char, pola aman;
  nomor induk unik (case-insensitive) di-cek per batch.
- Batch maks 200/request (`BATCH_SIZE`).
- Null di-koersi jadi kosong (`pick_`), duplikat batch last-wins, siswa tak
  dikenal di-skip — semua menghasilkan `skipped[].reason` bukan crash.

### F-5 Rate limiting (Pass)
- Per-aksi: `auth.verify` 5/15m, tulis (siswa/nilai/konfig/log) 30/m, baca
  60/m; tanpa token → bucket tak terpakai. Retry di-frontend: backoff
  eksponensial + `RATE_LIMITED` menampilkan `retryIn`.
- Konkurensi: `LockService().tryLock(10s)` mencegah tulis bersamaan pada
  sheet (`SHEET_BUSY`).

### F-6 Data protection & PII (Informational)
- Data siswa (nama/NIS) = PII. Ditampilkan hanya setelah login; tidak ada
  ekspor API; CSV rekap bisa menurunkan data (hanya via koneksi aktif).
- Sheet spreadsheet mode default Google Drive ACL — **disarankan** pengaturan
  bagikan hanya ke akun owner (bukan "siapa pun dengan link").
- Tidak ada enkripsi-at-rest di sisi sheet (batasan platform); token & PIN
  hash tidak tersimpan di sheet.

### F-7 Secrets (Pass)
- `APP_PASSWORD` dipakai opsional sbg lapis pembeda deploy (Script Property,
  tidak dihardcode); `EXEC_URL` publik di `js/config.js` (alamat Web App —
  bukan secret); tidak ada key API Google di repositori.

### F-8 Audit logging (Pass)
- `appendLog_` mencatat create/update/delete/activate-area +
  `LOGIN_OK`/`LOGIN_FAIL`(actor `unknown`)/`LOGOUT` + ts. Log tidak pernah
  menggagalkan transaksi utama; `CTX.warnings` dibawa ke respon.

---

## 3. Severity Matrix

| Severity | Jumlah | Item |
|---|---|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 0 | — |
| Low | 1 | F-1: rate-limit auth global per script (keterbatasan platform) |
| Informational | 2 | F-6: share-level sheet default; F-3: fallback SHA-256 murni-JS pada non-secure |

## 4. Risks

- **R1 (Low):** DoS terisolasi tidak mungkin, tapi kelelahan global bucket roboh
  `auth.verify` utk semua klien selama <15 menit; penggantian PIN tidak di-blokir
  (bucket per-sesi).
- **R2 (Informational):** PIN 4–8 digit — bila password auth sangat pendek dan
  tidak ada trottling per-IP, brute force offline terhadap hash mungkin. Mitigasi
  terpasang: hash chain server-side, rate limit, tanpa detail error.
- **R3 (Informational):** Data di sheet tanpa enkripsi-at-rest kustom.

## 5. Recommendations

1. (R1) Tetap; dokumentasikan bucket global di README; opsional: log per-PIN
   pattern lewat `LOGIN_FAIL` untuk deteksi laser.
2. (R2) Pertahankan kebijakan PIN server (WEAK_PIN utk = lama); dorong PIN ≥ 6
   digit di UI setup.
3. (R3) Batasi berbagi spreadsheet ke owner + akun service, nonaktifkan "link
   share" publik.
4. Setelah deploy: pantau log `LOGIN_FAIL` & `RATE_LIMITED` sepekan pertama.

## 6. Release Decision

**DISETUJUI UNTUK DEPLOY.**
Tidak ada temuan Critical/High/Medium yang belum ditutup. Item Low &
Informational adalah keterbatasan platform + praktik yang harus dijaga
(rekomendasi §5). Gerbang E2E & NFR (lihat `docs/qa-test-plan.md` §5) tetap
wajib dieksekusi setelah deploy.