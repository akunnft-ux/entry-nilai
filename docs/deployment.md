# Panduan Deploy — Entry Nilai

Dua komponen: **(1) backend Google Apps Script** dan **(2) frontend di GitHub Pages**.
Estimasi: 15–20 menit. Akses final via URL `https://<user>.github.io/entry-nilai/`.

> Prasyarat: akun Google (Gmail) & akun GitHub. Bila PIN disetel dari script editor, gunakan tab **incognito** setelahnya agar tidak bertabrakan dengan sesi Google.

---

## Bagian 1 — Backend Google Apps Script

### 1.1 Buat spreadsheet

1. Buka [sheets.new](https://sheets.new) (Google Sheets).
2. Namai spreadsheet, mis. **"Data Nilai – SMA 1"**.
3. Biarkan kosong — skema 4 sheet (`siswa`, `nilai`, `konfig`, `log`) dibuat otomatis oleh `ensureSchema()` saat pertama dipanggil.

### 1.2 Pasang script

1. Menu **Extensions ▸ Apps Script** (di spreadsheet tadi) → editor terbuka.
2. Hapus konten default, **salin seluruh isi `apps-script/Code.gs`**, tempel.
3. Beri nama project (mis. `entry-nilai-backend`).

Jika Anda ingin backend **tidak terikat** pada satu spreadsheet (mis. dipakai beberapa spreadsheet), tambahkan Script Property `SPREADSHEET_ID` (nilai = ID spreadsheet dari URL `https://docs.google.com/spreadsheets/d/<ID>/edit`). Bila properti ini tidak ada, script otomatis memakai spreadsheet tempat ia di-deploy (cara standar panduan ini).

### 1.3 Atur PIN

1. Di editor Apps Script, **tambahkan fungsi wrapper** di baris paling bawah (fungsi `SETUP_setPin` punya parameter, jadi tidak bisa di-Run langsung):
   ```js
   function aturPin() {
     SETUP_setPin("1234");   // ← ganti 1234 dengan PIN 4–8 digit Anda
   }
   ```
2. Pilih `aturPin` pada dropdown fungsi (toolbar Run) → **Run** → izinkan otorisasi saat diminta.
3. Cek di **Project Settings ▸ Script properties**: muncul `PIN_HASH` (hash SHA-256 ganda). PIN asli tidak pernah tersimpan.

> Alternatif manual tanpa menjalankan fungsi: buat Script Property `PIN_HASH` lalu salin nilai dari hasil `SETUP_pinHash("1234")` di log.

**Jangan lupa:** ubah PIN pertama kali melalui menu **Pengaturan ▸ Keamanan** di aplikasi.

> Opsional: tambahkan Script Property `APP_PASSWORD` bila Anda deploy ke beberapa
> environment (dev/prod) dengan spreadsheet berbeda — nilai bebas, hanya dipakai
> sebagai pembeda lingkungan pada respon `ping`.

### 1.4 Deploy sebagai Web App

1. **Deploy ▸ New deployment ▸ Web app**.
2. Set:
   - **Description / version:** `1`, note `initial`.
   - **Execute as:** `Me` (akun pemilik spreadsheet).
   - **Who has access:** `Anyone` (diperlukan agar GitHub Pages bisa memanggil).
3. Klik **Deploy**, lalu **izin akses** (Advanced ▸ Go to `<email>` (unsafe) ▸ Allow) — aman di sini karena script ini milik Anda.
4. Salin **Web app URL** yang berakhiran `/exec` — mis. `https://script.google.com/macros/s/AKfycb.../exec`.

> Catatan keamanan: membuat endpoint "Anyone" adalah satu-satunya cara Apps Script melayani request dari Pages. Keamanan dipegang oleh PIN + token di sisi server (PRD RISK-001). Jangan membagikan URL spreadsheet.

### 1.5 Uji backend secara manual (opsional)

- Buka Web app URL di browser → harus menampilkan `{"ok":false,"error":{"code":"BAD_REQUEST",...}}` (tanpa halaman kosong).
- Di editor Apps Script pilih fungsi `SETUP_ensureSchema` → Run → buka spreadsheet: sekarang ada 4 sheet dengan header.

---

## Bagian 2 — Frontend GitHub Pages

### 2.1 Isi URL backend

Di `js/config.js`:

```js
EXEC_URL: "https://script.google.com/macros/s/AKfycb…/exec"
```

Simpan & commit.

> Di repo git lokal ini belum ada history. Inisialisasi jika belum:
> `git init && git add . && git commit -m "entry-nilai v1.0.0"`

### 2.2 Deploy ke GitHub Pages

**Cara A (disarankan — folder `docs/`):**
1. Pindahkan/salin seluruh isi project (index.html, css/, js/, apps-script/, docs/, plus `.nojekyll`) ke branch di GitHub.
2. Buat repo publik mis. `<user>/entry-nilai`, push.
3. **Settings ▸ Pages ▸ Deploy from a branch** ▸ pilih branch (dan folder `/` atau `/docs`) ▸ Save.
4. Tunggu 1–2 menit, buka `https://<user>.github.io/entry-nilai/`.

**Cara B (GitHub Actions):** gunakan action resmi `actions/deploy-pages` bila ingin kontrol lebih; prinsip sama (upload artefak `docs/` / root statis).

### 2.3 Verifikasi final

| Langkah | Ekspektasi |
|---|---|
| Buka URL Pages | Wizard/login muncul, badge koneksi "Terhubung" |
| Login PIN | Masuk ke halaman Entry |
| Tab Pengaturan ▸ Log | Isi log `LOGIN_OK` |
| Entry ▸ Kelas 7A ▸ Jenis ▸ UH-1 | Tabel siswa tampil & bisa simpan |
| Rekap ▸ 7A | Matriks + tombol CSV jalan |

---

## Operasi rutin (wajib)

| Frekuensi | Aksi | Kenapa |
|---|---|---|
| Setiap awal semester | **Backup spreadsheet** (File ▸ Download ▸ `.xlsx`) | Belum ada backup otomatis (RISK-006) |
| Setiap akhir semester | Backup lagi + simpan di Drive sekolah | Retensi ≥ 5 tahun |
| Saat kurikulum berubah | Tambah Jenis/Kode baru lewat aplikasi (**Pengaturan**) | Tanpa redeploy |
| Bila data > 500k baris | Pisah per tahun ajaran (lihat `docs/schema.md` §9) | Performa |
| Mingguan | Tinjau **Pengaturan ▸ Log** (`LOGIN_FAIL`, `RATE_LIMITED`, hapus) | Deteksi akses anomali & gangguan |

**Restore saat spreadsheet hilang/rusak:** upload `.xlsx` cadangan sebagai spreadsheet baru → hapus/set ulang `SPREADSHEET_ID` (bila memakai) → jalankan `SETUP_ensureSchema` → aplikasi normal kembali (RTO ± 1 hari).

---

## Troubleshooting

| Gejala | Penyebab umum | Solusi |
|---|---|---|
| App "tidak terhubung", badge offline | `EXEC_URL` salah / belum diisi | Periksa `js/config.js`; pastikan berakhiran `/exec` |
| Login "PIN belum diatur" | `PIN_HASH` tidak ada | Jalankan `SETUP_setPin` §1.3 |
| Login "PIN salah" padahal benar | PIN disetel dengan fungsi lain / dua lingkungan | Pastikan memakai spreadsheet yang sama & hash di Script Properties. Cek lalu lakukan `SETUP_setPin` ulang |
| Request selalu `INVALID_TOKEN` | Waktu perangkat tidak sinkron / sesi kedaluwarsa | Login ulang; sesi TTL 6 jam |
| Tersangkut di konfirmasi Google ("unsafe") | Otorisasi belum disetujui | Selesaikan otorisasi sekali saat deploy §1.4 |
| CORS/gagal baca respons | Upload via HTTP / fallback mati | Hanya HTTPS (GitHub Pages sudah HTTPS). Coba aktifkan `ALLOW_JSONP_FALLBACK` |
| Deploy baru Apps Script belum berlaku | Perubahan Code.gs setelah publish | Klik **Deploy ▸ Manage deployments ▸ edit ▸ New version**, lalu pakai URL **version** yang baru |

---

## Rollback

- **Frontend:** GitHub Pages menyimpan release/commit sebelumnya → revert commit, redeploy.
- **Backend:** setiap perubahan diberi versi deployment baru; gunakan URL versi lama sampai stabil.
- **Schema:** `ensureSchema()` additive-only → tidak perlu migrasi manual untuk penambahan kolom.
- **Data:** backup `.xlsx` §3.

---

## Batasan & yang TIDAK disediakan v1

- Tidak ada multi-sekolah, multi-role, atau perbaikan otomatis.
- Tidak ada auto-backup (manual wajib, lihat tabel operasi).
- Kode Entry/pengaturan tidak ter-encrypt di localStorage (nilai = data biasa seperti kertas).
- Belum ada rate-limit per-IP (Apps Script tidak mengekspos IP) — `auth.verify` dibatasi global per skrip.