# Database / Schema Design — Aplikasi Entry Nilai

**Version:** 1.0 · **Author:** `database-architect-pro` · **Store:** Google Sheets (single spreadsheet, 4 sheets)
**Input:** `docs/prd.md` §10–12, `docs/architecture.md`

> **Adaptasi jujur:** skill ini berorientasi PostgreSQL. Google Sheets **tidak menyediakan** FK constraint fisik, index, transaksi ACID, UUID generator, maupun Row Level Security. Setiap butir di bawah diterjemahkan ke mekanisme yang benar-benar tersedia di Sheets/Apps Script, dan deviasinya dinyatakan eksplisit — tidak berpura-pura ada fitur yang tidak ada.

---

## 1. Database Overview

- **Satu** spreadsheet milik sekolah, **4 sheet**, baris ke-1 = header (schema tetap).
- **Naming:** sheet `snake_case` tunggal (`siswa`, `nilai`, `konfig`, `log`); kolom `snake_case`.
- **Normalisasi:** 3NF — `siswa` (master peserta), `nilai` (fakta, merujuk siswa & konfig), `konfig` (master kelas/jenis/kode), `log` (fakta audit).
- **Ditoleransi (denormalisasi terkendali):** `nilai.kelas` & `nilai.jenis` disimpan **duplikat** dari `siswa.kelas` / `konfig` agar rekap per kelas tidak perlu JOIN dua sheet penuh (alasan performa — NFR-003). Integrity dipertahankan oleh validator aplikasi + kunci bisnis unik.
- **Owner:** owner spreadsheet (sekolah). **Akses tulis:** hanya lewat Apps Script (API), kecuali backup manual.

---

## 2. Entity List

| Entity | Purpose | Owner | Lifecycle | Retention | Audit |
|---|---|---|---|---|---|
| `siswa` | Master peserta didik | Sekolah | created → aktif → *nonaktif* (soft delete) | ≥ 5 tahun ajaran | Yes (FR-009) |
| `nilai` | Satu skor per siswa per penilaian | Sekolah | created → updated (upsert) | ≥ 5 tahun | Yes (before/after) |
| `konfig` | Master kelas, jenis, kode, parameter app | Sekolah | created → updated → *inactive* (soft delete) | Selamanya | Yes |
| `log` | Jejak audit | Sekolah | append-only → arsip > 2 tahun | 2 tahun | N/A (itu sendiri) |

---

## 3. Entity Definitions & Table Definitions

### 3.1 `siswa`

| Column | Type (Sheet) | Constraint | Default | Notes |
|---|---|---|---|---|
| `id` | string | **PK**, unik | `S-<8rand>` | Di-generate aplikasi. *Deviasi:* bukan UUID (terlalu panjang untuk dibaca manusia); 8 char random cukup untuk ~4 miliar kombinasi |
| `nis` | string | **unique** (case-insensitive), opsional | `""` | Business key; unik ditiru lewat cek aplikasi (Sheets tak punya UNIQUE) |
| `nama` | string | required, 2–80 char | — | Dibersihkan dari karakter kontrol |
| `kelas` | string | required, **FK → `konfig(key)` where `group='kelas'`** | — | FK logical, divalidasi handler |
| `status` | enum | `aktif` \| `nonaktif` | `aktif` | **Soft delete** (ADR-005) |
| `created_at` | ISO-8601 string | required | now | UTC |
| `updated_at` | ISO-8601 string | required | now | Dipakai deteksi konflik 2 tab (RISK-010) |
| `created_by` / `updated_by` | string | required | token subject | |

### 3.2 `nilai`

| Column | Type | Constraint | Default | Notes |
|---|---|---|---|---|
| `id` | string | **PK** | `N-<8rand>` | |
| `siswa_id` | string | **FK → `siswa.id`**, required | — | wajib berstatus `aktif` saat tulis |
| `kelas` | string | required | dari `siswa.kelas` | denormalisasi (performa rekap) |
| `jenis` | string | **FK → `konfig(key)` where `group='jenis'`** | — | |
| `kode` | string | **FK → `konfig(key)` where `group='kode'`** | — | |
| `mapel` | string | opsional | `"-"` | kolom persiapan (ASM-005) |
| `skor` | number | required, **0–100**, ≤1 desimal | — | BR-001 |
| `catatan` | string | opsional, ≤200 char | `""` | |
| `created_at` / `updated_at` | ISO-8601 | required | now | |
| `actor` | string | required | token subject | |

