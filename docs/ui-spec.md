# UI / UX Spec — Aplikasi Entry Nilai

**Version:** 1.0 · **Author:** `ui-designer-safe-v2` · **Mode:** design-only (tidak ada logika berubah)
**Pencil MCP:** *tidak tersedia pada sesi ini* → spec tertulis ini menjadi source of truth layout untuk implementasi. Bila `pencil.dev` tersedia nanti, frame dibuat mengikuti spec ini, bukan sebaliknya.

---

## 1. Design Principles

1. **Kecepatan di atas segalanya** — target utama guru adalah mengisi 30 nilai secepat mungkin (BO-001). Kurangi klik, jaga fokus keyboard.
2. **Satu warna aksi** — hanya ada satu warna "aksi utama" (simpan/masuk) agar tidak ada keraguan.
3. **Tabel adalah pahlawan** — di halaman Entry & Rekap, tabel mendapat 80% ruang; chrome UI ditekan seminimal mungkin.
4. **Jelas saat bermasalah** — error selalu menyebut apa yang terjadi + apa yang harus dilakukan, tanpa istilah teknis.
5. **Mobile-first** — guru bisa entry dari ponsel di ruang kelas (360 px harus berfungsi penuh).

**Benchmark referensi (bukan clone):** Linear (kepadatan & hierarki), Stripe (kejelasan form & error), GitHub (tabel & tab), Notion (ruang putih & tipografi).

---

## 2. Design Tokens

### 2.1 Warna

| Token | Value | Pemakaian |
|---|---|---|
| `--bg` | `#f6f7f9` | latar aplikasi |
| `--surface` | `#ffffff` | kartu, tabel, form |
| `--border` | `#e3e6ea` | garis pemisah, outline tabel |
| `--text` | `#111418` | teks utama (kontras 16.1:1) |
| `--text-muted` | `#5c6570` | label, meta (kontras 5.4:1 ✓) |
| `--primary` | `#1f6feb` | tombol aksi utama, link, fokus |
| `--primary-hover` | `#1a5fd0` | hover tombol |
| `--primary-fg` | `#ffffff` | teks di atas primary |
| `--danger` | `#c62828` | error, aksi destruktif |
| `--success` | `#1a7f37` | sukses tersimpan |
| `--warn` | `#9a6700` | peringatan (dirty, rate-limit) |
| `--danger-bg` | `#fdecea` | latar pesan error |
| `--success-bg` | `#e6f4ea` | latar pesan sukses |
| `--warn-bg` | `#fff8e1` | latar peringatan |

**Status nilai di tabel:** kosong = sel abu mink `--bg`; valid = putih; invalid = border `--danger` + `--danger-bg`.

### 2.2 Tipografi

| Token | Value |
|---|---|
| Font stack | `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` (tanpa web font → nol request, NFR-010) |
| `--fs-xs` / `--fs-sm` / `--fs-base` / `--fs-lg` / `--fs-xl` | 12 / 14 / 15 / 18 / 24 px |
| `--fs-num` (input nilai) | 16 px *(mencegah zoom otomatis iOS saat fokus input)* |
| Line height | 1.5 body, 1.25 heading |
| Angka tabel | `font-variant-numeric: tabular-nums` → kolom angka selalu rata |

### 2.3 Spacing / Radius / Elevation

- Skala spacing: 4 / 8 / 12 / 16 / 24 / 32 px.
- Radius: `--r-sm 6px` (input, tombol) · `--r-md 10px` (kartu) · `--r-lg 14px` (modal).
- Shadow: `--sh-1` kartu `0 1px 2px rgba(16,24,40,.06)` · `--sh-2` dropdown/modal `0 8px 24px rgba(16,24,40,.12)`.
- Layout max width: **1280px**; padding sisi 16 px (mobile) / 24 px (desktop).

### 2.4 Komponen dasar

