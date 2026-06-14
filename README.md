# Syncnu — Cloud Drive Storage & Auto-Backup Client

Syncnu adalah aplikasi self-hosted cloud drive storage modern. Proyek ini menggabungkan performa tinggi backend **Golang (Go)**, fleksibilitas frontend **React (Web)**, dan integrasi desktop native menggunakan **Tauri v2 (React + Rust)** yang dilengkapi fitur **Auto Backup** secara real-time.

---

## 🚀 Fitur Utama

### 1. Aplikasi Desktop & Auto Backup (Baru!)
Aplikasi desktop Syncnu dibangun menggunakan **Tauri v2** dan **React/Rust**.
- **Auto Backup Folder**: Memantau folder lokal mana pun di komputer Anda secara real-time (ditenagai library monitoring Rust `notify`).
- **Real-Time Sync**: Setiap kali ada file baru, perubahan isi file, atau penghapusan file di folder lokal, perubahan tersebut langsung disinkronkan ke server Syncnu.
- **Chunked File Transfer**: Mengunggah file berukuran besar secara andal dengan membaginya menjadi beberapa potongan kecil (chunks) sebelum dikirim ke server.
- **Status Panel**: Indikator antarmuka desktop untuk melihat folder aktif yang dipantau dan status transfer file.

### 2. Manajemen File & Folder (Web & Desktop)
- **Upload Massal**: Upload file tunggal, multi-select, atau upload folder secara utuh dengan mempertahankan struktur direktori (drag & drop).
- **Preview Terintegrasi**: Review langsung dokumen PDF, gambar, video, musik, teks, atau kode pemrograman di browser/app.
- **Sampah & Pemulihan**: Hapus file ke tempat sampah (soft-delete), pulihkan file, atau hapus permanen.
- **Auto Purge**: Menghapus file sampah secara otomatis jika sudah berada di keranjang sampah lebih dari 7 hari.
- **Folder Kustom & Default**: Membuat folder sesuka hati dengan dukungan 4 folder bawaan sistem (**Dokumen**, **Gambar**, **Video**, **Musik**) yang memiliki validasi jenis file otomatis.
- **Sistem Aktivitas & Komentar**: Panel detail file untuk menambahkan komentar dan melihat log aktivitas file.

### 3. Autentikasi & Keamanan
- Registrasi dan login menggunakan email + password dengan token JWT.
- Akun admin bawaan untuk uji coba awal.

---

## 📦 Download Aplikasi Desktop (Windows)

Unduh installer aplikasi desktop Syncnu siap pakai untuk Windows (64-bit):

*   🚀 **[Download Syncnu Setup (.exe) — Rekomendasi](./installers/Syncnu_0.1.0_x64-setup.exe)**
    *   *Installer standar berbasis NSIS untuk proses instalasi yang cepat dan mudah.*
*   📦 **[Download Syncnu Installer (.msi)](./installers/Syncnu_0.1.0_x64_en-US.msi)**
    *   *Windows Installer (MSI) yang cocok untuk deploy korporat atau manajemen instalasi standar.*

---

## 🛠️ Stack Teknologi

| Komponen | Teknologi |
| :--- | :--- |
| **Backend Server** | Golang (Go), Net/HTTP, Supabase API client |
| **Frontend Web** | React 18, TypeScript, Vite, Tailwind CSS |
| **Desktop Client** | Tauri v2 (Rust Backend, React Frontend), `notify` crate untuk file watching |
| **Database** | Supabase (PostgreSQL) |
| **Auth** | JWT (JSON Web Token) |
| **Penyimpanan** | Disk Lokal (Server-side `/storage`) |
| **Monorepo** | npm workspaces + concurrently |

---

## 📁 Struktur Proyek