**Composite business key (BR-003):** `(siswa_id, kelas, jenis, kode)` — **satu baris per kombinasi**. Ini pengganti `UNIQUE` constraint: dibuat sebagai `Map` index oleh `REPO` setiap request (ADR-004) dan dijaga oleh logic upsert.

### 3.3 `konfig`

| Column | Type | Constraint | Default | Notes |
|---|---|---|---|---|
| `group` | enum | `kelas` \| `jenis` \| `kode` \| `app`, **part of PK** | — | |
| `key` | string | **part of PK**, unik per `group` | — | dipakai sebagai nilai FK di `siswa`/`nilai` |
| `label` | string | required, 1–40 char | = key | tampilan UI |
| `aktif` | boolean | required | `true` | soft delete (BR-004) |
| `urut` | number | required | urutan | pengurutan pilihan |
| `parent` | string | opsional | `""` | untuk `kode` → induk `jenis` |
| `updated_at` | ISO-8601 | required | now | |

> **PK gabungan** `group+key` dipakai karena ini data master tanpa identitas personal — cocok & mudah dibaca di sheet. *Deviasi dari "UUID PK" dibenarkan:* tidak ada relasi turunan yang menyimpan FK ke `konfig` (FK-nya menyimpan `key`, bukan id), sehingga tidak ada risiko rusak akibat perubahan PK.

### 3.4 `log`

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `ts` | ISO-8601 string | required | UTC, index waktu |
| `actor` | string | required | token subject / `unknown` |
| `action` | string | required | `INSERT`/`UPDATE`/`DEACTIVATE`/`LOGIN_OK`/`LOGIN_FAIL`/`PIN_CHANGE` |
| `entity` | enum | `siswa` \| `nilai` \| `konfig` \| `auth` \| `app` | |
| `entity_id` | string | required | id record / `group/key` |
| `before` | JSON string | opsional | **≤ 5000 char** (dipotong bila lebih) |
| `after` | JSON string | opsional | ≤ 5000 char |
| `request_id` | string | required | dipakai korelasi dengan Executions log |

---

## 4. Relationship Map

```
konfig ──(group='kelas')──1:N── siswa.kelas
konfig ──(group='jenis')──1:N── nilai.jenis
konfig ──(group='kode')───1:N── nilai.kode
siswa  ──────────────1:N────── nilai.siswa_id
siswa|nilai|konfig ──N:1────── log.entity+entity_id   (referensi lemah / polymorphic)
```

| Relasi | Type | FK | Delete behavior | Update behavior | Enforcement |
|---|---|---|---|---|---|
| `konfig(kelas)` → `siswa.kelas` | 1:N | logical | **RESTRICT** — entri terpakai tak bisa dihapus, hanya dinonaktifkan | Kunci `key` immutable setelah dipakai | Validator handler (`CONFIG_IN_USE`) |
| `konfig(jenis/kode)` → `nilai.*` | 1:N | logical | **RESTRICT** (BR-004) | idem | idem |
| `siswa` → `nilai` | 1:N | logical | **RESTRICT** — siswa tak bisa dihapus via API; hanya `nonaktif` | `id` immutable | Validator + ADR-005 |
| `log` → `entity` | N:1 (polymorphic) | reference lemah | **NO ACTION** — log tidak ikut berubah/dihapus saat record berubah | — | App |

**Orphan handling:** karena tidak ada hard delete via API, orphan dicegah by construction. Risiko tersisa = owner menghapus baris manual di sheet → ditangani `ensureSchema()` + kunci bisnis (bukan nomor baris), lihat RISK-014.

---

## 5. ERD (text)

```
konfig
├─ group (PK-1)
├─ key (PK-2)
├─ label
├─ aktif
├─ urut
├─ parent
└─ updated_at

siswa
├─ id (PK)
├─ nis (UQ)
├─ nama
├─ kelas ──────┐
├─ status      │
├─ created_at  │
├─ updated_at  │
└─ actor       │
               │
nilai          │
├─ id (PK)     │
├─ siswa_id ───┼──► siswa.id
├─ kelas ──────┼── (duplikat, denormalisasi)
├─ jenis ──────┼──► konfig(key) group='jenis'
├─ kode ───────┼──► konfig(key) group='kode'
├─ mapel       │
├─ skor        │
├─ catatan     │
├─ created_at  │
├─ updated_at  │
└─ actor       │
               │
log            │
├─ ts          │
├─ actor       │
├─ action      │
├─ entity ─────┼──► 'siswa'|'nilai'|'konfig' + entity_id (ref lemah)
├─ entity_id ──┘
├─ before
├─ after
└─ request_id

Composite business key (nilai): (siswa_id, kelas, jenis, kode)
```

