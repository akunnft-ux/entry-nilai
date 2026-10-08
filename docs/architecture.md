# Architecture — Aplikasi Entry Nilai

**Version:** 1.0 · **Date:** 2026-10-07 · **Author:** Tech Lead (`project-architect-pro`)
**Input:** `docs/prd.md` (PRD v1.0)

---

## 1. Architecture Overview

**Pola:** *Modular monolith* di sisi frontend (SPA statis) + *stateless function backend* (Google Apps Script) + *document store* (Google Sheets). Tidak ada proses server yang dijalankan, tidak ada build step.

```
┌──────────────────────────────────────────────────────────────┐
│  BROWSER (GitHub Pages — HTTPS, statis)                      │
│                                                              │
│  index.html ── css/ ── js/                                   │
│     ├─ app.js      bootstrap + hash router + guard           │
│     ├─ config.js   URL /exec, nama app, batas batch          │
│     ├─ api.js      transport (fetch POST → fallback JSONP)   │
│     ├─ store.js    cache meta + draft localStorage + sesi    │
│     ├─ ui.js       toast, modal, tabel, spinner, formatter   │
│     ├─ auth.js     SHA-256 PIN, token, logout                │
│     └─ pages/{login,entry,rekap,siswa,pengaturan}.js         │
└───────────────┬──────────────────────────────────────────────┘
                │ HTTPS  (POST text/plain — simple request,
                │         fallback GET JSONP bila CORS gagal)
                ▼
┌──────────────────────────────────────────────────────────────┐
│  GOOGLE APPS SCRIPT WEB APP  (/exec, deploy "Anyone")        │
│                                                              │
│  doPost/doGet ─► ROUTER (action registry)                    │
│      ├─ auth.*        verifikasi PIN, terbitkan token        │
│      ├─ meta.*        kelas / jenis / kode / info app        │
│      ├─ siswa.*       list / save                            │
│      ├─ nilai.*       list / bulkSave (upsert)               │
│      ├─ rekap.*       get (matriks per kelas)                │
│      ├─ konfig.*      list / save / remove                   │
│      ├─ log.*         list                                   │
│      ├─ settings.*    changePin                              │
│      └─ ping          health check                           │
│      cross-cutting: token guard → rate limit → validation    │
│      → transaction (LockService) → audit append              │
└───────────────┬──────────────────────────────────────────────┘
                │ SpreadsheetApp (same Google account)
                ▼
┌──────────────────────────────────────────────────────────────┐
│  GOOGLE SHEETS (1 spreadsheet, 4 sheet)                      │
│     siswa │ nilai │ konfig │ log                             │
│  + Script Properties: PIN_HASH (rahasia, tidak di repo)      │
│  + CacheService: token sesi & counter rate-limit             │
└──────────────────────────────────────────────────────────────┘
```

**Karakter:** tanpa framework, tanpa bundler, tanpa database kustom. Setiap keputusan di bawah ditekan terhadap dua nilai inti dari PRD: **(BO-005) mudah ditambah/dikurangi fitur** dan **(BO-003) nol biaya infrastruktur**.

---

## 2. Context Diagram

| Actor / System | Arah | Interaksi | Data flow |
|---|---|---|---|
| **Guru (End User)** | → Aplikasi | Buka URL Pages, isi PIN, entry nilai, rekap | Input nilai 0–100, pilihan kelas/jenis/kode |
| **Operator/Admin** | → Apps Script + Repo | Deploy `/exec`, isi `PIN_HASH`, set URL di `config.js`, push ke GitHub | URL `/exec`, hash PIN |
| **Owner Sekolah** | ↔ Google Sheets | Buka spreadsheet langsung untuk audit/backup | Baca mentah 4 sheet |
| **GitHub Pages** | → Internet | Serves aset statis | HTML/CSS/JS (tanpa data sensitif) |
| **Google Apps Script** | ↔ Sheets, Cache, Props | Backend | CRUD + validasi + audit |
| **Google Sheets** | ← Apps Script | Persistensi | 4 sheet |
| **Browser (klien)** | ↔ localStorage | Sesi, draft, cache meta | token, draft nilai, meta master |

Boundary keamanan: **B1** klien (tidak dipercaya) · **B2** Apps Script (otorisasi) · **B3** Sheets (hanya diakses B2) · **B4** Script Properties (rahasia, hanya B2).

