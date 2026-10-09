# Panduan Deploy — Entry Nilai (v2, Turso)

Arsitektur v2: **frontend statis di GitHub Pages** yang berbicara **langsung
ke database Turso (SQLite/libSQL)** lewat HTTPS. Tidak ada server aplikasi,
tidak ada cold start, dan data otomatis sama di HP & laptop.

Estimasi: 5–10 menit. Akses final via
`https://<user>.github.io/entry-nilai/`.

> Prasyarat: akun [Turso](https://turso.tech) (gratis) & akun GitHub.
> Kode legacy Google Apps Script (`apps-script/Code.gs`) **tidak dipakai lagi**
> dan disimpan hanya sebagai referensi.

---

## Bagian 1 — Database Turso

### 1.1 Buat database

**Via dasbor:** buat database baru, mis. **`entry-nilai`**, di region
terdekat (**Sydney `aws-ap-southeast-2`**).

**Via CLI** (opsional):

```bash
turso auth login
turso db create entry-nilai --group default
```

### 1.2 Ambil URL & token

```bash
turso db show entry-nilai --url
# → https://entry-nilai-<org>.aws-ap-southeast-2.turso.io

turso db tokens create entry-nilai --expiration never
# → salin token (JWT)
```

Di dasbor: **Database ▸ Connect** juga menampilkan **URL** dan tombol
**Create Token** (pilih *never expires*).

### 1.3 Isi `js/config.js`

```js
TURSO_URL: "https://entry-nilai-<org>.aws-ap-southeast-2.turso.io",
TURSO_TOKEN: "<token-database-anda>",
```

Skema tabel (`siswa`, `nilai`, `konfig`, `log`, `meta`, `session`) dibuat
**otomatis** saat aplikasi pertama kali dibuka — tidak perlu migrasi manual.

> **Keamanan:** token tertanam di klien = **publik**. Siapa pun yang dapat
> membuka halaman dapat membaca/menulis database. Ini memang dirancang untuk
> pemakaian **pribadi satu pengguna**. PIN aplikasi hanya gerbang UI.
> Jangan pakai setup ini untuk data sensitif multi-pengguna.

---

## Bagian 2 — Frontend GitHub Pages

### 2.1 Commit & push

```bash
git add .
git commit -m "entry-nilai v2.0.0 (Turso)"
git push origin main
```

### 2.2 Aktifkan Pages

1. **Settings ▸ Pages ▸ Build and deployment**.
2. **Source:** *Deploy from a branch* ▸ branch `main` ▸ folder `/` → Save.
3. Tunggu 1–2 menit, buka `https://<user>.github.io/entry-nilai/`.

### 2.3 Verifikasi final

| Langkah | Ekspektasi |
|---|---|
| Buka URL Pages | Form **Buat PIN** (first-run) muncul, badge "Terhubung" |
| Buat PIN | Langsung masuk ke halaman Entry |
| Tab Pengaturan ▸ Kelas | Tambah `7A` (tersimpan ke Turso) |
| Pengaturan ▸ Jenis/Kode | Tambah `UH` + `UH-1` |
| Siswa | Tambah beberapa siswa kelas `7A` |
| Entry ▸ 7A ▸ UH ▸ UH-1 | Isi nilai, Simpan; muat ulang → nilai tetap ada |
| Rekap ▸ 7A | Matriks + tombol CSV jalan |
| Buka di HP | Login PIN yang sama → data identik (bukti sinkron) |

---

## Operasi rutin (wajib)

| Frekuensi | Aksi | Kenapa |
|---|---|---|
| Awal/akhir semester | `turso db dump entry-nilai > backup.sql` | Belum ada backup otomatis |
| Saat kurikulum berubah | Tambah Jenis/Kode lewat **Pengaturan** | Tanpa redeploy |
| Mingguan | Tinjau **Pengaturan ▸ Log** (`LOGIN_FAIL`, hapus) | Deteksi akses anomali |

**Restore:** buat database baru dari `backup.sql`
(`turso db shell entry-nilai < backup.sql`) → perbarui `TURSO_URL`/`TURSO_TOKEN`
di `js/config.js` → push.

---

## Troubleshooting

| Gejala | Penyebab umum | Solusi |
|---|---|---|
| Badge "Terputus" / gagal muat data | `TURSO_URL`/`TURSO_TOKEN` salah | Periksa `js/config.js`; pastikan URL tanpa `/v2/pipeline` dan token masih berlaku |
| Request `INVALID_TOKEN` | Sesi kedaluwarsa (TTL 6 jam) / token DB dicabut | Login ulang; buat token baru bila dicabut |
| `CONFIG_IN_USE` saat hapus | Entri masih dipakai data | Hapus datanya dulu, atau pakai **Nonaktifkan** |
| Data tak muncul di perangkat lain | Belum muat ulang (tidak ada realtime) | Refresh halaman |
| Lambat saat pertama buka | Latensi jaringan ke region Sydney | Wajar (RTT ~100–200 ms). Tidak ada cold start |
| CORS error di konsol | Rare; Turso mengirim `Access-Control-Allow-Origin: *` | Pastikan akses via HTTPS (Pages sudah HTTPS), bukan `file://` |

---

## Rollback

- **Frontend:** GitHub Pages menyimpan commit sebelumnya → revert commit, push ulang.
- **Database:** pulihkan dari `backup.sql` (§operasi rutin).
- **Skema:** `schema.js` memakai `CREATE TABLE/INDEX IF NOT EXISTS`; penambahan
  bersifat aditif. Untuk perubahan besar, naikkan `App.schema.VERSION`.

---

## Tes

```bash
node test/run_backend_tests.js       # 68 asersi, SQLite in-memory (offline)
# atau
cd test && npm install && npm test
```

---

## Batasan & yang TIDAK disediakan

- Tidak ada multi-sekolah, multi-role, atau perbaikan otomatis.
- Tidak ada backup otomatis (manual via `turso db dump`).
- Token database **publik** (lihat catatan keamanan §1.3) — single-user saja.
- Tidak ada sinkronisasi realtime antar perangkat (cukup muat ulang).