---

## 6. Constraints

| # | Constraint | Type | Enforcement (realita Sheets) |
|---|---|---|---|
| C-01 | `nilai.skor` ∈ [0,100], ≤1 desimal | CHECK | Validator server (`vNilai`) + preview klien |
| C-02 | `nilai` unik per `(siswa_id,kelas,jenis,kode)` | UNIQUE | Index `Map` dibangun per request → upsert |
| C-03 | `siswa.nis` unik | UNIQUE | Scan kolom `nis` (lowercase) saat save |
| C-04 | `siswa.kelas` harus ada di `konfig` | FK | Set load master kelas → lookup Set |
| C-05 | `nilai.jenis/kode` harus aktif di `konfig` | FK | lookup; kode tak aktif → record ditolak |
| C-06 | `siswa.status ∈ {aktif,nonaktif}` | ENUM | Validator |
| C-07 | `nama` 2–80 char, tanpa kontrol | CHECK | Validator |
| C-08 | `log.before/after` ≤ 5000 char | CHECK | Dipotong + flag `truncated:true` |
| C-09 | Header sheet tidak boleh diubah manual | Schema | `ensureSchema()` cek & peringatkan |
| C-10 | Kolom wajib terisi (`created_at`,`actor`,…) | NOT NULL | Handler selalu mengisi |

---

## 7 & 8. Index Strategy (dibangun per-request, bukan fisik)

Sheets tidak punya index fisik → **index dibangun di memori saat handler membaca**, cukup untuk skala AR:

| Index | Key | Dibangun di | Melayani |
|---|---|---|---|
| **IX-01 PK siswa** | `id → rowIndex` | `REPO.readSiswa()` | validasi FK `siswa_id` |
| **IX-02 NIS siswa** | `lower(nis) → row` | idem | C-03 duplikat |
| **IX-03 siswa per kelas** | `kelas → [siswaId]` | idem | Entry & rekap per kelas |
| **IX-04 nilai kunci bisnis** | `siswa_id\|kelas\|jenis\|kode → rowIndex` | `REPO.readNilai(kelas)` | upsert O(1) |
| **IX-05 nilai per kelas** | `kelas → [nilaiRow]` | idem | Rekap |
| **IX-06 konfig** | `group → {key → entry}` | `REPO.readKonfig()` | validasi FK + dropdown |
| **IX-07 log time** | (bawaan urutan append) | — | `log.list` terbaru dulu |

**Reporting index:** rekap membaca **hanya sheet `nilai` terfilter `kelas`** (bukan full-scan gabungan) — ini setara *partition pruning* pada RDBMS. *Milestone:* bila `nilai` > 500k baris → pecah per tahun ajaran (`REPO` memilih sheet) = **partitioning strategy** Sheets.

---

## 9. Unique Constraints

| Natural key | Entity | Handling |
|---|---|---|
| `nis` | `siswa` | Cek case-insensitive sebelum tulis → `409 DUPLICATE_NIS` + identitas pemilik |
| `(siswa_id, kelas, jenis, kode)` | `nilai` | Kunci bisnis → **upsert** (update bila ada, insert bila belum) |
| `(group, key)` | `konfig` | PK gabungan → `409` bila duplikat |

*Deviasi:* tidak ada `PRIMARY KEY` fisik yang di-enforce Sheets → semua PK aplikasi (`id`) dan business key divalidasi di `REPO`, dibuktikan lewat QA (AC-002/AC-004).

---

## 10. Audit Strategy

- **Target:** `siswa.save`, `siswa.save` (status → nonaktif), `nilai.bulkSave` (hanya record yang **benar-benar berubah**), `konfig.save`, `konfig.remove`, `settings.changePin`, `auth.verify` (sukses/gagal).
- **Fields:** `actor`, `ts`, `action`, `entity`, `entity_id`, `before`, `after`, `request_id` → memenuhi PRD §20 (Who/When/Before/After/IP fallback `unknown`).
- **Integritas:** `log` **append-only** — tidak ada endpoint tulis/hapus manual (SEC / FR-009).
- **Failure:** gagal menulis log **tidak** membatalkan transaksi utama → response menyertakan `LOG_WRITE_FAILED`.
- **Retensi:** 2 tahun (lihat §15).