---

## 3. Module Architecture

### 3.1 Frontend modules

| Module | Purpose | Responsibilities | Dependencies | Owns data | Public interface |
|---|---|---|---|---|---|
| `app.js` | Shell | Boot, hash router, route guard, register halaman, global error handler | config, auth, ui | route aktif | `App.router.go(hash)`, `App.registerPage(name, {title, render})` |
| `config.js` | Konfigurasi | `EXEC_URL`, nama app, `BATCH_SIZE=200`, timeout | — | — | `App.config.*` |
| `api.js` | Transport | Bangun envelope, kirim via fetch POST, fallback JSONP, retry+backoff, parsing error | config, auth | — | `App.api.call(action, payload)` → `Promise<envelope>` |
| `store.js` | State | Cache `meta` (kelas/jenis/kode), draft per (kelas,jenis,kode), dirty flag | localStorage | meta, draft | `App.store.getMeta()`, `.getDraft(k,j,c)`, `.setDraft(...)`, `.clearDraft(...)` |
| `auth.js` | Sesi | SHA-256 PIN (Web Crypto), simpan/hapus token, guard `isLoggedIn()`, cek kadaluarsa | api, store | token | `App.auth.login(pin)`, `.logout()`, `.token()`, `.ensureAuth()` |
| `ui.js` | Komponen | Toast, modal konfirmasi, spinner, tabel generik, format nilai, escape HTML | — | — | `App.ui.toast()`, `.confirm()`, `.table()`, `.fmtNilai()` |
| `pages/login.js` | Halaman | Form PIN, indikator koneksi, hitung mundur rate-limit | auth, ui | — | `App.registerPage('login', ...)` |
| `pages/entry.js` | Halaman | Filter kelas→jenis→kode, tabel massal, validasi sel, simpan batch | api, store, ui | dirty state | `App.registerPage('entry', ...)` |
| `pages/rekap.js` | Halaman | Matriks rekap, statistik, ekspor CSV | api, ui | — | `App.registerPage('rekap', ...)` |
| `pages/siswa.js` | Halaman | CRUD siswa, filter, soft delete | api, ui | — | `App.registerPage('siswa', ...)` |
| `pages/pengaturan.js` | Halaman | Tab konfig (kelas/jenis/kode), ganti PIN, log | api, ui, auth | — | `App.registerPage('pengaturan', ...)` |

**Aturan modul (BO-005):**
1. Satu fitur = satu file `js/pages/*.js`, mendaftarkan dirinya ke router via `App.registerPage`. Menambah fitur baru = 1 file baru + 1 tag `<script>`. **Tidak ada** `switch` raksasa di modul inti.
2. Halaman **tidak boleh** memanggil `fetch` langsung — hanya lewat `App.api.call` (transport terpusat, mudah diganti).
3. Halaman **tidak boleh** menyentuh `localStorage` langsung — lewat `App.store` / `App.auth`.
4. Komponen UI dipakai ulang dari `ui.js`, bukan di-copy antar halaman.

### 3.2 Backend modules (satu berkas `Code.gs`, terorganir per blok)

| Module (blok) | Purpose | Owned data | Interface |
|---|---|---|---|
| `ROUTER` | `doPost`/`doGet` → registry aksi; envelope seragam; catch-all error | — | `registerAction(name, fn, opts)` |
| `AUTH` | Hash PIN, terbitkan/validasi token, rate-limit | `PIN_HASH` (Props), token (Cache) | `verifyPin`, `issueToken`, `requireAuth`, `rateLimit` |
| `SCHEMA` | `ensureSchema()` — buat/kolom-kolom sheet bila belum ada | definisi 4 sheet | `sheet(name)`, `ensureSchema()` |
| `REPO` | Baca/tulis per sheet, index in-memory per request | 4 sheet | `readAll`, `upsert`, `appendLog`, `findAll` |
| `VALIDATOR` | Aturan input (BR-001..004) | — | `vNilai`, `vSiswa`, `vKonfig` |
| `AUDIT` | Append baris `log` (before/after) | sheet `log` | `log(actor, action, entity, id, before, after)` |
| `HANDLERS/{auth,meta,siswa,nilai,rekap,konfig,log,settings,ping}` | Kepatuhan logika per aksi | — | `fn(payload, ctx)` |