| Komponen | Spesifikasi |
|---|---|
| **Button** | tinggi 36 px (40 px mobile), radius 6, padding-x 14. Variants: `primary`, `secondary` (border + putih), `ghost`, `danger`. States: default/hover/active/disabled/`loading` (spinner inline, `aria-busy`) |
| **Input** | tinggi 36 px, border 1px `--border`, radius 6, fokus = border `--primary` + ring `0 0 0 3px rgba(31,111,235,.25)` |
| **Select** | idem input + chevron inline |
| **Table** | header sticky (`position:sticky; top:0`), tinggi baris 40 px, zebra `#fafbfc`, border antar sel 1px `--border` |
| **Card** | surface + `--sh-1` + radius 10 + padding 16–24 |
| **Toast** | pojok kanan-bawah (mobile: atas, full-width), radius 8, `--sh-2`, auto-dismiss 4 s, `role="status"` `aria-live="polite"` |
| **Modal** | max-width 420, radius 14, backdrop `rgba(17,20,24,.45)`, fokus terkunci, `Esc` menutup, tombol destruktif = `danger` |
| **Badge** | tinggi 20 px, radius 999, font 12 px — untuk `aktif`/`nonaktif`/`diarsipkan` |
| **Skeleton** | baris abu `#eceef1` dengan animasi shimmer 1,2 s |
| **Empty state** | ikon sederhana (SVG inline) + judul + 1 kalimat penjelas + 1 CTA |

---

## 3. Navigation Map

```
Header (sticky)
├─ [Nama Aplikasi "Entry Nilai"]  ── kembali ke #/entry
├─ Nav (tabs)      :  Entry  ·  Rekap  ·  Siswa  ·  Pengaturan
├─ Status koneksi  :  ● Terhubung / ● Terputus (badge)
└─ [Keluar]  (ghost button, hanya bila login)

Hash routes (public)   : #/login
Hash routes (protected): #/entry  #/rekap  #/siswa  #/pengaturan
Guard: tanpa token valid → redirect ke #/login (draft lokal dipertahankan)
Default route          : #/entry
```

Aturan: tab aktif = tebal + underline `--primary`; nav menjadi **scrollable horizontal** bila muat di 360 px; label dipertahankan penuh (tidak disingkat agar jelas).

---

## 4. Page Map

### P1 — `#/login` (public)

**Purpose:** verifikasi PIN, satu jalur masuk.
**Journey:** buka app → (token valid? → langsung ke Entry) → input PIN → masuk.
**Layout:** kartu terpusat, max-width 380, padding 24, logo/judul di atas.

| Elemen | Detail |
|---|---|
| Judul | "Entry Nilai" + subjudul "Masukkan PIN untuk melanjutkan" |
| Input PIN | `type="password"` `inputmode="numeric"`, maxlength 8, placeholder `••••`, tombol mata (toggle `type` — **hanya tampilan, bukan logika**) |
| Tombol | `primary`, lebar penuh, label "Masuk" → state `loading` saat request |
| Pesan error | `--danger-bg` di bawah input: "PIN salah. Sisa percobaan: 3" |
| Rate-limit | hitung mundur mm:ss, tombol dinonaktifkan |
| Footer info | "Belum ada PIN? Lihat panduan setup." → tautan `docs/deployment.md` (tautan statis) |

**States:** loading (spinner tombol) · error · rate-limit · offline (banner `--warn-bg`).
**A11y:** `label` terkait input, `aria-invalid`, pesan error `role="alert"`.

---

### P2 — `#/entry` (inti)

**Purpose:** input nilai massal per kelas + jenis + kode.
**Journey:** pilih kelas → pilih jenis → pilih kode → isi tabel → simpan.

```
┌ Header ──────────────────────────────────────────────────────┐
│ Entry Nilai      Entry · Rekap · Siswa · Pengaturan  ● ● Keluar│
├ Filter bar (card, sticky di bawah header) ───────────────────┤
│ [Kelas ▾] [Jenis ▾] [Kode ▾]   30 siswa · 12 terisi · 18 kosong│
│                                        [Muat ulang] [Simpan ▾] │
├ Tabel (card, scroll) ────────────────────────────────────────┤
│ ☐ │ #  │ NIS      │ NAMA          │ NILAI   │ CATATAN         │
│   │ 1  │ 24001    │ Adi Nugroho   │ [ 85  ] │ [ ..... ]       │
│   │ 2  │ 24002    │ Bella Sari    │ [     ] │ [ ..... ]       │
├ Baris ringkasan (sticky bottom) ─────────────────────────────┤
│ • Belum tersimpan: 3 nilai    [Bersihkan]        [Simpan]     │
└──────────────────────────────────────────────────────────────┘
```

