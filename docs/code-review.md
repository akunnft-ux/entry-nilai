# Hasil Code Review (Phase 6)

Metode: checklist skill `code-review-checklist`, dinilai dari pembacaan
(`read-code`) seluruh `apps-script/Code.gs` + `js/**` + `css/**`; verifikasi
sintaks `node --check`; kategori yang tidak berlaku ditandai **N/A**.

Kesimpulan: **READY untuk lanjut ke QA/E2E** dengan item terbuka yang dicatat.

---

## Arsitektur
| Item | Hasil | Catatan |
|---|---|---|
| Pemisahan perhatian (transport/test/magic) lewat registry `ACTIONS` + `registerAction` | PASS | tiap aksi: `{group, rate, require, handler}`; auth & rate terpusat di `handle_` |
| `ensureSchema_` additive-only (ADR-006) | PASS | hanya `insertSheet` bila sheet hilang; tidak pernah rewrite header |
| ADR-002 transport (POST text/plain, fallback GET JSONP) | PASS | `doPost`/`doGet` → handler sama; semua path return body non-kosong |
| Tidak ada logika bisnis di `doGet`/`doPost` | PASS | keduanya tipis |
| Pemisahan domain: `readSiswa_`/`readNilai_`/`readKonfig_` + handler | PASS | satu sumber baca per sheet |

## TypeScript
**N/A** — stack TS murni tanpa TypeScript (keputusan review).

## Security
| Item | Hasil |
|---|---|
| PIN tersimpan double-hash SHA-256 (server-side), client kirim hash tunggal | PASS |
| Token sesi di `CacheService` (TTL 6h), diverifikasi per request | PASS |
| Rate limit per-a aksi (auth 5/15m, tulis 30/m, baca 60/m) | PASS (per-script, batasan platform) |
| CSV export anti-injection (cell diawali `=+-@` di-prefiks) | PASS |
| Escaping HTML di frontend (`esc()`) sebelum inject ke DOM | PASS |
| `konfig.remove` proteksi `CONFIG_IN_USE` | PASS |
| Path tanpa token → `INVALID_TOKEN` (semua kecuali `ping`,`auth.verify`) | PASS |
| `error.details` disembunyikan untuk `INVALID_PIN` (anti brute-force info leak) | PASS |

Catatan terbuka: rate-limit global per script (tak ada IP di Apps Script) — diterima
sebagai batasan platform; dicatat ke gap.

## Database (Sheet)
| Item | Hasil |
|---|---|
| Konsistensi referensial: siswa dikunci kelas; nilai hanya utk `kelas/jenis/kode` yang terdaftar; `jenis` terkunci bila punya child kode | PASS |
| Soft delete siswa (`status: nonaktif`); data nilai dipertahankan | PASS |
| `REPLACE`/upsert berbasis kunci bisnis + last-wins | PASS |
| Audit: `appendLog_` tidak membatalkan transaksi utama; `CTX.warnings` | PASS |
| Migrasi/additive — schema dibuat ulang bila hilang | PASS |

## UI
| Item | Hasil |
|---|---|
| Pola konsisten: `render()`, empty-state, tombol aksi, loading, retry | PASS |
| Semua class CSS yang dipakai ada di `css/` (grep) | PASS |
| Responsive & aksesibilitas dasar (aria pada tombol ikon) | PASS (baca) |
| Konfirmasi sebelum aksi destruktif (hapus/deactivate siswa & konfig) | PASS |

## Performance & Efisiensi
| Item | Hasil |
|---|---|
| Batch save 200/request; chunk client sesuai `BATCH_SIZE` | PASS |
| Baca sheet sekali per handler (cache satu `read*_` call); tidak ada N+1 | PASS |
| `rekap.get` O(rows) in-memory, tanpa read berulang | PASS |
| NFR-003 (<3s) | **CANNOT VERIFY** — butuh instance live (lihat qa-test-plan.md §4) |

## Maintainability
| Item | Hasil |
|---|---|
| 1 file `Code.gs` monolitik utk Google Apps Script (batasan deploy) | PASS — terorganisir per-bagian dgn header komentar |
| Konstanta terpusat (`BATCH_SIZE`, `RATE_CONF`, `TOKEN_TTL_SEC`) | PASS |
| Helper kecil berfokus (`pick_`, `randId_`, `find*_`, `snapSiswa_`) | PASS |
| Unit test ulang setelah perubahan | PASS (harness 55 asersi, Phase 7) |

## Quality Gates
| Item | Hasil |
|---|---|
| `node --check` semua `js/**` | PASS |
| `node --check` `Code.gs` (via /tmp .js) | PASS |
| Harness backend 55 asersi menangkap 4 bug nyata (lihat qa-test-plan.md §2) | PASS |
| Tidak ada `TODO`/stub tersisa | PASS |

---

## Item terbuka / deviation yang dicatat (dikirim ke Phase 10)
- NFR-003 & E2E browser menunggu deploy (lihat qa-test-plan.md).
- `SHEET_BUSY` tanpa auto-retry 3× di frontend.
- Rate-limit global per script.
- `error.details` untuk `INVALID_PIN` sengaja disembunyikan (anti-fingerprint).