Router generik → **menambah aksi = `registerAction` satu baris**, tanpa mengubah `doPost` (memenuhi BO-005).

---

## 4. Layer Architecture (request lifecycle)

```
[1] Presentation   pages/*.js  render DOM, kumpulkan input, tampilkan state
        ↓ App.api.call(action, payload)
[2] Application    api.js: envelope + timeout + retry + fallback transport
        ↓ HTTPS
[3] Edge           doPost(e) / doGet(e) → parse body/query → ROUTER
        ↓ requireAuth(token) + rateLimit(action)
[4] Domain         VALIDATOR (BR-*) → HANDLERS (logika bisnis)
        ↓
[5] Persistence    REPO → SpreadsheetApp (LockService saat tulis)
        ↓
[6] Audit          AUDIT → sheet log (append-only)
        ↑
   envelope {ok,data|error,requestId} → [2] → [1] parse → render
```

Setiap layer hanya bicara dengan layer tetangganya. `pages/*.js` tidak pernah tahu spreadsheet; `Code.gs` tidak pernah tahu DOM.

---

## 5. Feature Architecture (alur fitur inti)

### 5.1 Entry nilai (FR-003 + FR-004) — Core

- **Inputs:** `kelas`, `jenis`, `kode` (filter) → `{siswa_id: nilai}` (sel tabel).
- **Flow:**
  1. `meta.get` (sekali per sesi, lalu cache di `store`).
  2. `siswa.list{kelas}` + `nilai.list{kelas,jenis,kode}` → **gabung di klien** menjadi baris tabel (2 request paralel, `Promise.all`).
  3. User mengisi → tiap keystroke validasi lokal (0–100, ≤1 desimal) → tulis draft ke `localStorage` (debounce 300 ms) → set dirty flag.
  4. **Simpan** → validasi seluruh batch lokal → `nilai.bulkSave` (chunk 200) → `Promise.all` antar chunk → gabung ringkasan → `clearDraft` → toast.
- **Outputs:** `{inserted, updated, skipped[]}` + baris log.
- **Permissions:** token valid (server-side), bukan hanya disembunyikan di UI.
- **Events:** `entry:saved` (event bus sederhana `CustomEvent` pada `document`) → rekap & badge dirty ikut ter-refresh.
- **Audit:** tiap record berubah → `log` before/after (BR-006).

### 5.2 Rekap (FR-005/006)

- **Flow:** `rekap.get{kelas}` → render `<table>` (kolom = seluruh `jenis+kode` kelas) → statistik per kolom dihitung **klien** (data sudah sampai utuh) → CSV dibuat via `Blob` + `URL.createObjectURL` (murni klien, tanpa request).
- **Guard CSV:** setiap sel yang diawali `= + - @` diberi prefix `'` (mencegah formula injection saat dibuka di Excel) — SEC-008.

### 5.3 Master siswa (FR-002)

- Form + tabel dalam satu halaman. Simpan batch; record invalid masuk `skipped[]` (bukan membatalkan seluruh batch). Nonaktif = ubah `status`.

---

## 6. Data Flow (contoh end-to-end: simpan 30 nilai)

```
user klik [Simpan]
 → pages/entry.js   kumpulkan dirty rows → local validate (BR-001)
 → api.js           {a:"nilai.bulkSave", token, records:[…30]}
                    chunk[30] ≤ BATCH_SIZE(200) → 1 request
 → fetch POST text/plain (simple request, tanpa preflight)
      ↓ GAGAL (TypeError/CORS/network)
 → fallback: GET JSONP  ?a=nilai.bulkSave&cb=…&p=<urlenc>
 → Code.gs doPost  parse → ROUTER → requireAuth(token)
                    → rateLimit("nilai.bulkSave") 30/menit
                    → VALIDATOR (per record) → LockService(30s)
                    → REPO index = Map("siswaId|kelas|jenis|kode" → row)
                    → tulis insert/update (setValues batch, bukan per-sel)
                    → AUDIT append log (hanya yang benar2 berubah)
                    → release lock
 → envelope {ok:true, data:{inserted:0,updated:30,skipped:[]}}
 → pages/entry.js   clearDraft → toast "30 nilai tersimpan" → render ulang
```

**Validasi:** dua lapis — klien (UX, cepat) & server (otoritatif, tidak bisa dilewati). Klien hanya *preview*; keputusan akhir selalu server.

**Failure handling (ringkas):**