| Elemen | Detail |
|---|---|
| Filter | 3 select berurutan; jenis/kode diisi dari `meta` cache; kode berubah mengikuti jenis |
| Kolom tabel | `#` (nomor, 44px) · `NIS` (96px) · `NAMA` (**sticky kiri**, min 180px) · `NILAI` (input numerik, 96px, center) · `CATATAN` (input teks, fleksibel) |
| Sel nilai | `inputmode="decimal"` `maxlength 5`; blur → validasi 0–100; invalid → border `--danger` + tooltip inline "0–100" |
| Indicator | baris terisi ditandai titik `--success` di tepi kiri; baris invalid ditandai `--danger` |
| Tombol Simpan | `primary`, **disabled** bila tidak ada perubahan; saat loading label jadi "Menyimpan…" |
| Dirty state | badge `--warn` "● N belum tersimpan" di baris ringkasan + `beforeunload` guard |
| Draft | disimpan otomatis (debounce 300 ms) ke `localStorage`; banner kecil "Draft dipulihkan" bila ada pemulihan |

**Empty state:** kelas tanpa siswa → "Belum ada siswa di kelas ini" + CTA `[Tambah siswa]`.
**Error state (simpan):** banner `--danger-bg` atas tabel: "Tersimpan sebagian: 28 ok, 2 dilewati" + daftar alasan per baris + `[Coba lagi]`.
**Loading:** 8 baris skeleton saat muat.
**Responsive (≤768px):** filter jadi 2 baris; tabel scroll horizontal dengan **kolom NAMA sticky kiri**; baris ringkasan tetap menempel di bawah; tinggi input 40 px (target sentuh).

---

### P3 — `#/rekap`

**Purpose:** matriks seluruh nilai satu kelas + ekspor CSV.
**Journey:** pilih kelas → lihat matriks → unduh CSV.

```
[Rekap Nilai]                          [Kelas ▾]        [Unduh CSV]
┌ matriks (card, scroll dua arah) ─────────────────────────────┐
│ NIS │ NAMA       │ TH-1 │ TH-2 │ UH-1 │ UH-2 │ US-Ganjil │    │
│ 2400│ Adi Nugroho│  80  │  85  │  78  │  —   │    88     │    │
│ ... │            │      │      │      │      │           │    │
├ footer statistik (sticky bottom) ────────────────────────────┤
│ TH-1 30/30 · TH-2 28/30 · UH-1 30/30 · UH-2 0/30 · ...      │
└──────────────────────────────────────────────────────────────┘
```

| Elemen | Detail |
|---|---|
| Header kolom | 2 baris: `JENIS` lalu `KODE`, sticky vertikal + horizontal; kolom `diarsipkan` diberi tanda `*` + abu |
| Sel | `tabular-nums`, center; kosong = `—` dengan warna `--text-muted` |
| Baris | siswa `nonaktif` ditandai badge `nonaktif` + teks agak redup (tetap tampil, BR-002) |
| Statistik | per kolom "terisi/total" di footer sticky |
| Unduh CSV | `secondary` button dengan ikon unduh; toast konfirmasi nama file |

**Empty:** "Belum ada nilai untuk kelas ini" + CTA `[Entry nilai]`.
**Responsive:** scroll horizontal (kolom NAMA sticky), header jenis tetap terlihat, footer statistik menempel di bawah.

---

### P4 — `#/siswa`

**Purpose:** master siswa.
**Journey:** pilih kelas → lihat daftar → tambah/ubah → nonaktifkan.

**Layout (desktop 2 kolom):** kiri = form (sticky, 360px) · kanan = tabel daftar (fleksibel).
**Layout (mobile):** form di atas (accordion tertutup bila daftar sedang dilihat), tabel di bawah.