---

## 11. RLS Matrix (deviasi & padanan)

Sheets **tidak punya RLS**. Padanan yang benar-benar diterapkan:

| Role | Accessible rows | Restriksi | Enforcement point |
|---|---|---|---|
| `GURU` (satu-satunya role) | Seluruh baris di 4 sheet | — | — |
| **Tanpa token / token kadaluarsa** | **Tidak ada baris** | Semua endpoint data → `401` | `requireAuth()` di **router**, sebelum handler |
| Origin/tanpa PIN | Hanya `ping`, `auth.verify` | BR-010 | Router whitelist `PUBLIC_ACTIONS` |
| Publik (GitHub Pages) | Tidak ada data | Aset statis saja | Pages tidak memegang data |
| Owner via UI Sheets | Semua (bypass aplikasi) | Di luar kendali aplikasi | **Dicatat sebagai batasan** (RISK-001) — mitigasi: `log` tetap merekam aksi aplikasi, akses manual sheet hanya terlihat sebagai ketidakkonsistenan data |

> **Catatan:** ini *bukan* pengganti RLS. Jika kelak multi-role dibutuhkan, layer `requireRole(claim)` ditambahkan di router — struktur sudah menyiapkannya (PRD §5).

---

## 12. Reporting Strategy

| Report | Query pattern | Index dilayani | Optimasi |
|---|---|---|---|
| REP-001 Rekap kelas | `nilai WHERE kelas=?` → pivot di klien | IX-05, IX-03 | Baca 1 sheet terfilter; pivot di klien hemat round-trip |
| REP-002 Statistik kelengkapan | agregasi per kolom → **dihitung klien** | IX-05 | Tidak ada agregasi server-side mahal |
| REP-003 Log | `log` terakhir N | urutan append | `LIMIT` di server (baca dari bawah) |
| Entry nilai | `siswa WHERE kelas=?` + `nilai WHERE kelas,jenis,kode` | IX-03, IX-04 | `Promise.all` paralel |

**Export:** CSV dibentuk di **klien** dari data rekap yang sudah utuh → tanpa beban server, dengan quoting RFC 4180 + guard `=+-@`.

---

## 13. Migration Strategy

- **Initial migration:** `ensureSchema()` saat boot `ping`/`meta.get` — membuat sheet & menulis header bila belum ada (idempoten).
- **Incremental migration:** fungsi sama **menambah kolom baru** yang belum ada dengan default-nya → upgrade tanpa langkah manual (menopang BO-005).
  - Contoh terencana: `nilai.tahun_ajaran`, `nilai.mapel` (sudah ada), `siswa.sekolah_id` (multi-sekolah).
- **Rollback strategy:** schema **additive-only** (tidak pernah menghapus/mengubah tipe kolom yang ada) → rollback aplikasi aman tanpa rollback schema.
- **Data backfill:** kolom baru diisi default saat baca (`null`-safe), tidak perlu menulis ulang seluruh sheet.
- **Guard:** bila header sheet diedit manual menjadi tak dikenal → `SCHEMA_MISMATCH` warning di UI, bukan kegagalan diam-diam.

---

## 14. Backup Strategy

| Item | Frequency | Method | Retention |
|---|---|---|---|
| Full spreadsheet | Manual per semester (wajib saat awal/akhir semester) | Sheets ▸ File ▸ Download ▸ `.xlsx` | 5 tahun, simpan di Drive sekolah |
| `log` | Manual per kelas/semester | Ekspor CSV dari aplikasi | 2 tahun |
| Frontend | Git history (GitHub) | `git` | selamanya (rollback PRD §14) |

- **RTO:** ~1 hari (restore = upload `.xlsx` baru + `ensureSchema`).
- **RPO:** ~1 semester (sesuai cadangan manual).
- **Batasan jujur:** tidak ada backup otomatis di plan v1 → tercatat sebagai *Future Enhancement* (PRD §30.10). Owner WAJIB tahu ini — masuk `docs/deployment.md`.

---

## 15. Retention Strategy