| Kegagalan | Detection | Recovery | Fallback |
|---|---|---|---|
| Jaringan putus | `fetch` TypeError / timeout 15 s | Retry 3× (300/600/1200 ms) | Draft lokal tetap, tombol "Coba lagi" |
| CORS / respons tak terbaca | gagal parse JSON setelah 3× | **JSONP GET** (transport cadangan) | Pesan jelas bila keduanya gagal |
| Token kadaluarsa | `401 INVALID_TOKEN` | Kembali ke `#/login`, draft dipulihkan setelah login | — |
| Kuota Apps Script | `429 QUOTA_EXCEEDED` | Tunggu 1 menit, jangan retry agresif | Draft utuh |
| Sheet terkunci | LockService timeout → `503 SHEET_BUSY` | Retry 3× backoff | Pesan "tutup tab Google Sheets" |
| Sheet/kolom hilang | `getDataRange` gagal / header tak cocok | `ensureSchema()` re-create + warning | Lanjut dengan data yang ada |
| Script error | try/catch global di router | Envelope `{ok:false, code:"INTERNAL"}` (bukan halaman error Google) | `requestId` untuk telusuri di Apps Script logs |

---

## 7. Integration Design

| Integration | Direction | Trigger | Payload | Error handling | Retry |
|---|---|---|---|---|---|
| Apps Script `/exec` | Browser → GAS | Setiap `App.api.call` | Envelope JSON `{a, token?, …}` di body (POST) atau query (GET-JSONP) | Envelope `{ok:false,error{code,message}}`; timeout 15 s | 3× backoff, lalu fallback transport, lalu gagal-tertangani |
| Google Sheets | GAS → Sheets | Handler yang baca/tulis | Range/objek sel | `ensureSchema()`, LockService, catch → `INTERNAL` | 3× untuk lock |
| Script Properties | GAS → Props | `auth.verify`, `settings.changePin` | `PIN_HASH` | Belum di-set → `PIN_NOT_CONFIGURED` + langkah setup | — |
| CacheService | GAS ↔ Cache | Token & rate-limit | key/value, TTL | Cache miss → anggap belum login / reset counter | — |
| GitHub Pages | Dev → Pages | `git push` ke `main` | aset statis | Build gagal → versi lama tetap online | `git revert` (rollback) |
| Web Crypto | Browser internal | Submit PIN | `crypto.subtle.digest('SHA-256')` | Konteks non-secure → blokir boot, pesan "akses via HTTPS" | — |

**Kontrak transport (keputusan kritis — lihat ADR-002):**

```
PRIMARY  : POST  URL/exec
           Content-Type: text/plain;charset=utf-8   ← safelisted, TANPA preflight
           body: JSON.stringify({a, token, ...})
FALLBACK : GET   URL/exec?cb=<namaCallback>&p=<urlencoded JSON>
           → <script> tag (JSONP) — selalu lolos CORS
           dipakai bila primary gagal membaca respons
SERVER   : doGet & doPost memanggil handler yang SAMA.
           Output JSONP ditulis manual: `cb(...)` dengan MimeType.JAVASCRIPT
           SEMUA jalur di-wrap try/catch → selalu mengembalikan body non-kosong
```

---

## 8. Authorization Design

```
Boot → token di localStorage?
   ├─ tidak  → #/login (public)
   └─ ya     → setiap API menyertakan token
        Server: CacheService.get("tok:"+token)
           ├─ miss/kadaluarsa → 401 INVALID_TOKEN → UI → #/login
           └─ ok → rateLimit(action) → handler
```

- **Authentication:** PIN (4–8 digit) → SHA-256 di klien → dibandingkan dengan `PIN_HASH` di **Script Properties** (bukan pernah plaintext di sheet/log) → terbitkan token acak 32 hex, TTL 6 jam, disimpan `CacheService` (BR-007/SEC-001).
- **Authorization:** satu role `GURU`; server menolak tanpa token di **semua** endpoint data (BR-010). Endpoint publik hanya `ping` & `auth.verify`.
- **Rate limiting:** `auth.verify` 5/15 menit; tulis 30/menit; baca 60/menit (counter di CacheService).
- **Resource ownership:** setiap payload difilter terhadap `kelas` pada record — kelas tidak valid → `422`, bukan "baca semua".
- **Frontend guard bersifat UX saja.** Otorisasi otoritatif hanya di server; menyembunyikan tombol bukan keamanan.