```text
Syncnu/
├── app/
│   ├── web/                  # Aplikasi Frontend Web (React + Vite)
│   │   ├── src/              # Kode utama UI Web
│   │   └── package.json
│   └── desktop/              # Aplikasi Desktop (Tauri v2)
│       ├── src/              # UI Desktop React (Setting backup folder)
│       ├── src-tauri/        # Backend Desktop Rust (File watcher, IPC bridge)
│       └── package.json
├── server/
│   └── etc/                  # Backend Go (Golang Server)
│       ├── main.go           # Entry point API
│       ├── chunking.go       # Logika chunk upload & reassembly
│       ├── handlers.go       # Endpoint API (Upload, Download, CRUD)
│       └── package.json      # NPM wrapper untuk script task
├── installers/               # Direktori rilis installer desktop (.exe, .msi)
├── storage/                  # Direktori penyimpanan file lokal (dibuat otomatis)
├── .env                      # Konfigurasi environment
├── package.json              # Konfigurasi root monorepo
└── install.sh                # Script installer & runner otomatis
```

---

## ⚙️ Cara Instalasi & Menjalankan Aplikasi

### Prasyarat
Sebelum menginstall, pastikan sistem Anda telah memiliki:
- **Node.js** v18+ — [nodejs.org](https://nodejs.org)
- **Golang** v1.20+ (untuk menjalankan/mengompilasi server backend Go) — [go.dev](https://go.dev)
- Akun **Supabase** gratis — [supabase.com](https://supabase.com)
- *(Opsional untuk Developer Desktop)* **Rust** compiler & toolchain — [rustup.rs](https://rustup.rs)

---

### A. Instalasi Otomatis (Linux / macOS / Git Bash Windows)

Kami menyediakan skrip instalasi satu-langkah `install.sh`. Skrip ini akan memandu Anda melakukan pemeriksaan prasyarat, membuat file konfigurasi `.env`, menyiapkan folder storage, menginstal dependensi, dan langsung menawarkan untuk menjalankan aplikasi secara instan.

1. Buka terminal atau Git Bash di direktori proyek:
   ```bash
   chmod +x install.sh
   ./install.sh
   ```
2. Ikuti panduan di layar untuk memasukkan kredensial Supabase Anda.
3. Di akhir skrip, pilih **Y** ketika ditanya untuk langsung menjalankan aplikasi.

---

### B. Instalasi Manual

#### 1. Setup Database Supabase
1. Buka [Supabase Dashboard](https://supabase.com/dashboard) dan buat proyek baru.
2. Masuk ke menu **SQL Editor**.
3. Salin seluruh isi berkas [schema.sql](file:///c:/Users/INU/Documents/app/Syncnu/server/database/schema.sql) dan klik **Run**.
4. Tunggu hingga tabel, trigger, dan sample data selesai dibuat.

#### 2. Konfigurasi File `.env`
Buat file bernama `.env` pada root direktori proyek dengan konten berikut:
```env
REACT_APP_SUPABASE_URL=https://<project-ref>.supabase.co
REACT_APP_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
PORT=8888
PORT_BACKEND=8889
JWT_SECRET=gunakan_string_acak_yang_panjang_dan_aman
```
*Dapatkan detail kunci API di: **Supabase Dashboard → Project Settings → API**.*

#### 3. Instalasi Dependensi
Jalankan perintah berikut di root folder proyek:
```bash
npm install
```
*Ini akan menginstal seluruh pustaka node di seluruh workspace monorepo.*

#### 4. Menjalankan Server & Aplikasi Web
**Mode Development (dengan Auto-Reload):**
```bash
npm run dev
```
*Aplikasi web akan tersedia di [http://localhost:8888](http://localhost:8888) dan API backend di [http://localhost:8889](http://localhost:8889).*

**Mode Production:**
```bash
npm run build
npm run start
```

---

### C. Menjalankan Aplikasi Desktop (Mode Developer)

Untuk menjalankan dan mengembangkan aplikasi desktop Tauri secara lokal:
1. Masuk ke folder desktop client:
   ```bash
   cd app/desktop
   ```
2. Jalankan mode development Tauri:
   ```bash
   npm run tauri dev
   ```
3. Untuk mem-build installer desktop produksi:
   ```bash
   npm run tauri build
   ```

---

## 🔑 Akun Login Bawaan

Untuk masuk pertama kali, Anda dapat menggunakan akun admin dummy yang otomatis tersedia:
- **Email**: `admin@syncnu.app`
- **Password**: `admin123`

*Disarankan untuk segera mengganti password admin Anda demi keamanan.*

---

## 📄 Lisensi
Proyek ini dilisensikan di bawah **MIT License**.