| Elemen | Detail |
|---|---|
| Form fields | `NIS` (opsional) · `Nama` (wajib, helper "2–80 karakter") · `Kelas` (select) · `Status` (select) |
| Tombol | `primary` "Simpan siswa" · saat edit: "Simpan perubahan" + `ghost` "Batal" |
| Impor/Ekspor | `secondary` "Unduh template CSV" · `secondary` "Impor CSV" (input file tersembunyi) · pratinjau via `banner warn` (jumlah baru/diperbarui/dilewati + `[Simpan] [Batal]`) |
| Tabel daftar | `NIS` · `NAMA` · `KELAS` · `STATUS` (badge) · `AKSI` (Ubah = ghost, Nonaktifkan = danger ghost) |
| Filter | `[Kelas ▾] [Status: Semua/Aktif/Nonaktif]` + pencarian `Nama/NIS` (debounce 200 ms) |
| Konfirmasi | modal sebelum nonaktifkan: "Nonaktifkan **Bella Sari**? Nilai yang sudah ada tetap tersimpan." → `[Batal] [Nonaktifkan]` |

**Error inline:** field invalid → border `--danger` + pesan di bawah field (server `409` → banner: "NIS sudah dipakai oleh Andi Wijaya").
**Empty:** "Belum ada siswa. Tambahkan yang pertama." + form fokus otomatis.

---

### P5 — `#/pengaturan`

**Purpose:** master konfig, keamanan, log.
**Layout:** tab horizontal (scroll di mobile): `Kelas` · `Jenis & Kode` · `Keamanan` · `Log`.

| Tab | Konten |
|---|---|
| **Kelas** | tabel kelas + form tambah (`Nama kelas`) + aksi Nonaktifkan |
| **Jenis & Kode** | 2 bagian: daftar **Jenis** (Tugas Harian, Ulangan Harian, Ujian Semester, …) dan daftar **Kode** per jenis; tombol `+ Tambah`; chip badge per item; item terpakai diberi label "terpakai (n)" dan tombol Nonaktifkan **bukan** Hapus |
| **Keamanan** | form ganti PIN: `PIN lama` · `PIN baru` (4–8 digit) · `Ulangi PIN baru`; pesan sukses/gagal; catatan "PIN disimpan terenkripsi (hash)" |
| **Log** | tabel `WAKTU` · `AKSI` · `ENTITAS` · `AKTOR` · `SEBELUM` · `SESUDAH`; tombol `Muat lebih banyak` (200 terakhir) |

**Warning state:** item terpakai → tombol Hapus dinonaktifkan + tooltip "Sudah dipakai nilai — hanya bisa dinonaktifkan".

---

## 5. Component Plan (reusable)

`js/ui.js` menyediakan — **semua halaman memakai ini, tidak ada copy-paste:**

| Component | API singkat | Dipakai di |
|---|---|---|
| `toast(msg, type)` | `success\|error\|warn\|info`, auto-dismiss | semua |
| `confirm({title, body, danger})` | `Promise<boolean>`, fokus terkunci | siswa, pengaturan |
| `renderTable({cols, rows, empty})` | kolom terdefinisi + slot render per sel | entry, rekap, siswa, pengaturan |
| `skeleton(rows, cols)` | placeholder shimmer | entry, rekap, siswa |
| `emptyState({icon, title, body, cta})` | — | semua |
| `field({label, name, type, hint, error})` | input + label + hint + error terikat a11y | login, siswa, pengaturan |
| `banner(type, html)` | `error\|warn\|success` inline | entry, siswa |
| `spinner(size)` | inline / full-page | semua |
| `fmtNilai(n)` / `parseNilai(str)` | format & parse `75,5` → `75.5` | entry, rekap |

`js/csv.js` menyediakan impor siswa (FR-010):

| Component | API singkat | Dipakai di |
|---|---|---|
| `App.csv.parse(text)` | CSV RFC-4180 → `Array<Array<String>>` (quote, escaped quote, CRLF, BOM) | siswa |
| `App.csv.mapSiswa(rows, kelasList, existing)` | `{header, records, invalid, stats, error?}` — validasi baris + update-by-NIS | siswa |

---

## 6. Responsive Strategy (breakpoints)