---

## 9. Audit Design

| Action | Actor | Timestamp | Target | Before | After |
|---|---|---|---|---|---|
| `siswa.save` (insert/update) | token subject | ISO-8601 UTC | `siswa/<id>` | `{}` / row lama | row baru |
| `siswa.save` (status) | idem | idem | `siswa/<id>` | `{status:"aktif"}` | `{status:"nonaktif"}` |
| `nilai.bulkSave` (per record berubah) | idem | idem | `nilai/<id>` | `{nilai:78}` | `{nilai:85}` |
| `konfig.save` / `konfig.remove` | idem | idem | `konfig/<group>/<key>` | row lama | row baru / `{aktif:false}` |
| `settings.changePin` | idem | idem | `app/PIN_HASH` | `{pin:"***"}` (tidak pernah nilai asli) | `{pin:"***"}` |
| `auth.verify` (sukses & gagal) | input PIN (hashed) / unknown | idem | `auth` | `{}` | `{result:"ok"/"fail"}` |

**Aturan:** append-only — tidak ada endpoint tulis/hapus `log`. Nilai identik → tidak ada baris log (log tetap bersih). Retensi 2 tahun (PRD §25).

---

## 10. Observability Design

- **Application log:** envelope `requestId` (8 hex) → dicocokkan dengan `console.log` di Apps Script *Executions* dashboard (gratis, bawaan).
- **Audit log:** sheet `log` — bisa dibuka owner kapan saja.
- **Error log:** `try/catch` global di router → `console.error(requestId, err)` + envelope `INTERNAL`.
- **Activity log:** `auth.verify` sukses/gagal masuk `log`.
- **Monitoring:** `ping` (dipanggil saat boot) → indikator status koneksi di header UI.
- **Alerting:** tidak ada (di luar skala sekolah; tercatat di PRD §19 placeholder).
- **Client diagnostics:** `window.__appDebug` berisi `{lastRequestId, lastTransport, lastError}` untuk membantu debug dari sisi guru.

---

## 11. Security Design (ringkas — detail di PRD §21)

| Aspek | Keputusan |
|---|---|
| Transport | HTTPS only; app menolak boot di konteks non-secure |
| Rahasia | Tidak ada di repo. `PIN_HASH` di Script Properties. URL `/exec` dianggap publik (by design) |
| PIN | SHA-256 (klien) → hash disimpan → rate-limit 5/15 menit. Batasan jujur: tanpa KDF → RISK-007, jalur upgrade Google Sign-In (PRD §30) |
| Sesi | Token acak 128-bit, TTL 6 jam, server-side di CacheService; logout = hapus lokal + invalidasi cache |
| Otorisasi | Server-side di semua endpoint data; tidak ada data tanpa token |
| Injection | Semua tulis via `setValue` bertipe; CSV diformat ulang dengan guard `=+-@` |
| Data exposure | Error generik ke klien (tanpa stack/URL sheet) |
| Audit | FR-009 append-only |

---

## 12. Performance Strategy

| Masalah | Strategi |
|---|---|
| Sheets full-scan mahal | Baca **per kelas** (bukan seluruh sheet) untuk entry & rekap; bangun index `Map` sekali per request |
| Banyak request kecil | Gabung `siswa.list` + `nilai.list` via `Promise.all`; `meta` di-cache per sesi |
| Tulis lambat | Batch `setValues` (1 call per rentang), bukan per-sel; chunk 200 record; LockService singkat |
| Payload besar | Chunk 200 + ringkasan gabungan |
| Frontend berat | Tanpa framework; total aset target < 300 KB (NFR-010); lazy render per halaman |
| Cold start GAS | Indikator loading + pesan bila > 6 s; retry otomatis sekali |

---

## 13. Scalability Strategy

- **Kapasitas saat ini (AR):** 1–10 guru, ≤ 3 simultan, ~1.600 siswa, ~32k baris nilai/tahun.
- **Pendekatan:** *vertical / optimization first* — tidak ada horizontal scaling yang relevan (serverless Google).
  1. **Optimasi:** index per-request + baca per kelas + batch write.
  2. **Milestone:** `nilai` > 500k baris → split sheet per tahun ajaran (tambah kolom `tahun_ajaran`, `REPO` memilih sheet — perubahan lokal di 1 modul).
  3. **Growth:** multi-sekolah → tambah `sekolah_id` + filter wajib di `REPO` (endpoint tidak berubah).