| Entity | Period | Archive policy | Deletion policy | Compliance |
|---|---|---|---|---|
| `siswa` | ≥ 5 tahun ajaran | soft delete `status=nonaktif` | Hapus fisik **manual** owner bila > 5 tahun & tidak ada nilai | Data pendidikan → akses terbatas |
| `nilai` | ≥ 5 tahun | Split per tahun ajaran bila > 500k baris | Tidak dihapus via API (koreksi = update + log) | Riwayat rapor/akreditasi |
| `konfig` | Selamanya | `aktif=false` bila usang | Tidak dihapus bila terpakai (BR-004) | — |
| `log` | 2 tahun | Ekspor CSV → hapus baris > 2 tahun | Manual / trigger bulanan opsional | Audit trail |

---

## 16. Security Design (data)

| Aspek | Keputusan |
|---|---|
| Encryption at rest | Ditangani Google (Sheets/Drive default) — tidak ada yang perlu dikonfigurasi |
| Encryption in transit | HTTPS wajib (Pages & Apps Script) |
| Secrets | `PIN_HASH` **hanya** di Script Properties — tidak pernah di sheet, tidak pernah di repo |
| Sensitive data | Nilai & nama siswa → endpoint terproteksi token (BR-010) |
| Access control | Semua tulis lewat API; akses langsung sheet = owner saja |
| Injection | `setValue` bertipe (angka vs teks); tidak ada string kueri |
| CSV injection | Guard `=+-@` pada ekspor |
| Data isolation | Single-organization; filter `kelas` wajib di setiap query |

---

## 17. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| DB-R01 (=RISK-002) | Full-scan lambat saat data besar | Medium | Medium | Index per request, baca per kelas, milestone split per tahun |
| DB-R02 (=RISK-014) | Owner mengedit sheet manual (hapus header/baris, ubah tipe) | Medium | High | `ensureSchema()` idempoten, kunci bisnis (bukan nomor baris), warning `SCHEMA_MISMATCH` |
| DB-R03 (baru) | Tidak ada constraint fisik → data korup bisa lolos bila validator dilewati | Low | High | Validator **server-side** di semua jalur tulis; QA menyakinkan duplikat/skor-invalid ditolak (AC-002/AC-004) |
| DB-R04 (baru) | Sheet `log` tumbuh tanpa batas → lambat | Medium | Medium | Retensi 2 tahun + `log.list` LIMIT + baca dari bawah |
| DB-R05 (=RISK-012) | Concurrency: dua writer di sheet yang sama | Medium | Medium | LockService per batch, upsert kunci unik, deteksi `updated_at` |
| DB-R06 (baru) | Kehilangan data tanpa backup otomatis | Low | High | Backup manual wajib per semester (dokumentasi) + Future: backup terjadwal |

---

## 18. Recommendations

1. **Pertahankan `ensureSchema()` idempoten** sebagai satu-satunya jalur pembuatan/perubahan schema.
2. **Jangan pernah menulis baris berdasarkan nomor baris** — selalu cari lewat kunci bisnis (ADR-004).
3. **Backup `.xlsx` wajib** setiap awal & akhir semester; cantumkan di `deployment.md` sebagai langkah operasional, bukan opsional.
4. **Batasi `log`** sejak awal (`LIMIT` + retensi) — jangan biarkan menumpuk sampai lambat.
5. **Jika data `nilai` mendekati 500k baris**, lakukan split per tahun ajaran *sebelum* terasa lambat.
6. **QA wajib membuktikan** C-02 & C-03 (duplikat ditolak) — karena tidak ada constraint fisik, tes inilah "constraint"-nya.

---

## Validation Checklist

| Item | Status | Catatan |
|---|---|---|
| Entities complete | ✓ | 4 entity, purpose/owner/lifecycle/retention terisi |
| Relationships valid | ✓ | 4 relasi + 1 polymorphic, delete/update behavior eksplisit |
| Constraints defined | ✓ | C-01..C-10 + mekanisme enforcement asli (bukan asumsi RDBMS) |
| Indexes defined | ✓ | IX-01..IX-07 (per-request) + partitioning milestone |
| RLS defined | ✓ | Dinyatakan sebagai deviasi + padanan nyata (§11) |
| Audit defined | ✓ | §10, append-only, before/after |
| Retention defined | ✓ | §15 per entity |
| Backups defined | ✓ | §14 + RTO/RPO + batasan jujur (manual, belum otomatis) |
| Reporting supported | ✓ | §12 dengan index & optimasi per laporan |
| Migration defined | ✓ | §13 additive-only + idempotent |
