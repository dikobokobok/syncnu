# Syncnu — Cloud Drive Storage

Syncnu adalah aplikasi cloud storage self-hosted berbasis web. File disimpan di server lokal, metadata dikelola di Supabase, dan seluruh antarmuka dibangun dengan React + Tailwind CSS.

---

## Fitur

### Manajemen File
- Upload file tunggal maupun banyak sekaligus (multi-select)
- Upload folder lengkap dengan struktur direktori (drag & drop atau pilih folder)
- Drag & drop file/folder langsung ke halaman
- Download file
- Hapus file (soft-delete → masuk sampah)
- Hapus permanen dari sampah
- Pulihkan file dari sampah
- Favorit / unfavorit file
- Preview file langsung di browser: gambar, video, audio, PDF, teks, kode

### Manajemen Folder
- Buat folder kustom
- Hapus folder beserta seluruh isinya (file dipindahkan ke sampah, folder fisik dihapus dari disk)
- 4 folder default sistem yang tidak bisa dihapus: **Dokumen**, **Gambar**, **Video**, **Musik**
- Validasi tipe file per folder default (hanya menerima tipe yang sesuai)

### Tampilan & Navigasi
- Tampilan grid dan list
- Navigasi: Beranda, Folder, Terbaru, Favorit, Sampah
- Pencarian file dan folder
- Sortir folder (nama / tanggal diubah, asc/desc)
- Detail file: info, tab aktivitas, komentar
- Sampah dikelompokkan per folder (folder card yang bisa di-expand)

### Seleksi Massal
- Pilih banyak file sekaligus dengan checkbox
- Aksi massal: hapus, pulihkan, hapus permanen, download, favorit

### Panel Aktivitas Terpadu
- Panel popup pojok kanan bawah untuk semua operasi: upload, hapus, pulihkan, hapus permanen, buat folder
- Progress bar per file saat upload
- Status per item: pending, aktif, selesai, error
- Bisa di-minimize atau ditutup
- Auto-tutup setelah operasi selesai

### Autentikasi
- Register dan login dengan email + password
- Token JWT disimpan di localStorage
- Akun admin bawaan untuk uji coba

### Penyimpanan
- Statistik penggunaan storage (used / total / free)
- Auto-purge sampah yang sudah lebih dari 7 hari (berjalan setiap jam)

---

## Stack Teknologi

| Bagian | Teknologi |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, TypeScript, tsx |
| Database | Supabase (PostgreSQL) |
| Auth | JWT + bcrypt (custom, bukan Supabase Auth) |
| File Storage | Disk lokal (`/storage`) |
| Monorepo | npm workspaces + concurrently |

---

## Struktur Proyek

```
Syncnu/
├── app/
│   └── web/                  # Frontend React
│       ├── src/
│       │   ├── App.tsx        # Komponen utama
│       │   ├── main.tsx
│       │   └── supabase.ts
│       ├── index.html
│       └── package.json
├── server/
│   ├── etc/                  # Backend Express
│   │   ├── index.ts          # Entry point server
│   │   └── package.json
│   └── database/
│       └── schema.sql        # Skema database Supabase
├── storage/                  # File yang diupload (dibuat otomatis)
│   ├── Dokumen/
│   ├── Gambar/
│   ├── Video/
│   └── Musik/
├── .env                      # Konfigurasi environment
├── package.json              # Root monorepo
└── install.sh                # Script instalasi otomatis
```

---

## Instalasi

### Prasyarat

- **Node.js** v18 atau lebih baru — [nodejs.org](https://nodejs.org)
- **npm** v9 atau lebih baru (sudah termasuk dengan Node.js)
- Akun **Supabase** — [supabase.com](https://supabase.com) (gratis)

### 1. Clone / Download Proyek

```bash
git clone https://github.com/username/syncnu.git
cd syncnu
```

Atau ekstrak ZIP ke folder pilihan, lalu masuk ke direktori tersebut.

### 2. Setup Database Supabase

1. Buka [supabase.com](https://supabase.com) dan buat project baru
2. Masuk ke **SQL Editor** di dashboard project
3. Salin seluruh isi file `server/database/schema.sql` dan jalankan
4. Tunggu hingga semua tabel dan data seed berhasil dibuat

### 3. Konfigurasi Environment

Salin atau edit file `.env` di root proyek:

```env
REACT_APP_SUPABASE_URL=https://<project-ref>.supabase.co
REACT_APP_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
PORT=8888
PORT_BACKEND=8889
JWT_SECRET=ganti_dengan_string_acak_yang_panjang
```

Nilai `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY` bisa ditemukan di:
**Supabase Dashboard → Project Settings → API**

> ⚠️ Ganti `JWT_SECRET` dengan string acak yang kuat sebelum deploy ke production.

### 4. Install Dependensi

```bash
npm install
```

Perintah ini menginstall semua dependensi untuk frontend dan backend sekaligus (npm workspaces).

### 5. Jalankan Aplikasi

**Mode development (dengan hot-reload):**
```bash
npm run dev
```

**Mode production:**
```bash
npm run build
npm run start
```

Aplikasi akan berjalan di:
- Frontend: [http://localhost:8888](http://localhost:8888)
- Backend API: [http://localhost:8889](http://localhost:8889)

### 6. Login

Gunakan akun admin bawaan:
- **Email:** `admin@syncnu.app`
- **Password:** `admin123`

Atau daftar akun baru melalui halaman login.

---

## Instalasi Otomatis

Untuk Linux/macOS, gunakan script instalasi:

```bash
chmod +x install.sh
./install.sh
```

Script akan menginstall dependensi, membuat direktori storage, dan memandu konfigurasi `.env`.

---

## Konfigurasi Lanjutan

### Mengubah Port

Edit file `.env`:
```env
PORT=8888          # Port frontend
PORT_BACKEND=8889  # Port backend API
```

### Mengubah Password Admin

Generate hash bcrypt baru di terminal (dari folder `server/etc`):
```bash
node -e "import('bcryptjs').then(b => b.default.hash('passwordBaru', 10).then(h => console.log(h)))"
```

Lalu update di Supabase SQL Editor:
```sql
UPDATE users SET password = '<hash-baru>' WHERE email = 'admin@syncnu.app';
```

### Kuota Storage

Secara default kuota mengikuti kapasitas disk. Untuk membatasi, set di `.env`:
```env
STORAGE_QUOTA_GB=50
```

---

## Lisensi

MIT License — bebas digunakan dan dimodifikasi.