- **Batasan terdokumentasi:** kuota Apps Script per hari (URL fetch / runtime) → dicegah dengan batch + rate-limit, bukan panggilan per-baris.

---

## 14. Deployment Architecture

```
Developer ── git push ──► GitHub repo ──► GitHub Pages (main:/root)
                                          └─ .nojekyll (aset dilayap apa adanya)

Operator ── Google Apps Script Editor ── Deploy ▸ New deployment (Web app)
                                          ├─ Execute as: Me
                                          ├─ Who has access: Anyone   ← wajib
                                          └─ Has access to: Anyone, even anonymous
                                       ──► URL /exec  (salin ke js/config.js)
```

- **Environment:** satu — `js/config.js` berisi `EXEC_URL`. Tidak ada `.env` (Pages tidak punya env vars). `PIN_HASH` hanya di Script Properties.
- **Rollback frontend:** `git revert` (Pages selalu menyajikan commit terakhir yang sukses).
- **Rollback backend:** Apps Script ▸ Deploy ▸ *Manage deployments* → pilih versi sebelumnya.
- **Migration:** `ensureSchema()` idempoten — menambah kolom baru otomatis, tanpa migrasi manual.
- **Langkah lengkap & checklist:** `docs/deployment.md`.

---

## 15. Architecture Decision Records

### ADR-001 — SPA statis tanpa framework & tanpa build step
- **Decision:** HTML + CSS + JS murni, namespace `App.*`, `<script>` biasa (bukan ES modules).
- **Reason:** Permintaan eksplisit user; deploy = salin file; guru tidak butuh toolchain; aset < 300 KB.
- **Alternatives:** React/Next (butuh build & hosting berbeda); ES modules (gagal dibuka via `file://`, menyulitkan debugging lokal).
- **Tradeoff:** disiplin modul dijaga aturan (§3.1) & code review, bukan oleh compiler/bundler.
- **Final:** tanpa framework, non-module scripts.

### ADR-002 — Transport: fetch POST `text/plain` + fallback JSONP GET
- **Decision:** POST dengan `Content-Type: text/plain;charset=utf-8` (CORS *simple request* → **tanpa preflight OPTIONS**, yang tidak didukung Apps Script) dan fallback JSONP via `doGet` bila respons tidak terbaca.
- **Reason:** `TextOutput` **tidak punya** API `setHeader(s)` (diverifikasi dari reference resmi) → header CORS tidak bisa kita kontrol. Apps Script hanya memproses GET/POST, bukan OPTIONS. Banyak laporan "CORS error" justru akibat (a) `Content-Type: application/json` memicu preflight, (b) `doPost` tidak mengembalikan nilai sehingga Google menyajikan halaman error tanpa header CORS.
- **Alternatives:** `application/json` (→ preflight → gagal); `no-cors` (respons tak terbaca); iframe form POST (respons lintas-origin tak terbaca); JSONP saja (token & nilai terekspos di URL & history).
- **Tradeoff:** fallback JSONP menaruh token di query string — hanya dipakai bila jalur utama gagal; risiko dicatat di `docs/security-notes` dan dapat dimatikan lewat `config.js`.
- **Final:** primary POST text/plain, fallback JSONP GET, keduanya menembus handler yang sama di server.

### ADR-003 — Token sesi via `CacheService`, bukan JWT di klien
- **Decision:** token acak disimpan server-side dengan TTL.
- **Reason:** JWT butuh secret signing yang tidak aman disimpan di repo statis; CacheService memberi invalidasi langsung (logout) tanpa secret.
- **Alternatives:** JWT (secret bocor ke klien/repo); tanpa sesi (setiap request PIN → UX buruk).
- **Tradeoff:** token hilang bila cache di-flush → user login ulang (diterima; draft lokal selamat).
- **Final:** opaque token + CacheService.

### ADR-004 — Upsert berbasis kunci unik, bukan nomor baris
- **Decision:** kunci `siswa_id|kelas|jenis|kode` → index `Map` dibaca sekali per request.
- **Reason:** nomor baris berubah bila owner menghapus/mengurutkan sheet manual; kunci bisnis stabil (BR-003).
- **Alternatives:** `appendRow` selalu (duplikat); cari baris per record (O(n²), lambat).
- **Tradeoff:** perlu index dibangun tiap request (murah untuk <100k baris).
- **Final:** kunci bisnis + index per request.

