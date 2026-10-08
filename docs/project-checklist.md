# Project Checklist — Entry Nilai (v1.0.0)

Ringkasan final per skill checklist (`project-checklist`). Setiap baris berdasar
buKti (file/docs/tests), bukan klaim.

---

## Discovery & PRD
| Item | Status | Bukti |
|---|---|---|
| Masalah & pengguna teridentifikasi | PASS | `docs/prd.md` §1–3 |
| Tujuan bisnis & metrik (BO-xxx) | PASS | `docs/prd.md` §4 |
| Traceability ID FR/API/SEC/RISK → ASM | PASS | `docs/prd.md` matrix |
| Cakupan & non-cakupan v1 | PASS | `docs/prd.md` §3.5 |
| Asumsi & risiko (RISK-00x) | PASS | `docs/prd.md` §8 |

## Architecture
| Item | Status | Bukti |
|---|---|---|
| ADR terpilih (ADR-001..006) & keputusan transport | PASS | `docs/architecture.md` + ADR-002 |
| Pemisahan domain, registry aksi | PASS | `Code.gs` (16 `registerAction`); `docs/code-review.md` |
| Token TTL konsisten (6 jam) | PASS | `Code.gs TOKEN_TTL_SEC`=21600 `config.js` 6h, docs diselaraskan |
| Rating & penjadwalan (tanpa framework) | PASS | `docs/architecture.md` ALR/storage |

## Database (Google Sheets)
| Item | Status | Bukti |
|---|---|---|
| Schema 5 sheet & kunci bisnis | PASS | `docs/schema.md`; `ensureSchema_` (4 sheet) |
| Integritas referensial & soft-delete | PASS | harness tes [4][7]; `docs/architecture.md` |
| Migrasi additive-only | PASS | ADR-006; deployment §Rollback |

## UI & UX
| Item | Status | Bukti |
|---|---|---|
| Spesifikasi layout 4 halaman | PASS | `docs/ui-spec.md` (source-of-truth, gap pencil.dev tercatat) |
| Konsistensi komponen & empty-state | PASS | `js/ui.js`; `docs/code-review.md` (§UI) |

## Implementation
| Item | Status | Bukti |
|---|---|---|
| Frontend 5 halaman + api/http transport | PASS | `js/**` (`index.html` script order) |
| Backend router & 16 aksi terdaftar | PASS | `apps-script/Code.gs` |
| Sintaks valid semua file | PASS | `node --check` (js + Code.gs) |
| Setup wizard `EXEC_URL` kosong | PASS | `app.js` §wizard |

## QA
| Item | Status | Bukti |
|---|---|---|
| Tes fungsional backend (harness) | PASS | `test/run_backend_tests.js` → **55 PASS / 0 FAIL** |
| Bug yang ditemukan & diperbaiki | PASS | `docs/qa-test-plan.md` §2 (4 bug nyata) |
| Test plan E2E + NFR-003 | CANNOT VERIFY | butuh deploy Google; `docs/qa-test-plan.md` §4–5 |

## Security
| Item | Status | Bukti |
|---|---|---|
| Auth sesi & rate-limit terverifikasi | PASS | `docs/security-review.md` (§2 F-1..F-8) |
| Tidak ada Critical/High/Medium | PASS | severity matrix §3 |
| Release decision DISETUJUI | PASS | `docs/security-review.md` §6 |

## Deployment
| Item | Status | Bukti |
|---|---|---|
| Panduan deploy lengkap (Apps Script + Pages) | PASS | `docs/deployment.md` (+ `APP_PASSWORD` opsional, monitoring) |
| Rollback & restore dijelaskan | PASS | deployment §rollback; backup manual §operasi |
| Env/secret: `SPREADSHEET_ID`, `PIN_HASH`, `EXEC_URL` | PASS | deployment §1–2 |

## Release & Pasca-Release
| Item | Status | Bukti |
|---|---|---|
| Versi & eksekusi deploy asli | BLOCKED** | butuh aksi operator (Apps Script + Git) — deployment.md siap |
| E2E + NFR pengukuran pasca-deploy | OPEN | lihat `docs/qa-test-plan.md` §5 |
| Peninjauan ulang log mingguan | OPEN | deployment operations table |

---

## Item terbuka sebelum go-live
- [ ] Eksekusi deploy (Apps Script URL → `EXEC_URL`, PIN via `SETUP_setPin`, push ke GitHub Pages)
- [ ] E2E-1..10 (qa-test-plan §5) setelah deploy
- [ ] Ukur NFR-003 (<3s) & catat di qa-test-plan
- [ ] Batasi share spreadsheet ke owner (security-review §5 R3)
- [ ] Backup `.xlsx` pertama sebelum data masuk
- [ ] (Opsional) jadwalkan review log mingguan

## Verdict
**READY TO DEPLOY.** Semua checkbox yang bergantung lingkungan runtime hanya
bisa ditutup pasca-deploy; seluruh artefak & panduan sudah final.