| Breakpoint | Layout |
|---|---|
| `< 480` (mobile utama) | 1 kolom; nav scroll horizontal; filter 2 baris; tabel Entry/Rekap **scroll horizontal + NAMA sticky kiri**; input 40 px; baris ringkasan fixed bottom; padding 16 |
| `480–768` (tablet kecil) | sama, padding 20, beberapa filter muat 1 baris |
| `768–1024` | Siswa jadi 2 kolom (form 300 + tabel); tabel Entry muat penuh |
| `> 1024` (desktop) | max-width 1280; form Siswa sticky; semua kolom Entry muat tanpa scroll |

**Aturan emas:** fungsi identik di semua breakpoint (skill: *identical functionality across breakpoints*). Tidak ada kolom/aksi yang hilang di mobile — hanya bergeser.

---

## 7. State Design

| Type | Pola visual |
|---|---|
| **Loading** | skeleton baris (tabel) · spinner inline (tombol) · jangan pernah layar kosong tanpa indikator |
| **Empty** | `emptyState` = ikon + judul + 1 kalimat + **1 CTA** yang mengarah ke langkah berikutnya |
| **Error** | banner `--danger-bg` berisi: apa yang terjadi + apa yang bisa dilakukan + tombol aksi. **Tanpa** istilah teknis (tidak ada "CORS", "500", stack trace) — kode `requestId` hanya di tooltip/console |
| **Offline** | badge di header "● Terputus" + banner `--warn-bg` "Koneksi terputus — data Anda tetap tersimpan sebagai draft" |
| **Dirty** | badge `--warn` + `beforeunload` guard |
| **Success** | toast `--success-bg` + (untuk simpan) highlight singkat baris yang berubah |

---

## 8. Accessibility (NFR-008)

- Kontras teks utama ≥ 4.5:1 (terpenuhi di token §2.1 — sudah dihitung).
- **Semua alur bisa keyboard:** Entry → tekan `Tab` antar sel nilai, `Enter` turun satu baris, `Esc` keluar dari sel (membuka konfirmasi bila dirty). Fokus selalu terlihat (`outline: 2px solid var(--primary); outline-offset: 2px`).
- Target sentuh ≥ 40×40 px di mobile.
- Semua `input` punya `<label>` terkait (`for`/`id`); error → `aria-invalid` + `aria-describedby`.
- `table` memakai `<th scope>`; toast `aria-live="polite"`; modal `role="dialog" aria-modal="true"` + fokus terkunci + `Esc`.
- Hormati `prefers-reduced-motion: reduce` → matikan shimmer/animasi.
- Ikon dekoratif `aria-hidden="true"`; ikon aksi punya `aria-label`.

---

## 9. Visual Change Report (untuk fase implementasi)

| Item | Nilai |
|---|---|
| Visual changes | tokens warna/tipografi/spacing, layout per halaman, komponen reusable, skeleton/empty/error states, responsive 4 breakpoint, a11y |
| Components affected | Button, Input, Select, Table, Card, Toast, Modal, Badge, Skeleton, EmptyState, Field, Banner, Spinner |
| Files affected | `css/base.css`, `css/components.css`, `css/pages.css`, `js/ui.js`, `js/pages/*.js` (hanya markup render) |
| **Functionality changed** | **NONE** |
| **Business logic changed** | **NONE** |
| **API changes** | **NONE** |
| **Database changes** | **NONE** |
| **Routing changes** | **NONE** (hash target dipertahankan persis) |
| **Authentication changes** | **NONE** (alur PIN & guard tidak disentuh) |

---

## 10. Design Review Checklist

| Item | Status |
|---|---|
| Functionality unchanged | ✓ design-only |
| API / Database / Routing / Auth / Permissions unchanged | ✓ |
| Visual hierarchy improved | ✓ hero = tabel; chrome ditekan |
| Accessibility improved | ✓ §8 (kontras, keyboard, ARIA, reduced-motion) |
| Mobile usability improved | ✓ §6 (sticky kolom nama, touch target 40px, input 16px anti-zoom) |
| Responsive design completed | ✓ 4 breakpoint, fungsi identik |
| Pencil frames generated | **✗ MCP tidak tersedia pada sesi ini** → digantikan spec tertulis §4 (dicatat sebagai gap terbuka) |