### ADR-005 — Soft delete untuk `siswa` & `konfig`
- **Decision:** `status=nonaktif` / `aktif=false`, tidak ada penghapusan fisik via API.
- **Reason:** nilai historis merujuk siswa — hapus fisik membuat rekap yatim (PRD BR-002/BR-004).
- **Alternatives:** hard delete + cascade (kehilangan riwayat); foreign key tak tersedia di Sheets.
- **Final:** soft delete.

### ADR-006 — Audit sebagai sheet `log` terpisah, bukan kolom di `nilai`
- **Decision:** append-only `log` dengan `before`/`after`.
- **Reason:** kolom audit di `nilai` hanya menyimpan 1 versi terakhir; PRD BO-006 menuntut riwayat.
- **Tradeoff:** sheet `log` tumbuh → retensi 2 tahun (PRD §25).
- **Final:** sheet `log`.

---

## 16. Risks (arsitektur)

| ID | Risk | Mitigation (arsitektur) |
|---|---|---|
| RISK-001 | Endpoint publik; keamanan bertumpu pada PIN+token | Hashed PIN di Props, rate-limit 5/15 mnt, token TTL 6 jam, minimal endpoint publik, error generik; jalur upgrade Sign-In |
| RISK-002 | Full-scan Sheets lambat saat data besar | Baca per kelas + index per request + milestone split per tahun ajaran |
| RISK-004/012 | Kuota & lock Apps Script | Batch 200, LockService + backoff, rate-limit, pesan `429/503` yang jelas |
| RISK-008 | URL `/exec` salah → app tak terhubung | `ping` saat boot + wizard setup + `docs/deployment.md` |
| RISK-010 | Dua tab menulis baris sama | Upsert kunci unik + deteksi `updated_at` + peringatan reload |
| RISK-011 | Draft hilang saat sesi habis | Draft `localStorage` per k/j/kode + pemulihan pasca-login |
| **RISK-013 (baru)** | Perilaku CORS Apps Script dapat berubah / bervariasi per deployment | ADR-002: transport ganda teruji otomatis; `ping` mendeteksi dini; keduanya gagal → pesan setup yang jelas |
| **RISK-014 (baru)** | Owner mengedit sheet manual (hapus baris/kolom, ubah header) | `ensureSchema()` idempoten + kunci bisnis (bukan nomor baris) + peringatan bila header tak dikenal |

---

## 17. Recommendations

1. **Mulai dari `ping`** — verifikasi transport & skema sebelum menulis apa pun (menutup RISK-008/013 lebih awal).
2. **Jangan pernah mengembalikan output kosong** dari `doGet`/`doPost` — ini penyebab CORS-error terselubung yang paling sering.
3. **Redeploy versi baru** Apps Script setiap ubah kode (`Deploy ▸ Manage deployments ▸ Version: New version`).
4. **Aktifkan rate-limit** sejak hari pertama, bukan setelah insiden.
5. **Pertahankan aturan modul §3.1** — disiplin ini yang menjamin BO-005 tetap terpenuhi saat fitur bertambah.
6. **Jalankan code review + QA + security review** sebelum menempelkan URL produksi (quality gate wajib).

---

## Validation Checklist

| Item | Status |
|---|---|
| Modules identified | ✓ 11 modul frontend + 8 blok backend, tanpa overlap |
| Responsibilities clear | ✓ §3 (tabel purpose/responsibilities/owned data/interface) |
| Permissions defined | ✓ §8 + PRD §5/§21 (server-side, bukan hanya UI) |
| Integrations defined | ✓ §7 (payload + error + retry per integrasi) |
| Audit strategy defined | ✓ §9 (actor, ts, before/after, append-only) |
| Scalability defined | ✓ §13 (kapasitas, milestone, growth lever) |
| Observability defined | ✓ §10 (app/audit/error/activity log, monitoring, no-alert rationale) |
| Deployment strategy defined | ✓ §14 (deploy + rollback + migration) |
| Risks identified | ✓ §16 (termasuk 2 risiko baru dari verifikasi teknis) |
| ADRs documented | ✓ 6 keputusan besar dengan alternatif & tradeoff |
